import { useState } from 'react';
import { useGenerate } from '../lib/useGenerate.js';
import { stage4Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';

export function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function sceneStartTime(project, sceneId) {
  let t = 0;
  for (const s of project.outline) {
    if (s.id === sceneId) break;
    const shots = project.sceneDetails[s.id]?.shots;
    const d = shots?.length ? shots.reduce((a, x) => a + (x.duration || 0), 0) : 0;
    t += d || s.duration || 0;
  }
  return t;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));

export default function Stage4({ project, update, settings, goNext, onSettings }) {
  const { t, lang } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const { busy, error, run } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const doneCount = project.outline.filter((s) => project.sceneDetails[s.id]?.shots?.length).length;
  const allDone = doneCount === project.outline.length && project.outline.length > 0;

  const setShots = (nextShots) =>
    update((p) => ({
      sceneDetails: { ...p.sceneDetails, [scene.id]: { shots: nextShots } },
    }));

  const generate = () => {
    if (shots.length && !window.confirm(t('s4.replaceConfirm'))) return;
    run(stage4Prompt(project, { ...scene, number: project.outline.indexOf(scene) + 1 }, lang), (data) =>
      setShots(
        (data.shots || []).map((s) => ({
          id: uid(),
          duration: clamp(s.duration_sec, 2, 10),
          shotType: s.shot_type || '',
          location: s.location || '',
          action: s.action || '',
          dialogue: s.dialogue || '',
          notes: s.notes || '',
        }))
      )
    );
  };

  const updateShot = (id, patch) => setShots(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeShot = (id) => setShots(shots.filter((s) => s.id !== id));
  const moveShot = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[i], next[j]] = [next[j], next[i]];
    setShots(next);
  };
  const addShot = () =>
    setShots([
      ...shots,
      { id: uid(), duration: 4, shotType: '', location: '', action: '', dialogue: '', notes: '' },
    ]);

  if (!project.outline.length) {
    return (
      <section className="stage">
        <h2>{t('s4.title')}</h2>
        <div className="note warn">{t('s4.needOutline')}</div>
      </section>
    );
  }

  const sceneStart = sceneStartTime(project, scene.id);
  const sceneTotal = shots.reduce((a, s) => a + (s.duration || 0), 0);
  let cursor = sceneStart;

  return (
    <section className="stage">
      <h2>{t('s4.title')}</h2>
      <p className="stage-desc">
        {t('s4.desc')}{' '}
        <strong>{t('s4.progress', { a: doneCount, b: project.outline.length })}</strong>
      </p>

      <div className="scene-chips">
        {project.outline.map((s, i) => (
          <button
            key={s.id}
            className={`chip ${s.id === scene.id ? 'active' : ''} ${project.sceneDetails[s.id]?.shots?.length ? 'done' : ''}`}
            onClick={() => setSceneId(s.id)}
          >
            {project.sceneDetails[s.id]?.shots?.length ? '✓ ' : ''}{i + 1}. {s.title || t('s4.untitled')}
          </button>
        ))}
      </div>

      <div className="context-box static">
        <strong>{t('s4.scene')} {project.outline.indexOf(scene) + 1}: {scene.title}</strong> ·{' '}
        {t('s4.startsAt', { t: fmt(sceneStart) })} · {t('s4.target', { d: scene.duration })}
        {shots.length > 0 && <> · {t('s4.current', { d: sceneTotal })}</>}
        <p>{scene.summary}</p>
      </div>

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : shots.length ? t('s4.regenerate') : t('s4.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {shots.map((shot, i) => {
        const start = cursor;
        cursor += shot.duration || 0;
        return (
          <div key={shot.id} className="shot-card">
            <div className="shot-head">
              <strong>{t('s4.shot', { n: i + 1 })}</strong>
              <span className="timecode">{fmt(start)} – {fmt(cursor)}</span>
              <div className="scene-tools">
                <button className="btn tiny" disabled={i === 0} onClick={() => moveShot(i, -1)}>↑</button>
                <button className="btn tiny" disabled={i === shots.length - 1} onClick={() => moveShot(i, 1)}>↓</button>
                <button className="btn danger tiny" onClick={() => removeShot(shot.id)}>✕</button>
              </div>
            </div>
            <div className="shot-grid">
              <div className="field small-field">
                <label>{t('s4.duration')}</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={shot.duration}
                  onChange={(e) => updateShot(shot.id, { duration: clamp(e.target.value, 2, 10) })}
                />
              </div>
              <div className="field">
                <label>{t('s4.shotType')}</label>
                <input
                  value={shot.shotType}
                  placeholder={t('s4.shotTypePh')}
                  onChange={(e) => updateShot(shot.id, { shotType: e.target.value })}
                />
              </div>
              <div className="field grow2">
                <label>{t('s4.location')}</label>
                <input
                  value={shot.location}
                  placeholder={t('s4.locationPh')}
                  onChange={(e) => updateShot(shot.id, { location: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>{t('s4.action')}</label>
              <textarea rows={2} value={shot.action} onChange={(e) => updateShot(shot.id, { action: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('s4.dialogue')}</label>
              <textarea
                rows={2}
                value={shot.dialogue}
                placeholder={t('s4.dialoguePh')}
                onChange={(e) => updateShot(shot.id, { dialogue: e.target.value })}
              />
            </div>
            <div className="field">
              <label>{t('s4.notes')}</label>
              <input value={shot.notes} onChange={(e) => updateShot(shot.id, { notes: e.target.value })} />
            </div>
          </div>
        );
      })}

      {shots.length > 0 && (
        <div className="row">
          <button className="btn small" onClick={addShot}>{t('s4.addShot')}</button>
        </div>
      )}

      <footer className="stage-footer">
        {!allDone && <span className="hint">{t('s4.hint', { n: project.outline.length })}</span>}
        <button className="btn primary big" disabled={!allDone} onClick={goNext}>
          {t('s4.continue')}
        </button>
      </footer>
    </section>
  );
}
