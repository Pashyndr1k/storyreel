import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { videoDims, saveToLocalOutputs } from '../lib/comfy.js';
import { blockForScene, defaultTrim, transitionFor, overlapSeconds } from '../lib/dynamics.js';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { Play, StopSq, Grip, Download } from '../components/icons.jsx';

// Manual transition overrides pick from these; 'auto' defers to the dynamics
// transition matrix. Actions mirror smart_editor_assembly_logic.json; the
// ffmpeg field maps each semantic cut to an xfade transition + duration.
const CUT_TYPES = [
  'auto',
  'smash_cut',
  'match_action_cut',
  'directional_crossfade',
  'soft_cut',
  'rest_cut',
  'dissolve',
  'dip_to_black',
  'dip_to_white',
  'wipe_left',
  'slide_left',
  'circle_open',
  'whip_pan',
];
const CUT_ACTIONS = {
  smash_cut: { transition_type: 'smash_cut', audio_bridge: 'j_cut', overlap_frames: 0 },
  match_action_cut: { transition_type: 'match_action_cut', audio_bridge: 'none', overlap_frames: 0 },
  directional_crossfade: { transition_type: 'directional_crossfade', audio_bridge: 'l_cut', overlap_frames: 12 },
  soft_cut: { transition_type: 'soft_cut', audio_bridge: 'l_cut', overlap_frames: 0 },
  rest_cut: { transition_type: 'rest_cut', audio_bridge: 'l_cut', overlap_frames: 0 },
  dissolve: { transition_type: 'dissolve', audio_bridge: 'l_cut', overlap_frames: 12 },
  dip_to_black: { transition_type: 'dip_to_black', audio_bridge: 'none', overlap_frames: 15 },
  dip_to_white: { transition_type: 'dip_to_white', audio_bridge: 'none', overlap_frames: 12 },
  wipe_left: { transition_type: 'wipe_left', audio_bridge: 'none', overlap_frames: 10 },
  slide_left: { transition_type: 'slide_left', audio_bridge: 'none', overlap_frames: 10 },
  circle_open: { transition_type: 'circle_open', audio_bridge: 'none', overlap_frames: 12 },
  whip_pan: { transition_type: 'whip_pan', audio_bridge: 'j_cut', overlap_frames: 6 },
};
const CUT_ABBR = {
  smash_cut: 'SM',
  match_action_cut: 'MA',
  directional_crossfade: 'XF',
  soft_cut: 'SO',
  rest_cut: 'RE',
  dissolve: 'DS',
  dip_to_black: 'DB',
  dip_to_white: 'DW',
  wipe_left: 'WP',
  slide_left: 'SL',
  circle_open: 'CO',
  whip_pan: 'WH',
};
// ffmpeg xfade mapping ('cut' = frame-exact concat).
const CUT_FFMPEG = {
  smash_cut: { xfade: 'cut' },
  match_action_cut: { xfade: 'cut' },
  directional_crossfade: { xfade: 'smoothleft', dur: 0.48 },
  soft_cut: { xfade: 'fade', dur: 0.3 },
  rest_cut: { xfade: 'fadeblack', dur: 0.5 },
  dissolve: { xfade: 'dissolve', dur: 0.5 },
  dip_to_black: { xfade: 'fadeblack', dur: 0.6 },
  dip_to_white: { xfade: 'fadewhite', dur: 0.5 },
  wipe_left: { xfade: 'wipeleft', dur: 0.4 },
  slide_left: { xfade: 'slideleft', dur: 0.4 },
  circle_open: { xfade: 'circleopen', dur: 0.5 },
  whip_pan: { xfade: 'slideleft', dur: 0.24 },
};

// Timeline zoom: 'fit' stretches the whole assembly to the pane width (good for
// short stories); a numeric value is pixels-per-second, which makes the track
// wider than the pane so it scrolls — keeping individual shots operable in long
// stories with tens or hundreds of shots.
const SCALES = [10, 20, 40, 80, 160]; // px per second
const ZOOM_STEPS = ['fit', ...SCALES];
const MIN_CLIP_PX = 48; // a shot narrower than this is hard to grab

// Below 13 shots the fit view stays comfortable; past that, auto-zoom to a
// scale that keeps even the shortest shot at least MIN_CLIP_PX wide.
function defaultScale(project) {
  const shots = (project.outline || []).flatMap((s) => project.sceneDetails?.[s.id]?.shots || []);
  if (shots.length <= 12) return 'fit';
  const minDur = Math.max(1, Math.min(...shots.map((s) => s.duration || 1)));
  return SCALES.find((s) => s >= MIN_CLIP_PX / minDur) || SCALES[SCALES.length - 1];
}

// Stage 6 — Final Assembly. The whole script becomes one timeline (same NLE
// design as the Stage-4 preview): every shot is a clip, grouped by scene.
// A shot's clip shows its generated video (preferred), else its first-frame
// image, else a numbered placeholder. Scenes and shots can be reordered by
// drag & drop and shot durations trimmed — all edits write back into the
// same outline/sceneDetails data the other stages use. The preview window
// above the timeline plays the assembly in real time, and "Render" records
// it to a .webm file (extra time beyond a clip's video stays black — frames
// are never stretched).
export default function Stage6({ project, update, settings }) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProg, setRenderProg] = useState(null);
  const [renderErr, setRenderErr] = useState('');
  const [renderDone, setRenderDone] = useState(null); // output file path (ffmpeg)
  const trackRef = useRef(null);
  const [trimId, setTrimId] = useState(null);
  const dragScene = useRef(null);
  const dragShot = useRef(null); // { sceneId, idx }
  const [overKey, setOverKey] = useState(null);
  const pvRef = useRef(null);
  const cancelRef = useRef(false);
  const [scale, setScale] = useState(() => defaultScale(project));
  const scrollRef = useRef(null);
  const zoomed = scale !== 'fit';
  const zoomIdx = ZOOM_STEPS.indexOf(scale);
  const zoomOut = () => zoomIdx > 0 && setScale(ZOOM_STEPS[zoomIdx - 1]);
  const zoomIn = () => zoomIdx < ZOOM_STEPS.length - 1 && setScale(ZOOM_STEPS[zoomIdx + 1]);

  // Flat assembly sequence in scene order, enriched with the Action Dynamics
  // Plan: each shot carries its rhythm block, its head/tail trim (the 20-frame
  // rule, or a manual override), and the transition into the next shot.
  const scenes = project.outline.map((scene, si) => {
    const block = blockForScene(project.dynamicsPlan, si + 1);
    return {
      scene,
      block,
      shots: (project.sceneDetails[scene.id]?.shots || []).map((shot) => {
        const video = (project.shotVideos || {})[shot.id] || null;
        const raw = (project.videoGenDurations || {})[shot.id] || 0;
        const trim = video
          ? (project.shotTrims || {})[shot.id] || defaultTrim(shot.duration || 0, raw)
          : { head: 0, tail: 0 };
        return {
          shot,
          block,
          video,
          raw,
          trim,
          image: (project.shotImages || {})[shot.id] || null,
        };
      }),
    };
  });
  const items = scenes.flatMap((g) => g.shots.map((it) => ({ ...it, sceneId: g.scene.id })));

  // Transition INTO the next item, per item index (last item has none).
  const cutFor = (idx) => {
    if (idx >= items.length - 1) return null;
    const override = (project.shotTransitions || {})[items[idx].shot.id];
    if (override && override !== 'auto' && CUT_ACTIONS[override]) {
      return { ...CUT_ACTIONS[override], overridden: true };
    }
    return { ...transitionFor(items[idx].block, items[idx + 1].block), overridden: false };
  };

  // Transition picker: clicking a cut badge opens a menu with every technique.
  const [cutMenu, setCutMenu] = useState(null); // { idx, x, y }
  const openCutMenu = (idx, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCutMenu({ idx, x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 6 });
  };
  const pickCut = (idx, type) => {
    update((p) => ({
      shotTransitions: { ...(p.shotTransitions || {}), [items[idx].shot.id]: type },
    }));
    setCutMenu(null);
  };

  const setTrim = (shotId, patch) => {
    const it = items.find((x) => x.shot.id === shotId);
    if (!it) return;
    const slack = Math.max(0, (it.raw || 0) - (it.shot.duration || 0));
    const cur = it.trim;
    const next = { ...cur, ...patch };
    next.head = Math.max(0, Math.min(2, Math.round(next.head * 100) / 100));
    next.tail = Math.max(0, Math.min(2, Math.round(next.tail * 100) / 100));
    if (next.head + next.tail > slack) return; // can't trim more than the padding
    update((p) => ({ shotTrims: { ...(p.shotTrims || {}), [shotId]: next } }));
  };
  const total = items.reduce((a, it) => a + (it.shot.duration || 0), 0);
  const startOf = (idx) => items.slice(0, idx).reduce((a, it) => a + (it.shot.duration || 0), 0);

  // current item under the playhead
  let curIdx = 0;
  {
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      if (elapsed < acc + (items[i].shot.duration || 0)) {
        curIdx = i;
        break;
      }
      acc += items[i].shot.duration || 0;
      curIdx = i;
    }
  }
  const cur = items[curIdx];
  const curOffset = elapsed - startOf(curIdx);

  // playback clock (same pattern as the Stage-4 timeline)
  useEffect(() => {
    if (!playing || total <= 0) return;
    const start = elapsed;
    const t0 = performance.now();
    const iv = setInterval(() => {
      const e = start + (performance.now() - t0) / 1000;
      if (e >= total) {
        setPlaying(false);
        setElapsed(0);
      } else {
        setElapsed(e);
      }
    }, 80);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  // Preview video element follows the playhead: (re)start it when the current
  // clip changes; a video shorter than its clip goes black via onEnded.
  // The element remounts per clip (key), so the seek must wait for metadata —
  // seeking/playing a not-yet-loaded element is what froze playback on the
  // first frame when clips changed mid-sequence.
  const curShotId = cur?.shot.id;
  useEffect(() => {
    setVideoEnded(false);
    const v = pvRef.current;
    if (!v) return;
    if (playing && cur?.video) {
      const target = (cur.trim?.head || 0) + Math.max(0, curOffset);
      const seekPlay = () => {
        try {
          v.currentTime = target;
        } catch {
          /* not seekable */
        }
        // Unmuted play can be rejected (autoplay policy) or silently stall —
        // this is what froze sequences on the first frame. Muted playback
        // beats a frozen frame, so fall back rather than give up.
        const p = v.play();
        if (p?.catch) {
          p.catch(() => {
            v.muted = true;
            v.play().catch(() => {});
          });
        }
      };
      if (v.readyState >= 1) seekPlay();
      else v.addEventListener('loadedmetadata', seekPlay, { once: true });
      // Watchdog: if the clip still isn't running shortly after, force it.
      const dog = setTimeout(() => {
        if (v.paused || v.currentTime <= target + 0.05) {
          v.muted = v.muted || v.paused;
          v.play().catch(() => {});
        }
      }, 700);
      return () => {
        v.removeEventListener('loadedmetadata', seekPlay);
        clearTimeout(dog);
      };
    }
    v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, curShotId]);

  // ---- write-backs (shared source of truth with Stages 3–5) ----------------
  const moveScene = (from, to) =>
    update((p) => {
      const next = [...p.outline];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { outline: next };
    });

  const moveShot = (sceneId, from, to) =>
    update((p) => {
      const shots = [...(p.sceneDetails[sceneId]?.shots || [])];
      const [moved] = shots.splice(from, 1);
      shots.splice(to, 0, moved);
      return { sceneDetails: { ...p.sceneDetails, [sceneId]: { shots } } };
    });

  const clampDur = (d) => Math.max(2, Math.min(10, d));
  const setShotDuration = (sceneId, shotId, d) =>
    update((p) => ({
      sceneDetails: {
        ...p.sceneDetails,
        [sceneId]: {
          shots: (p.sceneDetails[sceneId]?.shots || []).map((s) =>
            s.id === shotId ? { ...s, duration: clampDur(d) } : s
          ),
        },
      },
    }));

  const nudge = (delta) => {
    const it = items.find((x) => x.shot.id === selectedId);
    if (!it) return;
    setShotDuration(it.sceneId, it.shot.id, clampDur(Math.round(((it.shot.duration || 0) + delta) * 2) / 2));
  };

  // Effective pixels-per-second: the fixed zoom scale, or (in fit mode) the
  // measured track width divided by the total duration.
  const pxPerSec = () => (zoomed ? scale : trackRef.current ? trackRef.current.clientWidth / total : 0);

  // Edge-trim with pointer capture (same interaction as the Stage-4 timeline).
  const startTrim = (e, it) => {
    if (total <= 0) return;
    const pps = pxPerSec();
    if (!pps) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startDur = it.shot.duration || 1;
    setPlaying(false);
    setTrimId(it.shot.id);
    setSelectedId(it.shot.id);
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    let curD = startDur;
    const move = (ev) => {
      const raw = startDur + (ev.clientX - startX) / pps;
      const next = clampDur(Math.round(raw * 2) / 2);
      if (next !== curD) {
        curD = next;
        setShotDuration(it.sceneId, it.shot.id, next);
      }
    };
    const up = (ev) => {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* released */
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setTrimId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // While playing a zoomed timeline, scroll to keep the playhead in view.
  useEffect(() => {
    if (!zoomed || !scrollRef.current) return;
    const el = scrollRef.current;
    const x = elapsed * scale;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [elapsed, zoomed, scale]);

  // ---- render to a video file ----------------------------------------------
  const blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(blob);
    });

  // FFmpeg engine (Electron): frame-exact assembly in the main process — no
  // realtime capture, no playback stalls, H.264 mp4 out, full xfade palette.
  const doRenderFfmpeg = async () => {
    if (rendering || total <= 0) return;
    setRendering(true);
    setRenderErr('');
    setRenderDone(null);
    setPlaying(false);
    const [w, h] = videoDims(project.aspectRatio || '16:9');
    const segments = items.map((it) => {
      if (it.video)
        return {
          kind: 'video',
          dataURL: it.video,
          trimStart: it.trim?.head || 0,
          duration: it.shot.duration || 0,
          tailSlack: it.trim?.tail || 0,
        };
      if (it.image) return { kind: 'image', dataURL: it.image, trimStart: 0, duration: it.shot.duration || 0, tailSlack: 0 };
      return { kind: 'black', trimStart: 0, duration: it.shot.duration || 0, tailSlack: 0 };
    });
    const transitions = items.slice(0, -1).map((_, i) => {
      const c = cutFor(i);
      return CUT_FFMPEG[c?.transition_type] || { xfade: 'cut' };
    });
    const safe = (project.title || 'storyreel').replace(/[^\w\d\- ]+/g, '').trim().replace(/\s+/g, '-') || 'storyreel';
    const outDir = (settings.comfyOutputDir || '').replace(/[\\/]+$/, '');
    const outPath = `${outDir || '.'}/${safe}-final.mp4`;
    const off = window.ffmpegBridge.onProgress((p) =>
      setRenderProg({ pct: Math.min(100, Math.round((p.sec / (p.total || 1)) * 100)) })
    );
    try {
      const res = await window.ffmpegBridge.render({ width: w, height: h, fps: 25, segments, transitions, outPath });
      if (res?.ok) setRenderDone(res.path);
      else if (!res?.canceled) setRenderErr(res?.error || 'ffmpeg failed');
    } catch (e) {
      setRenderErr(String(e?.message || e));
    } finally {
      off?.();
      setRendering(false);
      setRenderProg(null);
    }
  };

  const doRender = async () => {
    if (window.ffmpegBridge?.render) return doRenderFfmpeg();
    if (rendering || total <= 0) return;
    setRendering(true);
    setRenderErr('');
    setRenderDone(null);
    setPlaying(false);
    cancelRef.current = false;
    const [w, h] = videoDims(project.aspectRatio || '16:9');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // Two work video elements (crossfades need both clips alive at once), each
    // routed through its own gain node into the recording — the gains implement
    // the J-cut / L-cut audio bridges from the assembly rules.
    const vids = [document.createElement('video'), document.createElement('video')];
    vids.forEach((v) => {
      v.muted = false;
      v.playsInline = true;
    });
    const slotOf = (i) => i % 2;
    let ac = null;
    const gains = [null, null];
    const mediaSrcs = [];
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      vids.forEach((v, i) => {
        const src = ac.createMediaElementSource(v);
        const g = ac.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(dest);
        gains[i] = g;
        mediaSrcs.push(src);
      });
      const track = dest.stream.getAudioTracks()[0];
      if (track) stream.addTrack(track);
    } catch {
      /* silent render */
    }

    const mime = window.MediaRecorder?.isTypeSupported?.('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    } catch (e) {
      setRenderErr(String(e.message || e));
      setRendering(false);
      return;
    }
    const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => {
      rec.onstop = r;
    });
    rec.start(500);

    const paint = (el, iw, ih, alpha) => {
      if (!el || !iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      ctx.globalAlpha = alpha;
      ctx.drawImage(el, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
      ctx.globalAlpha = 1;
    };

    // ---- assembly schedule --------------------------------------------------
    // Each segment keeps the timeline duration; trims select the played window
    // of the raw clip; crossfades borrow their material from the trimmed
    // regions, so the film's timing never shifts.
    const segs = [];
    {
      let acc = 0;
      items.forEach((it, i) => {
        const dur = it.shot.duration || 0;
        const cut = i < items.length - 1 ? cutFor(i) : null;
        segs.push({ it, i, t0: acc, t1: acc + dur, cut, ov: 0, lead: 0 });
        acc += dur;
      });
      segs.forEach((s, i) => {
        if (!s.cut) return;
        const next = segs[i + 1];
        const nextHead = next.it.video ? next.it.trim?.head || 0 : 0;
        const curTail = s.it.video ? s.it.trim?.tail || 0 : 0;
        if (s.cut.transition_type === 'directional_crossfade') {
          s.ov = Math.min(overlapSeconds(s.cut), nextHead, s.t1 - s.t0);
        }
        if (s.cut.audio_bridge === 'j_cut') s.lead = Math.min(0.4, nextHead);
        else if (s.cut.audio_bridge === 'l_cut') s.lead = Math.min(0.4, curTail, next.t1 - next.t0);
      });
    }

    const imgCache = {};
    const getImg = (src) =>
      imgCache[src] ||
      (imgCache[src] = (() => {
        const im = new Image();
        im.src = src;
        return im;
      })());

    const prepare = (i) =>
      new Promise((res) => {
        const it = segs[i]?.it;
        if (!it) return res();
        if (it.video) {
          const v = vids[slotOf(i)];
          if (v.src === it.video && v.readyState >= 2) return res();
          v.src = it.video;
          v.onloadeddata = () => res();
          v.onerror = () => res();
        } else {
          if (it.image) getImg(it.image);
          res();
        }
      });

    // Audio gain envelope for segment i's clip at absolute time tt.
    const gainAt = (i, tt) => {
      const s = segs[i];
      if (!s?.it.video) return 0;
      let g = tt >= s.t0 && tt < s.t1 ? 1 : 0;
      const prev = segs[i - 1];
      if (prev?.cut && prev.lead > 0) {
        if (prev.cut.audio_bridge === 'j_cut' && tt >= prev.t1 - prev.lead && tt < prev.t1) g = (tt - (prev.t1 - prev.lead)) / prev.lead;
        if (prev.cut.audio_bridge === 'l_cut' && tt >= prev.t1 && tt < prev.t1 + prev.lead) g = Math.min(g, (tt - prev.t1) / prev.lead);
      }
      if (s.cut && s.lead > 0) {
        if (s.cut.audio_bridge === 'j_cut' && tt >= s.t1 - s.lead && tt < s.t1) g = Math.min(g, 1 - (tt - (s.t1 - s.lead)) / s.lead);
        if (s.cut.audio_bridge === 'l_cut' && tt >= s.t1 && tt < s.t1 + s.lead) g = 1 - (tt - s.t1) / s.lead;
      }
      return Math.max(0, Math.min(1, g));
    };

    const drawSeg = (i, mediaTime, alpha) => {
      const it = segs[i].it;
      if (it.video) {
        const v = vids[slotOf(i)];
        paint(v, v.videoWidth, v.videoHeight, alpha);
      } else if (it.image) {
        const im = getImg(it.image);
        paint(im, im.naturalWidth, im.naturalHeight, alpha);
      }
      // placeholder: black stays
    };

    try {
      await prepare(0);
      const startWall = performance.now();
      const tNow = () => (performance.now() - startWall) / 1000;
      let cur = -1;
      const started = new Set(); // segments whose video was started (incl. pre-rolls)
      const pauses = []; // { at, slot } deferred pauses for l-cut lingering audio

      const startVideo = (i, mediaOffset) => {
        const it = segs[i].it;
        if (!it.video || started.has(i)) return;
        started.add(i);
        const v = vids[slotOf(i)];
        try {
          v.currentTime = Math.max(0, mediaOffset);
        } catch {
          /* not seekable yet */
        }
        v.play().catch(() => {});
      };

      // setTimeout, not requestAnimationFrame: rAF throttles/stalls in a
      // backgrounded window and would freeze a long render mid-way.
      await new Promise((finish) => {
        const step = () => {
          const tt = tNow();
          if (cancelRef.current || tt >= total) return finish();

          // segment switching (+ deferred pause of the outgoing clip)
          while (cur < segs.length - 1 && tt >= (cur < 0 ? 0 : segs[cur].t1)) {
            if (cur >= 0) {
              const out = segs[cur];
              const linger = out.cut?.audio_bridge === 'l_cut' ? out.lead : 0;
              if (out.it.video) pauses.push({ at: out.t1 + linger, slot: slotOf(cur), seg: cur });
            }
            cur++;
            setRenderProg({ a: cur + 1, b: segs.length });
            const s = segs[cur];
            if (s.it.video && !started.has(cur)) startVideo(cur, (s.it.trim?.head || 0) + (tt - s.t0));
            if (cur < segs.length - 1) prepare(cur + 1);
          }
          const s = segs[cur];

          // pre-roll the next clip for crossfade video / j-cut audio
          if (s.cut && cur < segs.length - 1) {
            const pre = Math.max(s.ov, s.cut.audio_bridge === 'j_cut' ? s.lead : 0);
            if (pre > 0 && tt >= s.t1 - pre && !started.has(cur + 1)) {
              const nit = segs[cur + 1].it;
              startVideo(cur + 1, (nit.trim?.head || 0) - pre);
            }
          }

          // deferred pauses (after l-cut audio lingering ends)
          for (let k = pauses.length - 1; k >= 0; k--) {
            if (tt >= pauses[k].at) {
              vids[pauses[k].slot].pause();
              pauses.splice(k, 1);
            }
          }

          // audio gains
          if (ac) {
            for (let sl = 0; sl < 2; sl++) {
              let g = 0;
              for (let i = Math.max(0, cur - 1); i <= Math.min(segs.length - 1, cur + 1); i++) {
                if (slotOf(i) === sl) g = Math.max(g, gainAt(i, tt));
              }
              gains[sl].gain.value = g;
            }
          }

          // draw: base black, current clip, crossfade overlay of the incoming clip
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          const v = segs[cur].it.video ? vids[slotOf(cur)] : null;
          const pastEnd = v && v.ended;
          if (!pastEnd) drawSeg(cur, 0, 1);
          if (s.cut && s.ov > 0 && tt >= s.t1 - s.ov && cur < segs.length - 1) {
            drawSeg(cur + 1, 0, (tt - (s.t1 - s.ov)) / s.ov);
          }

          setTimeout(step, 33);
        };
        step();
      });
    } finally {
      rec.stop();
      await stopped;
      vids.forEach((v) => v.pause());
      try {
        mediaSrcs.forEach((m) => m.disconnect());
        if (ac) ac.close();
      } catch {
        /* done */
      }
    }

    if (!cancelRef.current && chunks.length) {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const safe = (project.title || 'storyreel').replace(/[^\w\d\- ]+/g, '').trim().replace(/\s+/g, '-') || 'storyreel';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}-final.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      try {
        saveToLocalOutputs(settings, `${safe}-final.webm`, await blobToDataURL(blob));
      } catch {
        /* local copy is best-effort */
      }
    }
    setRendering(false);
    setRenderProg(null);
  };

  if (!items.length) {
    return (
      <section className="stage">
        <h2>{t('s6.title')}</h2>
        <div className="note warn">{t('s6.empty')}</div>
      </section>
    );
  }

  const seconds = Math.max(1, Math.ceil(total));
  const labelEvery = zoomed
    ? Math.max(1, Math.ceil(40 / scale))
    : seconds > 120 ? 10 : seconds > 40 ? 5 : 1;
  const showPlayhead = total > 0 && (playing || elapsed > 0);
  const selected = items.find((x) => x.shot.id === selectedId);
  const innerWidth = zoomed ? seconds * scale : undefined; // px in zoom mode

  return (
    <section className="stage">
      <h2>{t('s6.title')}</h2>
      <p className="stage-desc">{t('s6.desc')}</p>
      <DynamicsVisualizer plan={project.dynamicsPlan} playhead={playing || elapsed > 0 ? elapsed : null} defaultOpen />

      <div className="asm-preview">
        {cur?.video && !videoEnded ? (
          <video key={cur.shot.id} ref={pvRef} src={cur.video} preload="auto" onEnded={() => setVideoEnded(true)} playsInline />
        ) : cur?.video && videoEnded && playing ? (
          <div className="asm-blank" />
        ) : cur?.image ? (
          <img src={cur.image} alt="" />
        ) : (
          <div className="asm-blank">{cur ? t('s4.shot', { n: curIdx + 1 }) : ''}</div>
        )}
        {/* warm the decoder for the next clip so the boundary switch doesn't stall */}
        {playing && items[curIdx + 1]?.video && (
          <video key={`pre-${items[curIdx + 1].shot.id}`} src={items[curIdx + 1].video} preload="auto" muted playsInline style={{ display: 'none' }} />
        )}
      </div>

      <div className="nle">
       <div className={`nle-scroll ${zoomed ? 'zoomed' : ''}`} ref={scrollRef}>
        <div className="nle-inner" style={zoomed ? { width: innerWidth } : undefined}>
        <div className="nle-ruler">
          {Array.from({ length: seconds }, (_, i) => (
            <div key={i} className="nle-cell" style={zoomed ? { flex: 'none', width: scale } : undefined}><span>{i % labelEvery === 0 ? `${i}s` : ''}</span></div>
          ))}
        </div>
        <div className="nle-track asm-track" ref={trackRef}>
          {scenes.map((g, gi) => {
            const sceneDur = g.shots.reduce((a, it) => a + (it.shot.duration || 0), 0);
            return (
            <div
              key={g.scene.id}
              className={`asm-scene ${overKey === `scene-${gi}` ? 'drag-over' : ''}`}
              style={zoomed ? { flex: 'none', width: Math.max(1, sceneDur) * scale } : { flexGrow: Math.max(0.5, sceneDur) }}
              onDragOver={(e) => {
                if (dragScene.current === null) return;
                e.preventDefault();
                if (overKey !== `scene-${gi}`) setOverKey(`scene-${gi}`);
              }}
              onDragLeave={() => setOverKey((v) => (v === `scene-${gi}` ? null : v))}
              onDrop={(e) => {
                if (dragScene.current === null) return;
                e.preventDefault();
                setOverKey(null);
                const from = dragScene.current;
                dragScene.current = null;
                if (from !== gi) moveScene(from, gi);
              }}
            >
              <div
                className="asm-scene-label"
                title={t('s6.dragScene')}
                draggable={trimId === null}
                onDragStart={(e) => {
                  dragScene.current = gi;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `scene-${gi}`);
                }}
                onDragEnd={() => {
                  dragScene.current = null;
                  setOverKey(null);
                }}
              >
                <Grip size={12} />
                <span>{gi + 1}. {g.scene.title || t('s4.untitled')}</span>
              </div>
              <div className="asm-clips">
                {g.shots.map((it, si) => {
                  const globalIdx = items.findIndex((x) => x.shot.id === it.shot.id);
                  return (
                    <div
                      key={it.shot.id}
                      className={`nle-clip ${selectedId === it.shot.id ? 'selected' : ''} ${overKey === `shot-${it.shot.id}` ? 'drag-over' : ''} ${trimId === it.shot.id ? 'trimming' : ''}`}
                      style={zoomed ? { flex: 'none', width: (it.shot.duration || 1) * scale } : { flexGrow: Math.max(0.5, it.shot.duration || 1) }}
                      title={`${globalIdx + 1} · ${it.shot.duration}s · ${it.shot.shotType || ''}`}
                      draggable={trimId === null}
                      onClick={() => {
                        setSelectedId(it.shot.id);
                        setElapsed(startOf(globalIdx));
                      }}
                      onDragStart={(e) => {
                        if (trimId !== null) {
                          e.preventDefault();
                          return;
                        }
                        e.stopPropagation();
                        dragShot.current = { sceneId: g.scene.id, idx: si };
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', it.shot.id);
                      }}
                      onDragEnd={() => {
                        dragShot.current = null;
                        setOverKey(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragShot.current || dragShot.current.sceneId !== g.scene.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (overKey !== `shot-${it.shot.id}`) setOverKey(`shot-${it.shot.id}`);
                      }}
                      onDragLeave={() => setOverKey((v) => (v === `shot-${it.shot.id}` ? null : v))}
                      onDrop={(e) => {
                        if (!dragShot.current || dragShot.current.sceneId !== g.scene.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setOverKey(null);
                        const from = dragShot.current.idx;
                        dragShot.current = null;
                        if (from !== si) moveShot(g.scene.id, from, si);
                      }}
                    >
                      {it.video ? (
                        <video src={it.video} muted preload="metadata" />
                      ) : it.image ? (
                        <img src={it.image} alt="" draggable={false} />
                      ) : (
                        <span className="nle-clip-num">{globalIdx + 1}</span>
                      )}
                      <span className="nle-dur">{Number(it.shot.duration || 0).toFixed(1)}s</span>
                      <span
                        className="nle-trim"
                        title={t('sb.trim')}
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => startTrim(e, { ...it, sceneId: g.scene.id })}
                      />
                      {it.trim?.head > 0 && (
                        <span className="clip-trim-mark head" title={`−${it.trim.head.toFixed(2)}s`} />
                      )}
                      {it.trim?.tail > 0 && (
                        <span className="clip-trim-mark tail" title={`−${it.trim.tail.toFixed(2)}s`} />
                      )}
                      {globalIdx < items.length - 1 &&
                        (() => {
                          const c = cutFor(globalIdx);
                          return (
                            <button
                              type="button"
                              className={`cut-badge ${c.overridden ? 'ovr' : ''}`}
                              title={`${t('cut.tip')}: ${t(`cut.${c.transition_type}`)}${c.audio_bridge !== 'none' ? ` · ${c.audio_bridge.replace('_', '-')}` : ''}`}
                              draggable={false}
                              onClick={(e) => {
                                e.stopPropagation();
                                openCutMenu(globalIdx, e);
                              }}
                              onDragStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              {CUT_ABBR[c.transition_type] || 'A'}
                            </button>
                          );
                        })()}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
        {showPlayhead && (
          <div
            className="nle-playhead"
            style={zoomed ? { left: elapsed * scale } : { left: `${Math.min(100, (elapsed / total) * 100)}%` }}
          >
            <span className="nle-playhead-cap" />
          </div>
        )}
        </div>
       </div>
      </div>

      <div className="nle-footer">
        <span>{t('s6.caption', { s: scenes.length, n: items.length })}</span>
        <span className="nle-nudge nle-scale" title={zoomed ? t('s6.scrollHint') : ''}>
          {t('s6.scale')}
          <button type="button" title={t('s6.zoomOut')} aria-label={t('s6.zoomOut')} disabled={zoomIdx === 0} onClick={zoomOut}>
            −
          </button>
          <select
            className="zoom-select"
            value={String(scale)}
            onChange={(e) => setScale(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
          >
            <option value="fit">{t('s6.fit')}</option>
            {SCALES.map((s) => (
              <option key={s} value={s}>{s} px/s</option>
            ))}
          </select>
          <button type="button" title={t('s6.zoomIn')} aria-label={t('s6.zoomIn')} disabled={zoomIdx === ZOOM_STEPS.length - 1} onClick={zoomIn}>
            +
          </button>
        </span>
        {selected && (
          <span className="nle-nudge">
            {t('s4.shot', { n: items.findIndex((x) => x.shot.id === selectedId) + 1 })}
            <button type="button" title={t('sb.shorter')} disabled={(selected.shot.duration || 0) <= 2} onClick={() => nudge(-0.5)}>
              −0.5s
            </button>
            <button type="button" title={t('sb.longer')} disabled={(selected.shot.duration || 0) >= 10} onClick={() => nudge(0.5)}>
              +0.5s
            </button>
          </span>
        )}
        {selected && selected.video && selected.raw > (selected.shot.duration || 0) + 0.2 && (
          <span className="nle-nudge" title={t('s6.trimTip')}>
            {t('s6.trimLbl')}
            <button type="button" title={t('s6.headTrim')} disabled={selected.trim.head <= 0} onClick={() => setTrim(selected.shot.id, { head: selected.trim.head - 0.2 })}>
              −
            </button>
            <i className="trim-val">{selected.trim.head.toFixed(1)}s</i>
            <button type="button" title={t('s6.headTrim')} onClick={() => setTrim(selected.shot.id, { head: selected.trim.head + 0.2 })}>
              +
            </button>
            ·
            <button type="button" title={t('s6.tailTrim')} disabled={selected.trim.tail <= 0} onClick={() => setTrim(selected.shot.id, { tail: selected.trim.tail - 0.2 })}>
              −
            </button>
            <i className="trim-val">{selected.trim.tail.toFixed(1)}s</i>
            <button type="button" title={t('s6.tailTrim')} onClick={() => setTrim(selected.shot.id, { tail: selected.trim.tail + 0.2 })}>
              +
            </button>
          </span>
        )}
        <span className="nle-timecode">{elapsed.toFixed(1).padStart(4, '0')} / {total.toFixed(1).padStart(4, '0')}s</span>
      </div>

      <div className="row">
        <button className="btn small primary" disabled={rendering || total <= 0} onClick={() => setPlaying((v) => !v)}>
          {playing ? <><StopSq size={14} /> {t('sb.stop')}</> : <><Play size={14} /> {t('sb.play')}</>}
        </button>
        <button className="btn small" disabled={rendering} onClick={doRender}>
          <Download size={14} /> {rendering ? t('s6.rendering') : t('s6.render')}
        </button>
        {rendering && (
          <>
            {renderProg && (
              <span className="total-badge">
                {renderProg.pct != null
                  ? t('s6.renderPct', { p: renderProg.pct })
                  : t('s6.renderProg', { a: renderProg.a, b: renderProg.b })}
              </span>
            )}
            <button
              className="btn small danger"
              onClick={() => {
                cancelRef.current = true;
                window.ffmpegBridge?.cancel?.();
              }}
            >
              {t('s6.cancel')}
            </button>
          </>
        )}
      </div>
      <p className="hint">{t(window.ffmpegBridge ? 's6.hintFfmpeg' : 's6.hint')}</p>
      {renderErr && <div className="note error">{renderErr}</div>}
      {renderDone && <div className="note ok-note">{t('s6.renderedTo', { p: renderDone })}</div>}

      {cutMenu && (
        <>
          <div className="cut-menu-backdrop" onClick={() => setCutMenu(null)} />
          <div className="cut-menu" style={{ left: cutMenu.x, top: cutMenu.y }}>
            {CUT_TYPES.map((ty) => {
              const cur = (project.shotTransitions || {})[items[cutMenu.idx]?.shot.id] || 'auto';
              return (
                <button
                  key={ty}
                  type="button"
                  className={`cut-menu-item ${cur === ty ? 'active' : ''}`}
                  onClick={() => pickCut(cutMenu.idx, ty)}
                >
                  <b>{ty === 'auto' ? '🎲' : CUT_ABBR[ty]}</b> {t(`cut.${ty}`)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
