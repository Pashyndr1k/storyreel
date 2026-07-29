import { useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import StyleAssistant from '../components/StyleAssistant.jsx';
import { Wand } from '../components/icons.jsx';
import { useI18n } from '../lib/i18n.js';
import { STYLE_CATEGORIES, newStyle, buildStylesExport, parseStylesFile, mergeStyles } from '../lib/styles.js';
import { downloadText } from '../lib/exportScript.js';

// Full-page manager for the global style library (script / image / video).
// Same store as the in-project style modal — edits here apply everywhere.
export default function StylesPage({ styles, setStyles, settings, setSettings, onNav, onSettings }) {
  const { t } = useI18n();
  const [cat, setCat] = useState('script');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [assist, setAssist] = useState(false);

  const list = styles[cat] || [];
  const q = query.trim().toLowerCase();
  const shown = q
    ? list.filter((s) => `${s.name} ${s.instructions}`.toLowerCase().includes(q))
    : list;

  const upsert = (style) => {
    setStyles((prev) => {
      const arr = prev[cat] || [];
      const exists = arr.some((s) => s.id === style.id);
      return { ...prev, [cat]: exists ? arr.map((s) => (s.id === style.id ? style : s)) : [...arr, style] };
    });
    setEditing(null);
  };

  const remove = (id) => {
    if (!window.confirm(t('styles.deleteConfirm'))) return;
    setStyles((prev) => ({ ...prev, [cat]: (prev[cat] || []).filter((s) => s.id !== id) }));
  };

  // Built-ins can't be edited in place; duplicating gives an editable copy.
  const duplicate = (s) =>
    setEditing({ ...newStyle(), name: s.name + t('styles.copySuffix'), instructions: s.instructions });

  const exportStyles = () =>
    downloadText('storyreel-styles.json', JSON.stringify(buildStylesExport(styles), null, 2));
  const importStyles = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setStyles((prev) => mergeStyles(prev, parseStylesFile(String(reader.result))));
      } catch {
        window.alert(t('styles.importInvalid'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <AppShell
      route="styles"
      onNavigate={onNav}
      onSettings={onSettings}
      lang={settings.lang || 'en'}
      setLang={(l) => setSettings({ ...settings, lang: l })}
      theme={settings.theme || 'dark'}
      setTheme={(th) => setSettings({ ...settings, theme: th })}
      search={{ value: query, onChange: setQuery, placeholder: t('styles.searchPh') }}
    >
      <div className="title-row">
        <div className="title-left">
          <h1 className="page-title">{t('styles.title')}</h1>
          <span className="count-chip">{shown.length}</span>
        </div>
        <div className="title-actions">
          <label className="btn file-btn">
            {t('styles.import')}
            <input type="file" accept=".json,application/json" onChange={importStyles} hidden />
          </label>
          <button className="btn" onClick={exportStyles}>{t('styles.export')}</button>
          <button className="btn" onClick={() => setEditing(newStyle())}>{t('styles.add')}</button>
          <button className="btn primary" onClick={() => setAssist(true)}>
            <Wand size={15} /> {t('sa.button')}
          </button>
        </div>
      </div>

      <div className="style-tabs page-tabs">
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
            <span className="chip-count">{(styles[c] || []).length}</span>
          </button>
        ))}
      </div>
      <p className="hint">{t(`styles.hint_${cat}`)}</p>

      {shown.length === 0 ? (
        <div className="empty"><p>{t('styles.empty')}</p></div>
      ) : (
        <div className="style-grid">
          {shown.map((s) => (
            <div key={s.id} className="sr-card style-card">
              <div className="sr-body">
                <div className="sr-body-main">
                  <h3 className="sr-title">{s.name}</h3>
                  {s.builtin && <span className="sr-tag muted">{t('styles.builtin')}</span>}
                  <p className="style-card-text" title={s.instructions}>{s.instructions}</p>
                </div>
              </div>
              <div className="sr-actions">
                <button className="btn small" onClick={() => setEditing({ ...s })}>{t('styles.edit')}</button>
                <button className="btn small" onClick={() => duplicate(s)}>{t('styles.duplicate')}</button>
                <button className="btn danger small" onClick={() => remove(s.id)}>{t('styles.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assist && (
        <StyleAssistant
          settings={settings}
          category={cat}
          onSettings={onSettings}
          onSave={(c, style) => {
            setStyles((prev) => ({ ...prev, [c]: [...(prev[c] || []), style] }));
            setCat(c);
            setQuery('');
          }}
          onClose={() => setAssist(false)}
        />
      )}

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.name || t('styles.add')}</h2>
            <label>{t('styles.name')}</label>
            <input
              value={editing.name}
              placeholder={t('styles.namePh')}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <label>{t('styles.instructions')}</label>
            <AutoTextarea
              minRows={6}
              value={editing.instructions}
              placeholder={t('styles.instrPh')}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>{t('styles.cancel')}</button>
              <button
                className="btn primary"
                disabled={!editing.name.trim() || !editing.instructions.trim()}
                onClick={() => upsert({ ...editing, name: editing.name.trim() })}
              >
                {t('styles.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
