import { useState } from 'react';
import { STYLE_CATEGORIES, newStyle } from '../lib/styles.js';
import { useI18n } from '../lib/i18n.js';
import AutoTextarea from './AutoTextarea.jsx';

// Manage the global style library across the three categories.
export default function StylesModal({ styles, setStyles, initialCat = 'script', onClose }) {
  const { t } = useI18n();
  const [cat, setCat] = useState(STYLE_CATEGORIES.includes(initialCat) ? initialCat : 'script');
  const [editing, setEditing] = useState(null); // style object being added/edited

  const list = styles[cat] || [];

  const upsert = (style) => {
    setStyles((prev) => {
      const arr = prev[cat] || [];
      const exists = arr.some((s) => s.id === style.id);
      const nextArr = exists ? arr.map((s) => (s.id === style.id ? style : s)) : [...arr, style];
      return { ...prev, [cat]: nextArr };
    });
    setEditing(null);
  };

  const remove = (id) => {
    if (!window.confirm(t('styles.deleteConfirm'))) return;
    setStyles((prev) => ({ ...prev, [cat]: (prev[cat] || []).filter((s) => s.id !== id) }));
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('styles.title')}</h2>

        <div className="style-tabs">
          {STYLE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${cat === c ? 'active' : ''}`}
              onClick={() => {
                setCat(c);
                setEditing(null);
              }}
            >
              {t(`styles.cat_${c}`)}
            </button>
          ))}
        </div>
        <p className="hint">{t(`styles.hint_${cat}`)}</p>

        {editing ? (
          <div className="style-editor">
            <label>{t('styles.name')}</label>
            <input
              value={editing.name}
              placeholder={t('styles.namePh')}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <label>{t('styles.instructions')}</label>
            <AutoTextarea
              minRows={4}
              value={editing.instructions}
              placeholder={t('styles.instrPh')}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
            />
            <div className="row">
              <button
                className="btn primary small"
                disabled={!editing.name.trim() || !editing.instructions.trim()}
                onClick={() => upsert({ ...editing, name: editing.name.trim() })}
              >
                {t('styles.save')}
              </button>
              <button className="btn small" onClick={() => setEditing(null)}>{t('styles.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="style-list">
              {list.length === 0 && <p className="hint">{t('styles.empty')}</p>}
              {list.map((s) => (
                <div key={s.id} className="style-item">
                  <div className="style-item-body">
                    <strong>{s.name}</strong>
                    <span>{s.instructions}</span>
                  </div>
                  <div className="style-item-actions">
                    <button className="btn tiny" onClick={() => setEditing({ ...s })}>{t('styles.edit')}</button>
                    <button className="btn danger tiny" onClick={() => remove(s.id)}>{t('styles.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn small" onClick={() => setEditing(newStyle())}>{t('styles.add')}</button>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>{t('styles.done')}</button>
        </div>
      </div>
    </div>
  );
}
