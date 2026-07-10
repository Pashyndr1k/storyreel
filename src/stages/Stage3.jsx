import { useGenerate } from '../lib/useGenerate.js';
import { stage3Prompt, durationOf } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Stage3({ project, update, settings, goNext, onSettings, genLang }) {
  const { t } = useI18n();
  const { busy, error, run } = useGenerate(settings);
  const outline = project.outline;
  const total = outline.reduce((a, s) => a + (s.duration || 0), 0);
  const maxDuration = durationOf(project).max;

  const generate = () => {
    if (outline.length && !window.confirm(t('s3.replaceConfirm'))) return;
    run(stage3Prompt(project, genLang), (data) =>
      update({
        outline: (data.scenes || []).map((s, i) => ({
          id: uid(),
          number: i + 1,
          title: s.title || `${t('s4.scene')} ${i + 1}`,
          summary: s.summary || '',
          duration: Number(s.duration_sec) || 20,
        })),
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

  const move = (i, dir) =>
    update((p) => {
      const next = [...p.outline];
      const j = i + dir;
      if (j < 0 || j >= next.length) return {};
      [next[i], next[j]] = [next[j], next[i]];
      return { outline: next };
    });

  const addScene = () =>
    update((p) => ({
      outline: [...p.outline, { id: uid(), number: p.outline.length + 1, title: '', summary: '', duration: 15 }],
    }));

  return (
    <section className="stage">
      <h2>{t('s3.title')}</h2>
      <p className="stage-desc">{t('s3.desc')}</p>

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
        <div key={s.id} className="scene-row">
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
            <button className="btn tiny" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="btn tiny" disabled={i === outline.length - 1} onClick={() => move(i, 1)}>↓</button>
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
