import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { downloadText } from '../lib/exportScript.js';
import { buildBookText, buildScriptJSON, scriptFileBase } from '../lib/scriptExport.js';

// "Export script": pick the formats to save — the book-style text, the
// marked-up JSON, or both.
export default function ScriptExportModal({ project, onClose }) {
  const { t, lang } = useI18n();
  const [book, setBook] = useState(true);
  const [json, setJson] = useState(true);

  const save = () => {
    const base = scriptFileBase(project);
    if (book) downloadText(`${base}-script.md`, buildBookText(project, lang));
    if (json) downloadText(`${base}-script.json`, JSON.stringify(buildScriptJSON(project, lang), null, 2), 'application/json;charset=utf-8');
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 title={t('sx.hint')}>{t('sx.title')}</h2>
        <p className="hint">{t('sx.hint')}</p>
        <label className="check-row style-plus" title={t('tip.sxBook')}>
          <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} />
          <span>
            {t('sx.book')}
            <em>{t('sx.bookHint')}</em>
          </span>
        </label>
        <label className="check-row style-plus" title={t('tip.sxJson')}>
          <input type="checkbox" checked={json} onChange={(e) => setJson(e.target.checked)} />
          <span>
            {t('sx.json')}
            <em>{t('sx.jsonHint')}</em>
          </span>
        </label>
        <div className="modal-actions">
          <button title={t('tip.cancel')} className="btn" onClick={onClose}>{t('new.cancel')}</button>
          <button title={t('tip.sxSave')} className="btn primary" disabled={!book && !json} onClick={save}>
            {t('sx.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
