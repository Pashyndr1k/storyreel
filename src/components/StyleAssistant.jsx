import { useState } from 'react';
import AutoTextarea from './AutoTextarea.jsx';
import ErrorNote from './ErrorNote.jsx';
import { useI18n } from '../lib/i18n.js';
import { useGenerate } from '../lib/useGenerate.js';
import { styleAssistantPrompt } from '../lib/prompts.js';
import { STYLE_CATEGORIES, newStyle } from '../lib/styles.js';
import { Wand } from './icons.jsx';

// Describe a look in plain language and get back a ready style for the chosen
// category; refine it in place until it fits, then save it to the library.
export default function StyleAssistant({ settings, category, onSave, onClose, onSettings }) {
  const { t, lang } = useI18n();
  const { busy, error, run } = useGenerate(settings);
  const [cat, setCat] = useState(STYLE_CATEGORIES.includes(category) ? category : 'script');
  const [idea, setIdea] = useState('');
  const [refinement, setRefinement] = useState('');
  const [draft, setDraft] = useState(null); // { name, instructions, rationale }

  const propose = () =>
    run(styleAssistantPrompt(cat, idea.trim(), lang), (d) => {
      if (!d?.instructions) return;
      setDraft({ name: d.name || '', instructions: d.instructions, rationale: d.rationale || '' });
      setRefinement('');
    });

  const refine = () =>
    run(styleAssistantPrompt(cat, idea.trim(), lang, draft, refinement.trim()), (d) => {
      if (!d?.instructions) return;
      setDraft({ name: d.name || draft.name, instructions: d.instructions, rationale: d.rationale || '' });
      setRefinement('');
    });

  const save = () => {
    onSave(cat, { ...newStyle(), name: draft.name.trim(), instructions: draft.instructions.trim() });
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Wand size={17} /> {t('sa.title')}
        </h2>
        <p className="hint">{t('sa.intro')}</p>

        <label>{t('sa.category')}</label>
        <div className="style-tabs">
          {STYLE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${cat === c ? 'active' : ''}`}
              disabled={busy}
              onClick={() => {
                setCat(c);
                setDraft(null);
              }}
            >
              {t(`styles.cat_${c}`)}
            </button>
          ))}
        </div>
        <p className="hint">{t(`sa.what_${cat}`)}</p>

        <label>{t('sa.idea')}</label>
        <AutoTextarea
          minRows={3}
          value={idea}
          placeholder={t(`sa.ideaPh_${cat}`)}
          onChange={(e) => setIdea(e.target.value)}
          autoFocus
        />

        {!draft && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary fixedw-lg" disabled={busy || !idea.trim()} onClick={propose}>
              {busy ? t('sa.thinking') : t('sa.propose')}
            </button>
          </div>
        )}

        <ErrorNote error={error} onSettings={onSettings} />

        {draft && (
          <>
            <div className="sa-result">
              <label>{t('styles.name')}</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <label>{t('styles.instructions')}</label>
              <AutoTextarea
                minRows={5}
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              />
              {draft.rationale && <p className="hint sa-why">{draft.rationale}</p>}
            </div>

            <label>{t('sa.refine')}</label>
            <div className="dir-row">
              <input
                value={refinement}
                placeholder={t('sa.refinePh')}
                disabled={busy}
                onChange={(e) => setRefinement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && refinement.trim() && !busy) refine();
                }}
              />
              <button className="btn small" disabled={busy || !refinement.trim()} onClick={refine}>
                {t('sa.apply')}
              </button>
              <button className="btn small" disabled={busy} onClick={propose}>
                {t('sa.again')}
              </button>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('styles.cancel')}</button>
          <button
            className="btn primary"
            disabled={busy || !draft?.name.trim() || !draft?.instructions.trim()}
            onClick={save}
          >
            {t('sa.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
