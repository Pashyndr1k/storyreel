import { useEffect, useRef, useState } from 'react';
import { generateStoryboardImage } from '../lib/gemini.js';
import { generateComfyStoryboard, saveToLocalOutputs } from '../lib/comfy.js';
import { resizeDataURL } from '../lib/images.js';
import { useI18n } from '../lib/i18n.js';
import { Play, Pause, StopSq } from './icons.jsx';

// Local prompt for a cheap, rough frame — no Claude call needed.
function framePrompt(shot, scene) {
  return `Rough cinematic storyboard frame, ${shot.shotType || 'medium'} shot, simple loose sketch-style composition, muted colors: ${shot.action || scene.summary || ''}. Setting: ${shot.location || scene.title || ''}. No text, no labels, no captions. Don't render text in the preview frames.`;
}

// NLE-style animatic timeline (design 3a): black surface with a per-second time
// ruler, square clips butted together whose widths are proportional to their
// durations, a red playhead spanning ruler + track, and real-time playback.
// Clips are editable: drag a clip to reorder, drag its right edge to trim or
// extend the duration — both write straight into the shot breakdown data.
export default function StoryboardTimeline({ project, scene, shots, settings, onReorder, onDuration, onFrames, onSettings }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);
  const trackRef = useRef(null);
  const [trimId, setTrimId] = useState(null);

  const clampDur = (d) => Math.max(2, Math.min(10, d));

  // Nudge the selected clip's duration in 0.5s steps (footer − / + buttons) —
  // a click alternative to edge-dragging that works in both directions.
  const nudge = (delta) => {
    const s = shots.find((x) => x.id === selectedId);
    if (!s || !onDuration) return;
    onDuration(s.id, clampDur(Math.round(((s.duration || 0) + delta) * 2) / 2));
  };

  // Drag the right edge of a clip in EITHER direction: convert the pointer
  // delta into seconds using the track's px-per-second at drag start, snap to
  // 0.5s and clamp to the 2–10s shot rule. The pointer is captured by the
  // handle so a leftward drag over the (draggable) clip body can't be hijacked
  // by the reorder drag-and-drop. Updates flow into the shot data live, so the
  // breakdown cards' durations and timecodes follow while dragging.
  const startTrim = (e, shot) => {
    if (!onDuration || !trackRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const totalNow = shots.reduce((a, s) => a + (s.duration || 0), 0);
    if (totalNow <= 0) return;
    const handle = e.currentTarget;
    const pxPerSec = trackRef.current.clientWidth / totalNow;
    const startX = e.clientX;
    const startDur = shot.duration || 1;
    setPlaying(false);
    setTrimId(shot.id);
    setSelectedId(shot.id);
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; window listeners still work */
    }
    let cur = startDur;
    const move = (ev) => {
      const raw = startDur + (ev.clientX - startX) / pxPerSec;
      const next = clampDur(Math.round(raw * 2) / 2);
      if (next !== cur) {
        cur = next;
        onDuration(shot.id, next);
      }
    };
    const up = (ev) => {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
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

  const sb = project.storyboards || {};
  const total = shots.reduce((a, s) => a + (s.duration || 0), 0);
  const missing = shots.filter((s) => !sb[s.id]);

  // playback clock (resumes from the current position)
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

  // current shot for the preview
  let acc = 0;
  let current = shots[0];
  for (const s of shots) {
    if (elapsed < acc + (s.duration || 0)) {
      current = s;
      break;
    }
    acc += s.duration || 0;
    current = s;
  }

  const startOf = (idx) => shots.slice(0, idx).reduce((a, s) => a + (s.duration || 0), 0);

  const useComfy = settings.storyboardService === 'comfy';

  // One frame via the selected service: Gemini lite (default) or the local
  // ComfyUI Krea-2 Turbo workflow. Comfy frames keep a full-res copy in the
  // local outputs folder; the animatic strip stores the small version.
  const genFrame = async (shot, idx) => {
    const prompt = framePrompt(shot, scene);
    const aspectRatio = project.aspectRatio || '16:9';
    if (useComfy) {
      const { dataURL, filename } = await generateComfyStoryboard(settings, {
        prompt,
        aspectRatio,
        name: `${(project.title || 'project').slice(0, 24)}_sb_shot${idx + 1}`,
      });
      saveToLocalOutputs(settings, filename, dataURL); // best-effort local copy
      return resizeDataURL(dataURL, 320 * 200, 0.72);
    }
    return generateStoryboardImage(settings, { prompt, aspectRatio });
  };

  const generate = async () => {
    if (!useComfy && !settings.geminiKey) {
      setErr('NO_GEMINI_KEY');
      return;
    }
    let targets = missing;
    if (!targets.length) {
      if (!window.confirm(t('sb.confirmAll'))) return;
      targets = shots;
    }
    setBusy(true);
    setErr('');
    let done = 0;
    setProg({ a: 0, b: targets.length });
    let idx = 0;
    const worker = async () => {
      for (;;) {
        const i = idx++;
        if (i >= targets.length) return;
        try {
          const img = await genFrame(targets[i], shots.indexOf(targets[i]));
          onFrames({ [targets[i].id]: img });
        } catch (e) {
          setErr(e.message === 'NO_GEMINI_KEY' ? 'NO_GEMINI_KEY' : e.message || String(e));
        }
        done++;
        setProg({ a: done, b: targets.length });
      }
    };
    // ComfyUI runs one job at a time on the local GPU; Gemini can take two.
    await Promise.all(Array.from({ length: useComfy ? 1 : Math.min(2, targets.length) }, worker));
    setBusy(false);
    setProg(null);
  };

  if (!shots.length) return null;

  const seconds = Math.max(1, Math.ceil(total));
  const showPlayhead = total > 0 && (playing || elapsed > 0);

  return (
    <div className="sb-block">
      <div className="sb-head">
        <strong>{t('sb.title')}</strong>
      </div>

      {(playing || elapsed > 0) && (
        <div className="sb-preview-row">
          <div className="sb-preview">
            {sb[current?.id] ? (
              <img src={sb[current.id]} alt="" />
            ) : (
              <div className="sb-preview-empty">{t('s4.shot', { n: shots.indexOf(current) + 1 })}</div>
            )}
          </div>
          {/* Live caption: only the current shot's action text. */}
          <div className="sb-caption">
            <p>{current?.action || ''}</p>
          </div>
        </div>
      )}

      <div className="nle">
        <div className="nle-ruler">
          {Array.from({ length: seconds }, (_, i) => (
            <div key={i} className="nle-cell"><span>{i}s</span></div>
          ))}
        </div>
        <div className="nle-track" ref={trackRef}>
          {shots.map((s, i) => (
            <div
              key={s.id}
              className={`nle-clip ${selectedId === s.id ? 'selected' : ''} ${overIdx === i ? 'drag-over' : ''} ${trimId === s.id ? 'trimming' : ''}`}
              style={{ flexGrow: Math.max(0.5, s.duration || 1) }}
              title={`${i + 1} · ${s.duration}s · ${s.shotType || ''}`}
              draggable={trimId === null}
              onClick={() => {
                setSelectedId(s.id);
                setElapsed(startOf(i));
              }}
              onDragStart={(e) => {
                // A trim in progress must never turn into a reorder drag.
                if (trimId !== null) {
                  e.preventDefault();
                  return;
                }
                dragIdx.current = i;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragEnd={() => {
                dragIdx.current = null;
                setOverIdx(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIdx !== i) setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOverIdx(null);
                const from = dragIdx.current;
                dragIdx.current = null;
                if (from != null && from !== i) onReorder(from, i);
              }}
            >
              {sb[s.id] ? <img src={sb[s.id]} alt="" draggable={false} /> : <span className="nle-clip-num">{i + 1}</span>}
              <span className="nle-dur">{Number(s.duration || 0).toFixed(1)}s</span>
              {onDuration && (
                <span
                  className="nle-trim"
                  title={t('sb.trim')}
                  draggable={false}
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onPointerDown={(e) => startTrim(e, s)}
                />
              )}
            </div>
          ))}
        </div>
        {showPlayhead && (
          <div className="nle-playhead" style={{ left: `${Math.min(100, (elapsed / total) * 100)}%` }}>
            <span className="nle-playhead-cap" />
          </div>
        )}
      </div>

      <div className="nle-footer">
        <span>{t('sb.caption', { n: shots.length })}</span>
        {onDuration && shots.some((s) => s.id === selectedId) && (
          <span className="nle-nudge">
            {t('s4.shot', { n: shots.findIndex((s) => s.id === selectedId) + 1 })}
            <button
              type="button"
              title={t('sb.shorter')}
              disabled={(shots.find((s) => s.id === selectedId)?.duration || 0) <= 2}
              onClick={() => nudge(-0.5)}
            >
              −0.5s
            </button>
            <button
              type="button"
              title={t('sb.longer')}
              disabled={(shots.find((s) => s.id === selectedId)?.duration || 0) >= 10}
              onClick={() => nudge(0.5)}
            >
              +0.5s
            </button>
          </span>
        )}
        <span className="nle-timecode">{elapsed.toFixed(1).padStart(4, '0')} / {total.toFixed(1).padStart(4, '0')}s</span>
      </div>

      <div className="row">
        <button className="btn small" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : t('sb.generate')}
        </button>
        <button
          className="btn small primary"
          disabled={busy || total <= 0}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? <><Pause size={14} /> {t('sb.pause')}</> : <><Play size={14} /> {t('sb.play')}</>}
        </button>
        <button
          className="btn small"
          disabled={busy || (!playing && elapsed === 0)}
          onClick={() => {
            setPlaying(false);
            setElapsed(0);
          }}
        >
          <StopSq size={14} /> {t('sb.stop')}
        </button>
        {prog && <span className="total-badge">{t('sb.progress', { a: prog.a, b: prog.b })}</span>}
      </div>
      {err === 'NO_GEMINI_KEY' ? (
        <div className="note warn">
          {t('err.noGeminiKey')} <button className="btn small" onClick={onSettings}>{t('err.openSettings')}</button>
        </div>
      ) : err ? (
        <div className="note error">{err}</div>
      ) : null}
    </div>
  );
}
