import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { newLibraryEntry, sortLibrary } from '../lib/library.js';
import { uid } from '../lib/storage.js';
import { fileToResizedDataURL } from '../lib/images.js';
import AutoTextarea from './AutoTextarea.jsx';
import { Upload } from './icons.jsx';
import Lightbox from './Lightbox.jsx';

// Pop-up manager for the ASSET library (logos, props, wardrobe, UI
// screenshots…). Same shape as the character/location library entries, but
// asset-focused: name, description and up to three reference images. Every
// asset belongs to a project: a shot can attach only its own project's assets
// (Stage 5); an asset of another project is copied into this one here.
export default function AssetsModal({ library, libUpsert, libDelete, onClose, project = null }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null); // full-size image pop-up
  const [scope, setScope] = useState(project ? 'project' : 'all'); // 'project' | 'all'

  const all = sortLibrary((library || []).filter((e) => e.kind === 'asset'), 'date');
  const mine = (e) => !!project && e.projectId === project.id;
  const assets = scope === 'project' ? all.filter(mine) : all;
  const copyHere = (a) => libUpsert({ ...a, id: 'lib_' + uid(), projectId: project.id, projectTitle: project.title, createdAt: Date.now() });

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
          <h2 title={t('tip.assetLib')}>{t('asset.libTitle')}</h2>
          <button title={t('tip.assetAdd')} className="btn small primary" onClick={() => setEditing({ ...newLibraryEntry('asset'), projectId: project?.id || '', projectTitle: project?.title || '' })}>
            {t('asset.add')}
          </button>
        </div>
        <p className="hint">{t('asset.libDesc')}</p>
        {project && (
          <span className="seg seg-compact" role="radiogroup" aria-label={t('tip.assetScope')} title={t('tip.assetScope')}>
            {['project', 'all'].map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} className={`seg-btn ${scope === s ? 'on' : ''}`} title={t(`tip.assetScope_${s}`)} onClick={() => setScope(s)}>
                {t(`asset.scope_${s}`)}
              </button>
            ))}
          </span>
        )}

        {assets.length === 0 ? (
          <p className="hint">{t('asset.empty')}</p>
        ) : (
          <div className="asset-grid">
            {assets.map((a) => (
              <div key={a.id} className="asset-card">
                <div className="asset-thumb">
                  {a.photos[0] ? (
                    <img decoding="async" loading="lazy" src={a.photos[0]} alt="" onClick={() => setLightbox({ kind: 'img', src: a.photos[0] })} />
                  ) : (
                    <span>{t('lib.noPhoto')}</span>
                  )}
                </div>
                <strong className="asset-name">{a.name || t('asset.untitled')}</strong>
                {a.description && <p className="asset-desc">{a.description}</p>}
                {project && !mine(a) && <span className="sr-tag muted" title={t('ind.libProject')}>{a.projectTitle || t('asset.noProject')}</span>}
                <div className="row">
                  {project && !mine(a) && (
                    <button title={t('tip.assetCopyHere')} className="btn tiny primary" onClick={() => copyHere(a)}>{t('asset.copyHere')}</button>
                  )}
                  <button title={t('tip.edit')} className="btn tiny" onClick={() => setEditing({ ...a })}>{t('styles.edit')}</button>
                  <button title={t('tip.delete')}
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
          <button title={t('tip.close')} className="btn" onClick={onClose}>{t('set.close')}</button>
        </div>
      </div>

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 title={t('tip.assetEdit')}>{editing.name || t('asset.new')}</h2>
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
                  <img decoding="async" loading="lazy" src={ph} alt="" onClick={() => setLightbox({ kind: 'img', src: ph })} />
                  <button title={t('tip.removePhoto')}
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
                    className="sr-only"
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
              <button title={t('tip.cancel')} className="btn" onClick={() => setEditing(null)}>{t('styles.cancel')}</button>
              <button title={t('tip.save')} className="btn primary" disabled={!editing.photos.length} onClick={save}>
                {t('styles.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
