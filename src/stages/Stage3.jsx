import { useGenerate } from '../lib/useGenerate.js';
import { stage3Prompt, durationOf } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { StyleIndicator } from '../components/StyleControls.jsx';
import DynamicsVisualizer from '../components/DynamicsVisualizer.jsx';
import { normalizePlan } from '../lib/dynamics.js';
import { Grip } from '../components/icons.jsx';
import { useRef, useState } from 'react';

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Stage3({ project, update, settings, goNext, onSettings, onProjectSettings, genLang, styles, scriptStyle }) {
  const { t } = useI18n();
  const { busy, error, run } = useGenerate(settings);
  const outline = project.outline;
  const total = outline.reduce((a, s) => a + (s.duration || 0), 0);
  const maxDuration = durationOf(project).max;

  const generate = () => {
    if (outline.length && !window.confirm(t('s3.replaceConfirm'))) return;
    run(stage3Prompt(project, genLang, scriptStyle), (data) =>
      update({
        outline: (data.scenes || []).map((s, i) => ({
          id: uid(),
          number: i + 1,
          title: s.title || `${t('s4.scene')} ${i + 1}`,
          summary: s.summary || '',
          duration: Number(s.duration_sec) || 20,
        })),
        // The Action Dynamics Plan travels with the outline it was written for.
        dynamicsPlan: normalizePlan(data.dynamics_plan),
        sceneDetails: {},
        shotPrompts: {},
      })
    );
  };

  const updateScene = (id, patch) =>
    update((p) => ({ outline: p.outline.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const removeScene = (id) =>
    update((p) => {
      const details = { ...p.sceneDetails };
      delete details[id];
      return { outline: p.outline.filter((s) => s.id !== id), sceneDetails: details };
    });

  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const moveTo = (from, to) =>
    update((p) => {
      const next = [...p.outline];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { outline: next };
    });

  const addScene = () =>
    update((p) => ({
      outline: [...p.outline, { id: uid(), number: p.outline.length + 1, title: '', summary: '', duration: 15 }],
    }));

  return (
    <section className="stage">
      <div className="stage-head-row">
        <h2 className="stage-h2" data-tip={t('s3.desc')}>{t('s3.title')}</h2>
        <DynamicsVisualizer plan={project.dynamicsPlan} />
      </div>
      <StyleIndicator project={project} styles={styles} cats={['script']} onClick={onProjectSettings} />

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : outline.length ? t('s3.regenerate') : t('s3.generate')}
        </button>
        {outline.length > 0 && (
          <span className={`total-badge ${total > maxDuration ? 'over' : ''}`}>
            {t('s3.total', { t: fmt(total) })} / ≤{fmt(maxDuration)}
          </span>
        )}
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {outline.map((s, i) => (
        <div
          key={s.id}
          className={`scene-row ${overIdx === i ? 'drag-over' : ''}`}
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
            if (from != null && from !== i) moveTo(from, i);
          }}
        >
          <div className="scene-num">{i + 1}</div>
          <div className="scene-fields">
            <div className="row">
              <input
                className="grow"
                value={s.title}
                placeholder={t('s3.scenePlaceholder')}
                onChange={(e) => updateScene(s.id, { title: e.target.value })}
              />
              <input
                type="number"
                min={2}
                max={300}
                className="dur-input"
                value={s.duration}
                onChange={(e) => updateScene(s.id, { duration: Number(e.target.value) || 0 })}
              />
              <span className="unit">{t('s3.sec')}</span>
            </div>
            <AutoTextarea
              minRows={2}
              value={s.summary}
              placeholder={t('s3.summaryPlaceholder')}
              onChange={(e) => updateScene(s.id, { summary: e.target.value })}
            />
          </div>
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
            <button className="btn danger tiny" onClick={() => removeScene(s.id)}>✕</button>
          </div>
        </div>
      ))}

      {outline.length > 0 && (
        <div className="row">
          <button className="btn small" onClick={addScene}>{t('s3.addScene')}</button>
        </div>
      )}

      <footer className="stage-footer">
        <button className="btn primary big" disabled={!outline.length} onClick={goNext}>
          {t('s3.continue')}
        </button>
      </footer>
    </section>
  );
}
