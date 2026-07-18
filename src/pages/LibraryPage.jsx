import { useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import AutoTextarea from '../components/AutoTextarea.jsx';
import { useI18n, localeOf } from '../lib/i18n.js';
import { newLibraryEntry, sortLibrary, CHARACTER_TYPES, LOCATION_TYPES } from '../lib/library.js';
import { fileToResizedDataURL } from '../lib/images.js';

// Generic manager for the character / location libraries (kind prop).
export default function LibraryPage({ kind, library, libUpsert, libDelete, settings, setSettings, onNav, onSettings }) {
  const { t, lang } = useI18n();
  const [sort, setSort] = useState('date');
  const [editing, setEditing] = useState(null);

  const types = kind === 'location' ? LOCATION_TYPES : CHARACTER_TYPES;
  const entries = sortLibrary((library || []).filter((e) => e.kind === kind), sort);

  const del = (e) => {
    if (window.confirm(t('lib.deleteConfirm'))) libDelete(e.id);
  };

  const addPhoto = async (file) => {
    try {
      const url = await fileToResizedDataURL(file);
      setEditing((ed) => ({ ...ed, photos: [...ed.photos, url].slice(0, 3) }));
    } catch (err) {
      window.alert(err.message);
    }
  };

  return (
    <AppShell
      route={kind === 'location' ? 'locations' : 'characters'}
      onNavigate={onNav}
      onSettings={onSettings}
      lang={settings.lang || 'en'}
      setLang={(l) => setSettings({ ...settings, lang: l })}
      theme={settings.theme || 'dark'}
      setTheme={(th) => setSettings({ ...settings, theme: th })}
    >
      <div className="title-row">
        <div className="title-left">
          <h1 className="page-title">{t(`lib.title_${kind}`)}</h1>
          <span className="count-chip">{entries.length}</span>
        </div>
        <div className="title-actions">
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="lang-select">
            <option value="date">{t('lib.sort_date')}</option>
            <option value="project">{t('lib.sort_project')}</option>
            <option value="type">{t('lib.sort_type')}</option>
          </select>
          <button className="btn primary" onClick={() => setEditing(newLibraryEntry(kind))}>
            {t('lib.add')}
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty"><p>{t('lib.empty')}</p></div>
      ) : (
        <div className="grid">
          {entries.map((e) => (
            <div key={e.id} className="sr-card lib-card">
              <div className="sr-poster lib-poster">
                {e.photos[0] ? (
                  <img src={e.photos[0]} alt="" />
                ) : (
                  <span className="sr-poster-label">{t('lib.noPhoto')}</span>
                )}
              </div>
              <div className="sr-body">
                <div className="sr-body-main">
                  <h3 className="sr-title">{e.name || t('lib.unnamed')}</h3>
                  <div className="sr-tags">
                    <span className="sr-tag">{t(`type.${e.type}`)}</span>
                    {e.projectTitle && <span className="sr-tag muted">{e.projectTitle}</span>}
                  </div>
                  <div className="card-meta">
                    <span>{new Date(e.createdAt).toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
              <div className="sr-actions">
                <button className="btn small" onClick={() => setEditing({ ...e })}>{t('styles.edit')}</button>
                <button className="btn danger small" onClick={() => del(e)}>{t('styles.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.name ? editing.name : t(`lib.title_${kind}`)}</h2>
            <label>{t('lib.name')}</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
            <label>{t('lib.type')}</label>
            <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
              {types.map((ty) => (
                <option key={ty} value={ty}>{t(`type.${ty}`)}</option>
              ))}
            </select>
            <label>{t('lib.desc')}</label>
            <AutoTextarea
              minRows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <label className="photos-label">{t('char.photos')}</label>
            <div className="photo-row">
              {editing.photos.map((ph, i) => (
                <div key={i} className="photo-thumb">
                  <img src={ph} alt="" />
                  <button
                    className="photo-x"
                    onClick={() => setEditing({ ...editing, photos: editing.photos.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {editing.photos.length < 3 && (
                <label className="btn small file-btn">
                  {t('char.addPhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) addPhoto(f);
                    }}
                  />
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>{t('styles.cancel')}</button>
              <button
                className="btn primary"
                disabled={!editing.name.trim() && !editing.photos.length}
                onClick={() => {
                  libUpsert({ ...editing, name: editing.name.trim() });
                  setEditing(null);
                }}
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
