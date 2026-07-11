import { useEffect, useRef, useState } from 'react';
import { generateStoryboardImage } from '../lib/gemini.js';
import { useI18n } from '../lib/i18n.js';
import { Play, StopSq } from './icons.jsx';

// Local prompt for a cheap, rough frame — no Claude call needed.
function framePrompt(shot, scene) {
  return `Rough cinematic storyboard frame, ${shot.shotType || 'medium'} shot, simple loose sketch-style composition, muted colors: ${shot.action || scene.summary || ''}. Setting: ${shot.location || scene.title || ''}. No text, no labels, no captions.`;
}

// NLE-style animatic timeline (design 3a): black surface with a per-second time
// ruler, square clips butted together whose widths are proportional to their
// durations, a red playhead spanning ruler + track, and real-time playback.
export default function StoryboardTimeline({ project, scene, shots, settings, onReorder, onFrames, onSettings }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

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

  const generate = async () => {
    if (!settings.geminiKey) {
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
          const img = await generateStoryboardImage(settings, {
            prompt: framePrompt(targets[i], scene),
            aspectRatio: project.aspectRatio || '16:9',
          });
          onFrames({ [targets[i].id]: img });
        } catch (e) {
          setErr(e.message === 'NO_GEMINI_KEY' ? 'NO_GEMINI_KEY' : e.message || String(e));
        }
        done++;
        setProg({ a: done, b: targets.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, worker));
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

      {playing && (
        <div className="sb-preview">
          {sb[current?.id] ? (
            <img src={sb[current.id]} alt="" />
          ) : (
            <div className="sb-preview-empty">{t('s4.shot', { n: shots.indexOf(current) + 1 })}</div>
          )}
        </div>
      )}

      <div className="nle">
        <div className="nle-ruler">
          {Array.from({ length: seconds }, (_, i) => (
            <div key={i} className="nle-cell"><span>{i}s</span></div>
          ))}
        </div>
        <div className="nle-track">
          {shots.map((s, i) => (
            <div
              key={s.id}
              className={`nle-clip ${selectedId === s.id ? 'selected' : ''} ${overIdx === i ? 'drag-over' : ''}`}
              style={{ flexGrow: Math.max(0.5, s.duration || 1) }}
              title={`${i + 1} · ${s.duration}s · ${s.shotType || ''}`}
              draggable
              onClick={() => {
                setSelectedId(s.id);
                setElapsed(startOf(i));
              }}
              onDragStart={(e) => {
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
          {playing ? <><StopSq size={14} /> {t('sb.stop')}</> : <><Play size={14} /> {t('sb.play')}</>}
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
