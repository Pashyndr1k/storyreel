import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { videoDims, saveToLocalOutputs } from '../lib/comfy.js';
import { Play, StopSq, Grip, Download } from '../components/icons.jsx';

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

  // Flat assembly sequence in scene order.
  const scenes = project.outline.map((scene) => ({
    scene,
    shots: (project.sceneDetails[scene.id]?.shots || []).map((shot) => ({
      shot,
      video: (project.shotVideos || {})[shot.id] || null,
      image: (project.shotImages || {})[shot.id] || null,
    })),
  }));
  const items = scenes.flatMap((g) => g.shots.map((it) => ({ ...it, sceneId: g.scene.id })));
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
  const curShotId = cur?.shot.id;
  useEffect(() => {
    setVideoEnded(false);
    const v = pvRef.current;
    if (!v) return;
    if (playing && cur?.video) {
      try {
        v.currentTime = Math.max(0, curOffset);
      } catch {
        /* not seekable yet */
      }
      v.play().catch(() => {});
    } else {
      v.pause();
    }
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

  const doRender = async () => {
    if (rendering || total <= 0) return;
    setRendering(true);
    setRenderErr('');
    setPlaying(false);
    cancelRef.current = false;
    const [w, h] = videoDims(project.aspectRatio || '16:9');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // Route the work video element's audio into the recording (not speakers).
    const vid = document.createElement('video');
    vid.muted = false;
    let ac = null;
    let mediaSrc = null;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      mediaSrc = ac.createMediaElementSource(vid);
      mediaSrc.connect(dest);
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

    const drawFrame = (el, iw, ih) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (!el || !iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    // setTimeout, not requestAnimationFrame: rAF throttles/stalls in a
    // backgrounded window and would freeze a long render mid-way.
    const holdFor = (t0, clipMs, draw) =>
      new Promise((res) => {
        const step = () => {
          if (cancelRef.current || performance.now() - t0 >= clipMs) return res();
          draw();
          setTimeout(step, 33);
        };
        step();
      });

    try {
      for (let i = 0; i < items.length; i++) {
        if (cancelRef.current) break;
        const it = items[i];
        setRenderProg({ a: i + 1, b: items.length });
        const clipMs = (it.shot.duration || 0) * 1000;
        if (clipMs <= 0) continue;
        const t0 = performance.now();
        if (it.video) {
          vid.src = it.video;
          await new Promise((res) => {
            vid.onloadeddata = res;
            vid.onerror = () => res();
          });
          vid.currentTime = 0;
          try {
            await vid.play();
          } catch {
            /* draw whatever is decodable */
          }
          // Past the video's end the frame stays black — never stretched.
          await holdFor(t0, clipMs, () =>
            vid.ended ? drawFrame(null) : drawFrame(vid, vid.videoWidth, vid.videoHeight)
          );
          vid.pause();
        } else if (it.image) {
          const img = new Image();
          img.src = it.image;
          await new Promise((res) => {
            img.onload = res;
            img.onerror = () => res();
          });
          await holdFor(t0, clipMs, () => drawFrame(img, img.naturalWidth, img.naturalHeight));
        } else {
          await holdFor(t0, clipMs, () => drawFrame(null));
        }
      }
    } finally {
      rec.stop();
      await stopped;
      try {
        if (mediaSrc) mediaSrc.disconnect();
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

      <div className="asm-preview">
        {cur?.video && !videoEnded ? (
          <video key={cur.shot.id} ref={pvRef} src={cur.video} onEnded={() => setVideoEnded(true)} playsInline />
        ) : cur?.video && videoEnded && playing ? (
          <div className="asm-blank" />
        ) : cur?.image ? (
          <img src={cur.image} alt="" />
        ) : (
          <div className="asm-blank">{cur ? t('s4.shot', { n: curIdx + 1 }) : ''}</div>
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
            {renderProg && <span className="total-badge">{t('s6.renderProg', { a: renderProg.a, b: renderProg.b })}</span>}
            <button className="btn small danger" onClick={() => { cancelRef.current = true; }}>
              {t('s6.cancel')}
            </button>
          </>
        )}
      </div>
      <p className="hint">{t('s6.hint')}</p>
      {renderErr && <div className="note error">{renderErr}</div>}
    </section>
  );
}
