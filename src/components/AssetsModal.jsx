import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { newLibraryEntry, sortLibrary } from '../lib/library.js';
import { fileToResizedDataURL } from '../lib/images.js';
import AutoTextarea from './AutoTextarea.jsx';
import { Upload } from './icons.jsx';

// Pop-up manager for the global ASSET library (logos, props, wardrobe, UI
// screenshots…). Same shape as the character/location library entries, but
// asset-focused: name, description and up to three reference images. Assets are
// shared across projects and attached to individual shots on Stage 5.
export default function AssetsModal({ library, libUpsert, libDelete, onClose }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(null);

  const assets = sortLibrary((library || []).filter((e) => e.kind === 'asset'), 'date');

  const addPhoto = async (file) => {
    try {
      const url = await fileToResizedDataURL(file);
      setEditing((ed) => ({ ...ed, photos: [...ed.photos, url].slice(0, 3) }));
    } catch (err) {
      window.alert(err.message);
    }
  };

  const save = () => {
    libUpsert({ ...editing, name: editing.name.trim() || t('asset.untitled') });
    setEditing(null);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-row">
          <h2>{t('asset.libTitle')}</h2>
          <button className="btn small primary" onClick={() => setEditing(newLibraryEntry('asset'))}>
            {t('asset.add')}
          </button>
        </div>
        <p className="hint">{t('asset.libDesc')}</p>

        {assets.length === 0 ? (
          <p className="hint">{t('asset.empty')}</p>
        ) : (
          <div className="asset-grid">
            {assets.map((a) => (
              <div key={a.id} className="asset-card">
                <div className="asset-thumb">
                  {a.photos[0] ? <img src={a.photos[0]} alt="" /> : <span>{t('lib.noPhoto')}</span>}
                </div>
                <strong className="asset-name">{a.name || t('asset.untitled')}</strong>
                {a.description && <p className="asset-desc">{a.description}</p>}
                <div className="row">
                  <button className="btn tiny" onClick={() => setEditing({ ...a })}>{t('styles.edit')}</button>
                  <button
                    className="btn tiny danger"
                    onClick={() => window.confirm(t('lib.deleteConfirm')) && libDelete(a.id)}
                  >
                    {t('styles.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t('set.close')}</button>
        </div>
      </div>

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.name || t('asset.new')}</h2>
            <label>{t('asset.name')}</label>
            <input
              value={editing.name}
              placeholder={t('asset.namePh')}
              autoFocus
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <label>{t('asset.desc')}</label>
            <AutoTextarea
              minRows={2}
              value={editing.description}
              placeholder={t('asset.descPh')}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <label className="photos-label">{t('asset.images')}</label>
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
                <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                  <Upload size={20} />
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
              <button className="btn primary" disabled={!editing.photos.length} onClick={save}>
                {t('styles.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
