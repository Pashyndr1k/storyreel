import { useEffect, useRef, useState } from 'react';
import { generateStoryboardImage } from '../lib/gemini.js';
import { useI18n } from '../lib/i18n.js';
import { Play, StopSq } from './icons.jsx';

const PPS = 26; // timeline pixels per second
const MIN_CLIP = 44;

// Local prompt for a cheap, rough frame — no Claude call needed.
function framePrompt(shot, scene) {
  return `Rough cinematic storyboard frame, ${shot.shotType || 'medium'} shot, simple loose sketch-style composition, muted colors: ${shot.action || scene.summary || ''}. Setting: ${shot.location || scene.title || ''}. No text, no labels, no captions.`;
}

// Low-res storyboard strip: NLE-style clips sized by duration, drag to reorder,
// batch generation of rough frames, and real-time playback for pacing checks.
export default function StoryboardTimeline({ project, scene, shots, settings, onReorder, onFrames, onSettings }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const sb = project.storyboards || {};
  const total = shots.reduce((a, s) => a + (s.duration || 0), 0);
  const missing = shots.filter((s) => !sb[s.id]);

  // playback clock
  useEffect(() => {
    if (!playing || total <= 0) return;
    const t0 = performance.now();
    const iv = setInterval(() => {
      const e = (performance.now() - t0) / 1000;
      if (e >= total) {
        setPlaying(false);
        setElapsed(0);
      } else {
        setElapsed(e);
      }
    }, 80);
    return () => clearInterval(iv);
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

  return (
    <div className="sb-block">
      <div className="sb-head">
        <strong>{t('sb.title')}</strong>
        <span className="hint">{t('sb.hint')}</span>
      </div>

      {playing && (
        <div className="sb-preview">
          {sb[current?.id] ? (
            <img src={sb[current.id]} alt="" />
          ) : (
            <div className="sb-preview-empty">{t('s4.shot', { n: shots.indexOf(current) + 1 })}</div>
          )}
          <span className="sb-clock">{elapsed.toFixed(1)}s / {total}s</span>
        </div>
      )}

      <div className="sb-strip-wrap">
        <div className="sb-strip">
          {shots.map((s, i) => {
            const w = Math.max(MIN_CLIP, (s.duration || 2) * PPS);
            return (
              <div
                key={s.id}
                className={`sb-clip ${overIdx === i ? 'drag-over' : ''} ${playing && current?.id === s.id ? 'live' : ''}`}
                style={{ width: `${w}px` }}
                title={`${i + 1} · ${s.duration}s · ${s.shotType || ''}`}
                draggable
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
                {sb[s.id] ? <img src={sb[s.id]} alt="" draggable={false} /> : <span className="sb-clip-num">{i + 1}</span>}
                <span className="sb-clip-dur">{s.duration}s</span>
              </div>
            );
          })}
          {playing && total > 0 && (
            <div className="sb-playhead" style={{ left: `${(elapsed / total) * 100}%` }} />
          )}
        </div>
      </div>

      <div className="row">
        <button className="btn small" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : t('sb.generate')}
        </button>
        <button
          className="btn small primary"
          disabled={busy || total <= 0}
          onClick={() => {
            setElapsed(0);
            setPlaying((v) => !v);
          }}
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
