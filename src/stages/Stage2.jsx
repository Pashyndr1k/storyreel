import { useGenerate } from '../lib/useGenerate.js';
import { stage2Prompt } from '../lib/prompts.js';
import { uid } from '../lib/storage.js';
import { useI18n } from '../lib/i18n.js';
import ErrorNote from '../components/ErrorNote.jsx';

export default function Stage2({ project, update, settings, goNext, onSettings }) {
  const { t, lang } = useI18n();
  const { busy, error, run } = useGenerate(settings);
  const storyline = project.storyline;

  const generate = () => {
    if (storyline && !window.confirm(t('s2.replaceConfirm'))) return;
    run(stage2Prompt(project, lang), (data) =>
      update((p) => ({
        storyline: {
          synopsis: data.synopsis || '',
          characters: (data.characters || []).map((c) => ({
            id: uid(),
            name: c.name || '',
            role: c.role || '',
            description: c.description || '',
          })),
        },
        title: data.title || p.title,
        genres: Array.isArray(data.genres) && data.genres.length ? data.genres.slice(0, 3) : p.genres,
      }))
    );
  };

  const setSynopsis = (synopsis) => update((p) => ({ storyline: { ...p.storyline, synopsis } }));

  const updateChar = (id, patch) =>
    update((p) => ({
      storyline: {
        ...p.storyline,
        characters: p.storyline.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    }));

  const addChar = () =>
    update((p) => ({
      storyline: {
        ...p.storyline,
        characters: [...p.storyline.characters, { id: uid(), name: '', role: '', description: '' }],
      },
    }));

  const removeChar = (id) =>
    update((p) => ({
      storyline: {
        ...p.storyline,
        characters: p.storyline.characters.filter((c) => c.id !== id),
      },
    }));

  return (
    <section className="stage">
      <h2>{t('s2.title')}</h2>
      <p className="stage-desc">{t('s2.desc')}</p>

      <details className="context-box">
        <summary>{t('s2.approvedPlot')}</summary>
        <p>{project.approvedPlot}</p>
      </details>

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={generate}>
          {busy ? t('gen.generating') : storyline ? t('s2.regenerate') : t('s2.generate')}
        </button>
      </div>
      <ErrorNote error={error} onSettings={onSettings} />

      {storyline && (
        <>
          <label>{t('s2.synopsis')}</label>
          <textarea rows={9} value={storyline.synopsis} onChange={(e) => setSynopsis(e.target.value)} />

          <div className="section-head">
            <label>{t('s2.characters')}</label>
            <button className="btn small" onClick={addChar}>{t('s2.addChar')}</button>
          </div>
          {storyline.characters.map((c) => (
            <div key={c.id} className="char-card">
              <div className="row">
                <input
                  className="grow"
                  value={c.name}
                  placeholder={t('s2.name')}
                  onChange={(e) => updateChar(c.id, { name: e.target.value })}
                />
                <input
                  className="grow"
                  value={c.role}
                  placeholder={t('s2.role')}
                  onChange={(e) => updateChar(c.id, { role: e.target.value })}
                />
                <button className="btn danger small" onClick={() => removeChar(c.id)}>✕</button>
              </div>
              <textarea
                rows={3}
                value={c.description}
                placeholder={t('s2.charDesc')}
                onChange={(e) => updateChar(c.id, { description: e.target.value })}
              />
            </div>
          ))}
        </>
      )}

      <footer className="stage-footer">
        <button
          className="btn primary big"
          disabled={!storyline || !storyline.synopsis.trim()}
          onClick={goNext}
        >
          {t('s2.continue')}
        </button>
      </footer>
    </section>
  );
}
