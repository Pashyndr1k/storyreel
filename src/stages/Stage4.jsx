import { useRef, useState } from 'react';
import { Grip } from '../components/icons.jsx';
import { useGenerate } from '../lib/useGenerate.js';
import { stage4Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { fileToResizedDataURL } from '../lib/images.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';

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

const mapShots = (rawShots) =>
  (rawShots || []).map((s) => ({
    id: uid(),
    duration: clamp(s.duration_sec, 2, 10),
    shotType: s.shot_type || '',
    location: s.location || '',
    action: s.action || '',
    dialogue: s.dialogue || '',
    notes: s.notes || '',
  }));

export default function Stage4({ project, update, settings, goNext, onSettings, genLang, scriptStyle }) {
  const { t } = useI18n();
  const [sceneId, setSceneId] = useState(project.outline[0]?.id || null);
  const [prog, setProg] = useState(null);
  const { busy, error, run, runBatch } = useGenerate(settings);

  const scene = project.outline.find((s) => s.id === sceneId) || project.outline[0];
  const shots = (scene && project.sceneDetails[scene.id]?.shots) || [];
  const doneCount = project.outline.filter((s) => project.sceneDetails[s.id]?.shots?.length).length;
  const allDone = doneCount === project.outline.length && project.outline.length > 0;

  const applyShots = (targetSceneId, rawShots) =>
    update((p) => ({
      sceneDetails: { ...p.sceneDetails, [targetSceneId]: { shots: mapShots(rawShots) } },
    }));

  const generate = () => {
    if (shots.length && !window.confirm(t('s4.replaceConfirm'))) return;
    run(
      stage4Prompt(project, { ...scene, number: project.outline.indexOf(scene) + 1 }, genLang, scriptStyle),
      (data) => applyShots(scene.id, data.shots)
    );
  };

  const processAll = () => {
    let targets = project.outline.filter((s) => !project.sceneDetails[s.id]?.shots?.length);
    if (!targets.length) {
      if (!window.confirm(t('batch.confirmAll4'))) return;
      targets = project.outline;
    }
    runBatch(
      targets,
      (s) => stage4Prompt(project, { ...s, number: project.outline.indexOf(s) + 1 }, genLang, scriptStyle),
      (s, data) => applyShots(s.id, data.shots),
      (a, b) => setProg(b ? { a, b } : null)
    );
  };

  const setShots = (nextShots) =>
    update((p) => ({
      sceneDetails: { ...p.sceneDetails, [scene.id]: { shots: nextShots } },
    }));

  const updateShot = (id, patch) => setShots(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeShot = (id) => setShots(shots.filter((s) => s.id !== id));

  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);
  const moveShotTo = (from, to) => {
    const next = [...shots];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setShots(next);
  };
  const addShot = () =>
    setShots([
      ...shots,
      { id: uid(), duration: 4, shotType: '', location: '', action: '', dialogue: '', notes: '' },
    ]);

  const updateScenePhotos = (photos) =>
    update((p) => ({
      outline: p.outline.map((s) => (s.id === scene.id ? { ...s, photos } : s)),
    }));

  const addScenePhoto = async (file) => {
    try {
      const dataURL = await fileToResizedDataURL(file);
      updateScenePhotos([...(scene.photos || []), dataURL].slice(0, 3));
    } catch (e) {
      window.alert(e.message);
    }
  };

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
        <label className="photos-label">{t('scene.photos')}</label>
        <div className="photo-row">
          {(scene.photos || []).map((ph, i) => (
            <div key={i} className="photo-thumb">
              <img src={ph} alt="" />
              <button
                className="photo-x"
                onClick={() => updateScenePhotos((scene.photos || []).filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          {(scene.photos || []).length < 3 && (
            <label className="btn small file-btn">
              {t('char.addPhoto')}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) addScenePhoto(f);
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy && !prog ? t('gen.generating') : shots.length ? t('s4.regenerate') : t('s4.generate')}
        </button>
        <button className="btn" disabled={busy} onClick={processAll}>
          {t('batch.run4')}
        </button>
        {prog && (
          <span className="total-badge">{t('batch.progress', { a: prog.a, b: prog.b })}</span>
        )}
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {shots.map((shot, i) => {
        const start = cursor;
        cursor += shot.duration || 0;
        return (
          <div
            key={shot.id}
            className={`shot-card ${overIdx === i ? 'drag-over' : ''}`}
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
              if (from != null && from !== i) moveShotTo(from, i);
            }}
          >
            <div className="shot-head">
              <strong>{t('s4.shot', { n: i + 1 })}</strong>
              <span className="timecode">{fmt(start)} – {fmt(cursor)}</span>
              <div className="scene-tools">
                <span
                  className="drag-handle"
                  title={t('dnd.reorder')}
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
                >
                  <Grip size={16} />
                </span>
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
              <AutoTextarea minRows={2} value={shot.action} onChange={(e) => updateShot(shot.id, { action: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('s4.dialogue')}</label>
              <AutoTextarea
                minRows={2}
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
