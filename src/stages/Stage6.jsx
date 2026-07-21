import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { uid } from '../lib/storage.js';
import { videoDims, saveToLocalOutputs } from '../lib/comfy.js';
import { blockForScene, defaultTrim, transitionFor, overlapSeconds } from '../lib/dynamics.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { stage6SmartCutPrompt } from '../lib/prompts.js';
import { decodeMediaAudio, audioBufferToWavDataURL } from '../lib/audio.js';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { Play, StopSq, Grip, Download, Upload, Wand } from '../components/icons.jsx';

const readFileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

// Probe an audio file's duration via a detached <audio> element.
const probeAudioDuration = (dataURL) =>
  new Promise((res) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => res(0);
    a.src = dataURL;
  });

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
const REAL_CUTS = CUT_TYPES.filter((ty) => ty !== 'auto');
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

// Fixed width of the track-head gutter on the left of every timeline row
// (ruler spacer, V1 video head, A-n audio heads) — keeps the video and audio
// strips starting at the exact same timeline zero. Mirrors --nle-gut in CSS.
const NLE_GUT = 92;

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
// it to a file (extra time beyond a clip's video holds the clip's last
// frame, matching the ffmpeg render — frames are never stretched).
export default function Stage6({ project, update, settings }) {
  const { t, lang } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
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
  const [showScript, setShowScript] = useState(false); // voice-over script window
  const [showCuts, setShowCuts] = useState(false); // transitions reference table
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitNote, setSplitNote] = useState('');
  const [smartCut, setSmartCut] = useState(null); // { text, busy, err, result } | null

  // ---- audio timeline (layers of clips) -------------------------------------
  const layers = project.audioLayers || [];
  const [selAudio, setSelAudio] = useState(null); // { layerId, clipId }
  const audioRefs = useRef({}); // clipId -> <audio> element for preview playback
  const setLayers = (fn) => update((p) => ({ audioLayers: fn(p.audioLayers || []) }));
  const patchLayer = (layerId, patch) =>
    setLayers((Ls) => Ls.map((L) => (L.id === layerId ? { ...L, ...patch } : L)));
  const patchClip = (layerId, clipId, patch) =>
    setLayers((Ls) =>
      Ls.map((L) =>
        L.id === layerId
          ? { ...L, clips: L.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          : L
      )
    );
  const addLayer = () =>
    setLayers((Ls) => [...Ls, { id: uid(), name: `${t('s6.layer')} ${Ls.length + 1}`, enabled: true, volume: 1, clips: [] }]);
  const removeLayer = (layerId) => {
    setLayers((Ls) => Ls.filter((L) => L.id !== layerId));
    setSelAudio((s) => (s?.layerId === layerId ? null : s));
  };
  const removeClip = (layerId, clipId) => {
    setLayers((Ls) => Ls.map((L) => (L.id === layerId ? { ...L, clips: L.clips.filter((c) => c.id !== clipId) } : L)));
    setSelAudio((s) => (s?.clipId === clipId ? null : s));
  };
  // New clips land at the playhead position.
  const addClips = (layerId) => async (files) => {
    try {
      let at = Math.max(0, Math.min(elapsed, total));
      for (const file of files) {
        const dataURL = await readFileDataURL(file);
        const dur = Math.round((await probeAudioDuration(dataURL)) * 10) / 10;
        const clip = {
          id: uid(),
          name: (file.name || 'clip').replace(/\.[^.]+$/, '').slice(0, 30),
          dataURL,
          start: Math.round(at * 10) / 10,
          offset: 0,
          duration: dur || 1,
          srcDuration: dur || 1,
          fadeIn: 0,
          fadeOut: 0,
        };
        setLayers((Ls) => Ls.map((L) => (L.id === layerId ? { ...L, clips: [...L.clips, clip] } : L)));
        at += dur || 1;
      }
    } catch (e) {
      setRenderErr(String(e?.message || e));
    }
  };

  // Drag a clip body to move it, or its edges to trim (left edge shifts the
  // source offset, right edge changes the kept duration). Same pointer-capture
  // pattern as the video-clip trims.
  const startClipDrag = (e, layer, clip, mode) => {
    const pps = pxPerSec();
    if (!pps) return;
    e.preventDefault();
    e.stopPropagation();
    setSelAudio({ layerId: layer.id, clipId: clip.id });
    const handle = e.currentTarget;
    const x0 = e.clientX;
    const c0 = { ...clip };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }
    const move = (ev) => {
      const d = Math.round(((ev.clientX - x0) / pps) * 10) / 10;
      if (mode === 'move') {
        patchClip(layer.id, clip.id, { start: Math.max(0, Math.min(Math.max(0, total - 0.2), c0.start + d)) });
      } else if (mode === 'end') {
        const maxDur = c0.srcDuration > 0 ? c0.srcDuration - c0.offset : Number.POSITIVE_INFINITY;
        patchClip(layer.id, clip.id, { duration: Math.max(0.2, Math.min(maxDur, c0.duration + d)) });
      } else {
        // 'start' — trim the head: shift start+offset together, shrink duration
        const delta = Math.max(-c0.offset, Math.max(-c0.start, Math.min(c0.duration - 0.2, d)));
        patchClip(layer.id, clip.id, {
          start: c0.start + delta,
          offset: c0.offset + delta,
          duration: c0.duration - delta,
        });
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
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const zoomed = scale !== 'fit';
  const zoomIdx = ZOOM_STEPS.indexOf(scale);
  const zoomOut = () => zoomIdx > 0 && setScale(ZOOM_STEPS[zoomIdx - 1]);
  const zoomIn = () => zoomIdx < ZOOM_STEPS.length - 1 && setScale(ZOOM_STEPS[zoomIdx + 1]);

  // Flat assembly sequence in scene order, enriched with the Action Dynamics
  // Plan: each shot carries its rhythm block, its head/tail trim (the 15-frame
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
          muted: !!(project.shotMutes || {})[shot.id],
        };
      }),
    };
  });
  const items = scenes.flatMap((g) => g.shots.map((it) => ({ ...it, sceneId: g.scene.id })));

  // Transition types the user has kept in the trimmed list (all by default).
  // Explicit per-boundary overrides are always honored; the automatic picker
  // degrades a disabled pick to a plain match-action cut.
  const disabledCuts = new Set(project.disabledTransitions || []);
  const enabledCuts = REAL_CUTS.filter((ty) => !disabledCuts.has(ty));

  // Transition INTO the next item, per item index (last item has none).
  const cutFor = (idx) => {
    if (idx >= items.length - 1) return null;
    const override = (project.shotTransitions || {})[items[idx].shot.id];
    if (override && override !== 'auto' && CUT_ACTIONS[override]) {
      return { ...CUT_ACTIONS[override], overridden: true };
    }
    const auto = transitionFor(items[idx].block, items[idx + 1].block);
    if (disabledCuts.has(auto.transition_type)) {
      return { transition_type: 'match_action_cut', audio_bridge: 'none', overlap_frames: 0, overridden: false };
    }
    return { ...auto, overridden: false };
  };

  // Transition picker: clicking a cut badge opens a menu with every technique.
  const [cutMenu, setCutMenu] = useState(null); // { idx, x, y }
  // Per-lane options popover (name, volume, add clips, delete) — the lane
  // head itself stays compact like an NLE track header.
  const [laneMenu, setLaneMenu] = useState(null); // { layerId, x, y }
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
  // clip changes. A video shorter than its clip simply HOLDS ITS LAST FRAME
  // for the remainder (matching the ffmpeg render, which clones the last
  // frame — never a black gap, never the previous shot's frame).
  // The element remounts per clip (key), so the seek must wait for metadata —
  // seeking/playing a not-yet-loaded element is what froze playback on the
  // first frame when clips changed mid-sequence. Large data-URL videos can
  // take a while to load; the seek target is computed at SEEK time from the
  // live playhead so a late start lands in sync instead of at frame 0.
  const curShotId = cur?.shot.id;
  const playposRef = useRef({ start: 0, head: 0 });
  playposRef.current = { start: startOf(curIdx), head: cur?.trim?.head || 0 };
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  useEffect(() => {
    const v = pvRef.current;
    if (!v) return;
    if (playing && cur?.video) {
      const targetNow = () =>
        playposRef.current.head + Math.max(0, elapsedRef.current - playposRef.current.start);
      const seekPlay = () => {
        try {
          v.currentTime = targetNow();
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
      v.muted = !!cur.muted; // per-shot audio mute
      if (v.readyState >= 1) seekPlay();
      else v.addEventListener('loadedmetadata', seekPlay, { once: true });
      // Watchdogs: if the clip still isn't running shortly after (slow
      // data-URL load / stalled decode), retry — resynced to the playhead.
      const kick = () => {
        if (v.ended) return; // short clip finished — holding last frame is correct
        if (v.paused || Math.abs(v.currentTime - targetNow()) > 0.6) {
          try {
            v.currentTime = targetNow();
          } catch {
            /* not seekable yet */
          }
          v.muted = v.muted || v.paused;
          v.play().catch(() => {});
        }
      };
      const dog1 = setTimeout(kick, 700);
      const dog2 = setTimeout(kick, 2000);
      return () => {
        v.removeEventListener('loadedmetadata', seekPlay);
        clearTimeout(dog1);
        clearTimeout(dog2);
      };
    }
    v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, curShotId]);

  // Mute toggled while the clip is already on screen applies immediately.
  useEffect(() => {
    if (pvRef.current) pvRef.current.muted = !!cur?.muted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.muted, curShotId]);

  // Preview audio: the audio-timeline layers play in sync with the realtime
  // preview (this is what makes the music audible OUTSIDE the ffmpeg render).
  // Every tick keeps each enabled clip's element started/paused, resyncs on
  // drift > 0.35s (e.g. after clicking a clip mid-playback), and applies the
  // layer volume plus the clip's fade-in/out envelope.
  useEffect(() => {
    for (const L of layers) {
      const on = L.enabled !== false;
      for (const c of L.clips || []) {
        const el = audioRefs.current[c.id];
        if (!el) continue;
        const local = elapsed - c.start;
        const active = playing && on && local >= 0 && local < c.duration;
        if (active) {
          const target = (c.offset || 0) + local;
          if (Math.abs(el.currentTime - target) > 0.35) {
            try {
              el.currentTime = target;
            } catch {
              /* not seekable yet */
            }
          }
          let g = 1;
          if (c.fadeIn > 0 && local < c.fadeIn) g = local / c.fadeIn;
          if (c.fadeOut > 0 && local > c.duration - c.fadeOut) g = Math.min(g, (c.duration - local) / c.fadeOut);
          el.volume = Math.max(0, Math.min(1, (L.volume ?? 1) * g));
          if (el.paused) el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, playing, layers]);

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

  // Auto-split A/V: detach the audio track of every timeline video (generated
  // or uploaded) into clips on a dedicated audio lane — aligned to each shot's
  // slot and trim — and mute the video's own sound, exactly like unlinking
  // audio in a traditional NLE. Idempotent: already-split shots are skipped.
  const splitAV = async () => {
    if (splitBusy) return;
    setSplitBusy(true);
    setSplitNote('');
    try {
      const laneId = 'avsplit';
      const existing = layers.find((L) => L.id === laneId);
      const have = new Set((existing?.clips || []).map((c) => c.id));
      const newClips = [];
      const muteIds = [];
      let skipped = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.video) continue;
        const clipId = `av_${it.shot.id}`;
        if (have.has(clipId)) {
          skipped++;
          continue;
        }
        const buf = await decodeMediaAudio(it.video);
        if (!buf) continue; // no audio track in this video
        newClips.push({
          id: clipId,
          name: `${t('s4.shot', { n: i + 1 })}`,
          dataURL: audioBufferToWavDataURL(buf),
          start: startOf(i),
          offset: it.trim?.head || 0,
          duration: Math.min(it.shot.duration || 0, Math.max(0.1, buf.duration - (it.trim?.head || 0))),
          srcDuration: buf.duration,
          fadeIn: 0,
          fadeOut: 0,
        });
        muteIds.push(it.shot.id);
      }
      if (!newClips.length) {
        setSplitNote(t('s6.splitNone', { m: skipped }));
        return;
      }
      update((p) => {
        const Ls = [...(p.audioLayers || [])];
        const idx = Ls.findIndex((L) => L.id === laneId);
        if (idx >= 0) Ls[idx] = { ...Ls[idx], clips: [...Ls[idx].clips, ...newClips] };
        else Ls.push({ id: laneId, name: t('s6.splitLane'), enabled: true, volume: 1, clips: newClips });
        const mutes = { ...(p.shotMutes || {}) };
        for (const id of muteIds) mutes[id] = true;
        return { audioLayers: Ls, shotMutes: mutes };
      });
      setSplitNote(t('s6.splitDone', { n: newClips.length }));
    } finally {
      setSplitBusy(false);
    }
  };

  // Smart cut: Claude re-cuts the timeline per a plain-language instruction —
  // shot durations and transitions change (video content does not), voice-
  // locked shots keep their length, and shots that now need more footage than
  // was generated come back as regeneration warnings.
  const runSmartCut = async () => {
    const instruction = (smartCut?.text || '').trim();
    if (!instruction || smartCut?.busy) return;
    const keyErr = textKeyError(settings);
    if (keyErr) {
      setSmartCut((s) => ({ ...s, err: t('err.noKey') }));
      return;
    }
    setSmartCut((s) => ({ ...s, busy: true, err: '', result: null }));
    try {
      const rows = items.map((it, i) => {
        const sceneIdx = project.outline.findIndex((sc) => sc.id === it.sceneId);
        return {
          shot: i + 1,
          scene: sceneIdx + 1,
          scene_title: project.outline[sceneIdx]?.title || '',
          duration_sec: it.shot.duration || 0,
          material_sec: it.video ? Math.round((it.raw || it.shot.duration || 0) * 10) / 10 : null,
          voice_locked: !!(project.shotAudios || {})[it.shot.id],
          dialogue: !!(it.shot.dialogue || '').trim(),
          energy: it.block?.kinetic_energy_level ?? null,
          transition_to_next: i < items.length - 1 ? cutFor(i).transition_type : null,
          action: (it.shot.action || '').slice(0, 140),
        };
      });
      const data = await generateJSON(
        settings,
        stage6SmartCutPrompt(project, rows, instruction, [...enabledCuts], lang)
      );
      // Apply: durations (clamped, voice-locked shots protected app-side too)
      // and transitions (validated against the enabled list).
      const byIdx = new Map();
      for (const ch of data.shots || []) {
        const idx = (Number(ch.shot) || 0) - 1;
        if (idx >= 0 && idx < items.length) byIdx.set(idx, ch);
      }
      let durs = 0;
      let cuts = 0;
      update((p) => {
        const details = { ...p.sceneDetails };
        const trans = { ...(p.shotTransitions || {}) };
        byIdx.forEach((ch, idx) => {
          const it = items[idx];
          const locked = !!(p.shotAudios || {})[it.shot.id];
          const d = Number(ch.duration);
          if (!locked && Number.isFinite(d)) {
            const dur = Math.max(2, Math.min(10, Math.round(d * 10) / 10));
            if (dur !== (it.shot.duration || 0)) {
              details[it.sceneId] = {
                shots: (details[it.sceneId]?.shots || []).map((s) =>
                  s.id === it.shot.id ? { ...s, duration: dur } : s
                ),
              };
              durs++;
            }
          }
          const ty = String(ch.transition || '');
          if (ty === 'auto') {
            if (trans[it.shot.id]) {
              delete trans[it.shot.id];
              cuts++;
            }
          } else if (enabledCuts.includes(ty) && trans[it.shot.id] !== ty) {
            trans[it.shot.id] = ty;
            cuts++;
          }
        });
        return { sceneDetails: details, shotTransitions: trans };
      });
      const regen = (data.regenerate || [])
        .map((r) => ({
          shot: Number(r.shot) || 0,
          needed: Number(r.needed_sec) || null,
          reason: String(r.reason || ''),
        }))
        .filter((r) => r.shot >= 1 && r.shot <= items.length);
      setSmartCut((s) => ({
        ...s,
        busy: false,
        result: { durs, cuts, notes: String(data.notes || ''), regen },
      }));
    } catch (e) {
      setSmartCut((s) => ({ ...s, busy: false, err: e.message || String(e) }));
    }
  };

  // While playing a zoomed timeline, scroll to keep the playhead in view.
  useEffect(() => {
    if (!zoomed || !scrollRef.current) return;
    const el = scrollRef.current;
    const x = NLE_GUT + elapsed * scale;
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
    const [w, h] = videoDims(project.aspectRatio || '16:9', project.videoResolution);
    const segments = items.map((it) => {
      if (it.video)
        return {
          kind: 'video',
          dataURL: it.video,
          trimStart: it.trim?.head || 0,
          duration: it.shot.duration || 0,
          tailSlack: it.trim?.tail || 0,
          muted: !!it.muted,
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
    // Audio timeline: every clip of every ENABLED layer mixes over the
    // per-shot clip audio (with its trims, fades and the layer volume).
    const audioClips = (project.audioLayers || [])
      .filter((L) => L.enabled !== false)
      .flatMap((L) =>
        (L.clips || [])
          .filter((c) => c.dataURL && c.duration > 0.01)
          .map((c) => ({
            dataURL: c.dataURL,
            start: c.start || 0,
            offset: c.offset || 0,
            duration: c.duration,
            fadeIn: c.fadeIn || 0,
            fadeOut: c.fadeOut || 0,
            volume: L.volume ?? 1,
          }))
      );
    const off = window.ffmpegBridge.onProgress((p) =>
      setRenderProg({ pct: Math.min(100, Math.round((p.sec / (p.total || 1)) * 100)) })
    );
    try {
      const res = await window.ffmpegBridge.render({ width: w, height: h, fps: 25, segments, transitions, audioClips, outPath });
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
    const [w, h] = videoDims(project.aspectRatio || '16:9', project.videoResolution);
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
  const innerWidth = zoomed ? NLE_GUT + seconds * scale : undefined; // px in zoom mode

  return (
    <section className="stage">
      <div className="stage-head-row">
        <h2 className="stage-h2" data-tip={t('s6.desc')}>{t('s6.title')}</h2>
        <DynamicsVisualizer plan={project.dynamicsPlan} playhead={playing || elapsed > 0 ? elapsed : null} />
      </div>

      <div className="asm-preview">
        {cur?.video ? (
          <video key={cur.shot.id} ref={pvRef} src={cur.video} preload="auto" playsInline />
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
          <span className="nle-gut nle-gut-ruler" />
          {Array.from({ length: seconds }, (_, i) => (
            <div key={i} className="nle-cell" style={zoomed ? { flex: 'none', width: scale } : undefined}><span>{i % labelEvery === 0 ? `${i}s` : ''}</span></div>
          ))}
        </div>
        {/* Every row carries the same fixed-width head gutter so the video
            and audio strips start at the exact same timeline zero. */}
        <div className="nle-track asm-track">
          <span className="nle-gut track-head">
            <i className="trk-tag">V1</i>
            <span className="trk-name">{t('s6.trackVideo')}</span>
          </span>
          <div className="asm-scenes" ref={trackRef}>
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
                      {it.muted && it.video && (
                        <span className="clip-mute" title={t('s6.mutedBadge')}>🔇</span>
                      )}
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
        </div>
        {/* Audio timeline: layers of clips under the video track. Each layer
            is its own lane — toggle, volume, add clips, drag to move, edge
            trims, fades; clips play in the preview and mix into the render. */}
        <div className="audio-lanes">
          {layers.map((L, li) => (
            <div key={L.id} className={`audio-lane ${L.enabled === false ? 'lane-off' : ''}`}>
              {/* Compact head: track tag + enable + everything else in a ⋯ menu. */}
              <span className="nle-gut lane-head" title={L.name}>
                <i className="trk-tag">A{li + 1}</i>
                <button
                  type="button"
                  className={`lane-eye ${L.enabled === false ? '' : 'on'}`}
                  title={t('s6.layerToggle')}
                  aria-label={t('s6.layerToggle')}
                  aria-pressed={L.enabled !== false}
                  onClick={() => patchLayer(L.id, { enabled: L.enabled === false })}
                >
                  ●
                </button>
                <button
                  type="button"
                  className="lane-more"
                  title={t('s6.laneOpts')}
                  aria-label={t('s6.laneOpts')}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setLaneMenu((m) =>
                      m?.layerId === L.id ? null : { layerId: L.id, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 }
                    );
                  }}
                >
                  ⋯
                </button>
              </span>
              <div className="lane-strip">
                {(L.clips || []).map((c) => (
                  <div
                    key={c.id}
                    className={`aclip aclip-${li % 4} ${selAudio?.clipId === c.id ? 'selected' : ''}`}
                    style={
                      zoomed
                        ? { left: c.start * scale, width: Math.max(10, c.duration * scale) }
                        : {
                            left: `${(c.start / Math.max(0.1, total)) * 100}%`,
                            width: `${Math.max(0.8, (c.duration / Math.max(0.1, total)) * 100)}%`,
                          }
                    }
                    title={`${c.name} · ${c.duration.toFixed(1)}s`}
                    onPointerDown={(e) => startClipDrag(e, L, c, 'move')}
                  >
                    <span className="aclip-name">{c.name}</span>
                    <span className="aclip-h left" onPointerDown={(e) => startClipDrag(e, L, c, 'start')} />
                    <span className="aclip-h right" onPointerDown={(e) => startClipDrag(e, L, c, 'end')} />
                    {/* hidden element that actually plays this clip in the preview */}
                    <audio
                      ref={(el) => {
                        if (el) audioRefs.current[c.id] = el;
                        else delete audioRefs.current[c.id];
                      }}
                      src={c.dataURL}
                      preload="auto"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="lane-actions">
            <button type="button" className="btn tiny" onClick={addLayer}>
              + {t('s6.addLayer')}
            </button>
          </div>
        </div>
        {laneMenu && (() => {
          const L = layers.find((x) => x.id === laneMenu.layerId);
          if (!L) return null;
          return (
            <>
              <div className="cut-menu-backdrop" onClick={() => setLaneMenu(null)} />
              <div className="lane-menu" style={{ left: laneMenu.x, top: laneMenu.y }}>
                <label className="lane-menu-lbl">{t('s6.layerName')}</label>
                <input
                  className="lane-menu-name"
                  value={L.name}
                  onChange={(e) => patchLayer(L.id, { name: e.target.value })}
                />
                <label className="lane-menu-lbl">
                  {t('s6.layerVol')}: {Math.round((L.volume ?? 1) * 100)}%
                </label>
                <input
                  className="lane-vol"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={L.volume ?? 1}
                  onChange={(e) => patchLayer(L.id, { volume: Number(e.target.value) })}
                />
                <div className="lane-menu-row">
                  <label className="btn tiny file-btn">
                    {t('s6.addClip')}
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        const fs = [...(e.target.files || [])];
                        e.target.value = '';
                        if (fs.length) addClips(L.id)(fs);
                        setLaneMenu(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn tiny danger"
                    onClick={() => {
                      removeLayer(L.id);
                      setLaneMenu(null);
                    }}
                  >
                    {t('s6.removeLayer')}
                  </button>
                </div>
              </div>
            </>
          );
        })()}
        {showPlayhead && (
          <div
            className="nle-playhead"
            style={
              zoomed
                ? { left: NLE_GUT + elapsed * scale }
                : { left: `calc(${NLE_GUT}px + (100% - ${NLE_GUT}px) * ${Math.min(1, elapsed / Math.max(0.1, total))})` }
            }
          >
            <span className="nle-playhead-cap" />
          </div>
        )}
        </div>
       </div>
      </div>

      <div className="nle-footer">
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
            {selected.video && (
              <button
                type="button"
                className={selected.muted ? 'mute-on' : ''}
                title={selected.muted ? t('s6.unmute') : t('s6.mute')}
                onClick={() =>
                  update((p) => ({
                    shotMutes: { ...(p.shotMutes || {}), [selected.shot.id]: !(p.shotMutes || {})[selected.shot.id] },
                  }))
                }
              >
                {selected.muted ? '🔇' : '🔊'}
              </button>
            )}
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
        {(() => {
          const L = layers.find((x) => x.id === selAudio?.layerId);
          const c = L?.clips.find((x) => x.id === selAudio?.clipId);
          if (!c) return null;
          // Functional update so rapid clicks each apply their own step.
          const step = (field, d) =>
            setLayers((Ls) =>
              Ls.map((L2) =>
                L2.id === L.id
                  ? {
                      ...L2,
                      clips: L2.clips.map((cc) =>
                        cc.id === c.id
                          ? {
                              ...cc,
                              [field]: Math.round(
                                Math.max(0, Math.min(Math.min(3, cc.duration / 2), (cc[field] || 0) + d)) * 10
                              ) / 10,
                            }
                          : cc
                      ),
                    }
                  : L2
              )
            );
          return (
            <span className="nle-nudge" title={c.name}>
              🎵 {t('s6.fadeIn')}
              <button type="button" disabled={(c.fadeIn || 0) <= 0} onClick={() => step('fadeIn', -0.1)}>−</button>
              <i className="trim-val">{(c.fadeIn || 0).toFixed(1)}s</i>
              <button type="button" onClick={() => step('fadeIn', 0.1)}>+</button>
              · {t('s6.fadeOut')}
              <button type="button" disabled={(c.fadeOut || 0) <= 0} onClick={() => step('fadeOut', -0.1)}>−</button>
              <i className="trim-val">{(c.fadeOut || 0).toFixed(1)}s</i>
              <button type="button" onClick={() => step('fadeOut', 0.1)}>+</button>
              <button type="button" title={t('s6.clipDel')} onClick={() => removeClip(L.id, c.id)}>✕</button>
            </span>
          );
        })()}
        <span className="nle-timecode">{elapsed.toFixed(1).padStart(4, '0')} / {total.toFixed(1).padStart(4, '0')}s</span>
      </div>

      <div className="row">
        <button className="btn small primary" disabled={rendering || total <= 0} onClick={() => setPlaying((v) => !v)}>
          {playing ? <><StopSq size={14} /> {t('sb.stop')}</> : <><Play size={14} /> {t('sb.play')}</>}
        </button>
        <button className="btn small" disabled={rendering} onClick={doRender}>
          <Download size={14} /> {rendering ? t('s6.rendering') : t('s6.render')}
        </button>
        <button className="btn small" onClick={() => setShowScript(true)}>
          {t('s6.script')}
        </button>
        <button className="btn small" disabled={total <= 0} onClick={() => setSmartCut({ text: '', busy: false, err: '', result: null })}>
          <Wand size={14} /> {t('s6.smartCut')}
        </button>
        <button className="btn small" disabled={splitBusy || total <= 0} onClick={splitAV}>
          {splitBusy ? t('s6.splitting') : t('s6.splitAV')}
        </button>
        <button className="btn small" onClick={() => setShowCuts(true)}>
          {t('s6.cutsTable')}
        </button>
        {splitNote && <span className="total-badge">{splitNote}</span>}
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
      {renderErr && <div className="note error">{renderErr}</div>}
      {renderDone && <div className="note ok-note">{t('s6.renderedTo', { p: renderDone })}</div>}

      {/* Transitions reference: what each cut does, with checkboxes to trim
          the list — disabled types leave the auto-picker and the cut menu. */}
      {showCuts && (
        <div className="overlay" onClick={() => setShowCuts(false)}>
          <div className="modal cuts-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('s6.cutsTitle')}</h3>
            <p className="hint">{t('s6.cutsHint')}</p>
            <table className="cuts-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th>{t('s6.cutsName')}</th>
                  <th>{t('s6.cutsDesc')}</th>
                  <th>{t('s6.cutsEffect')}</th>
                </tr>
              </thead>
              <tbody>
                {REAL_CUTS.map((ty) => {
                  const ff = CUT_FFMPEG[ty] || { xfade: 'cut' };
                  const bridge = CUT_ACTIONS[ty]?.audio_bridge;
                  return (
                    <tr key={ty} className={disabledCuts.has(ty) ? 'cut-off' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!disabledCuts.has(ty)}
                          onChange={(e) =>
                            update((p) => {
                              const cur = new Set(p.disabledTransitions || []);
                              if (e.target.checked) cur.delete(ty);
                              else cur.add(ty);
                              return { disabledTransitions: [...cur] };
                            })
                          }
                        />
                      </td>
                      <td><b className="cut-abbr">{CUT_ABBR[ty]}</b></td>
                      <td className="cut-name">{t(`cut.${ty}`)}</td>
                      <td className="cut-desc">{t(`cutd.${ty}`)}</td>
                      <td className="cut-eff">
                        {ff.xfade === 'cut' ? t('s6.cutsHard') : `${ff.xfade} · ${ff.dur}s`}
                        {bridge && bridge !== 'none' ? ` · ${bridge.replace('_', '-')}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row">
              <button className="btn small" onClick={() => setShowCuts(false)}>{t('s6.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Smart cut: prompt-driven re-cut of the whole timeline. */}
      {smartCut && (
        <div className="overlay" onClick={() => !smartCut.busy && setSmartCut(null)}>
          <div className="modal smartcut-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('s6.smartCutTitle')}</h3>
            <p className="hint">{t('s6.smartCutHint')}</p>
            <textarea
              rows={3}
              value={smartCut.text}
              placeholder={t('s6.smartCutPh')}
              disabled={smartCut.busy}
              onChange={(e) => setSmartCut((s) => ({ ...s, text: e.target.value }))}
            />
            {smartCut.err && <div className="note error">{smartCut.err}</div>}
            {smartCut.result && (
              <div className="note ok-note">
                {t('s6.smartCutDone', { d: smartCut.result.durs, c: smartCut.result.cuts })}
                {smartCut.result.notes && <p className="smartcut-notes">{smartCut.result.notes}</p>}
              </div>
            )}
            {smartCut.result?.regen?.length > 0 && (
              <div className="note warn">
                {t('s6.smartCutRegen')}
                <ul className="smartcut-regen">
                  {smartCut.result.regen.map((r) => (
                    <li key={r.shot}>
                      {t('s4.shot', { n: r.shot })}
                      {r.needed ? ` — ≥${r.needed}s` : ''}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="row">
              <button
                className="btn small primary"
                disabled={smartCut.busy || !smartCut.text.trim()}
                onClick={runSmartCut}
              >
                {smartCut.busy ? t('s6.smartCutBusy') : t('s6.smartCutRun')}
              </button>
              <button className="btn small" disabled={smartCut.busy} onClick={() => setSmartCut(null)}>
                {t('s6.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScript && (
        <div className="overlay" onClick={() => setShowScript(false)}>
          <div className="modal script-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('s6.scriptTitle')}</h3>
            <div className="script-list">
              {(() => {
                const rows = items
                  .map((it, idx) => {
                    const sp = (project.shotPrompts || {})[it.shot.id] || {};
                    const dlg = (it.shot.dialogue || '').trim();
                    const aud = (sp.audioPrompt || '').trim();
                    if (!dlg && !aud) return null;
                    const t0 = startOf(idx);
                    const t1 = t0 + (it.shot.duration || 0);
                    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
                    return (
                      <div key={it.shot.id} className="script-item">
                        <div className="script-time">
                          {fmt(t0)}–{fmt(t1)} · {t('s4.shot', { n: idx + 1 })}
                        </div>
                        {dlg && <div className="script-dlg">{dlg}</div>}
                        {aud && <pre className="script-audio">{aud}</pre>}
                      </div>
                    );
                  })
                  .filter(Boolean);
                return rows.length ? rows : <p className="hint">{t('s6.scriptEmpty')}</p>;
              })()}
            </div>
            <div className="row">
              <button className="btn small" onClick={() => setShowScript(false)}>
                {t('s6.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {cutMenu && (
        <>
          <div className="cut-menu-backdrop" onClick={() => setCutMenu(null)} />
          <div className="cut-menu" style={{ left: cutMenu.x, top: cutMenu.y }}>
            {CUT_TYPES.filter((ty) => {
              const cur = (project.shotTransitions || {})[items[cutMenu.idx]?.shot.id] || 'auto';
              return ty === 'auto' || ty === cur || !disabledCuts.has(ty);
            }).map((ty) => {
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
