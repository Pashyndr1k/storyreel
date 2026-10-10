import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { generateJSON, textKeyError } from '../lib/claude.js';
import { generateImage } from '../lib/gemini.js';
import { fileToResizedDataURL, resizeDataURL } from '../lib/images.js';
import { uid } from '../lib/storage.js';
import { storyAssetsOf, storyAssetLibId, assetNameIssue, assetUsage, findAssetsPrompt, assetImagePrompt, syncShotAssets, MAX_STORY_ASSETS, MAX_ASSET_PHOTOS } from '../lib/storyAssets.js';
import AutoTextarea from './AutoTextarea.jsx';
import LibraryPicker from './LibraryPicker.jsx';
import ErrorNote from './ErrorNote.jsx';
import { Stars, Upload, Layers } from './icons.jsx';

// The "Assets" tab of Stage 2: cards for the objects the characters interact
// with — a unique English name, a description in the story's world, up to
// three reference images (uploaded, from the library, or generated from the
// description). The text model can propose the list from the script.
export default function StoryAssets({ project, update, settings, genLang, imageStyle, library, onSettings, setLightbox }) {
  const { t } = useI18n();
  const assets = storyAssetsOf(project);
  const usage = assetUsage(project);
  const [busy, setBusy] = useState(null); // 'find' | asset id (image)
  const [error, setError] = useState('');
  const [pickFor, setPickFor] = useState(null);

  const setAssets = (fn) => update((p) => ({ storyline: { ...(p.storyline || { synopsis: '', characters: [], groups: [] }), assets: fn(storyAssetsOf(p)) } }));
  const updateAsset = (id, patch) => setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a)));
  const addAsset = () => setAssets((list) => (list.length >= MAX_STORY_ASSETS ? list : [...list, { id: uid(), name: '', description: '', type: 'prop', photos: [] }]));
  const removeAsset = (id) => {
    const a = assets.find((x) => x.id === id);
    if (a && (a.name || a.photos?.length) && !window.confirm(t('asset.removeConfirm', { n: a.name || '?' }))) return;
    setAssets((list) => list.filter((x) => x.id !== id));
  };
  // a photo makes the card mirror to a library asset (useLibrarySync)
  const withLib = (a) => (a.libId ? {} : { libId: storyAssetLibId(project, a) });
  const addPhoto = async (id, file) => {
    try {
      const dataURL = await fileToResizedDataURL(file, 1024, 0.85); // an object reference keeps more detail than a face
      updateAsset(id, (a) => ({ photos: [...(a.photos || []), dataURL].slice(0, MAX_ASSET_PHOTOS), ...withLib(a) }));
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };
  const removePhoto = (id, idx) => updateAsset(id, (a) => ({ photos: (a.photos || []).filter((_, i) => i !== idx) }));
  const pickFromLibrary = (id, entry) => {
    updateAsset(id, (a) => ({ photos: [...(a.photos || []), ...entry.photos].slice(0, MAX_ASSET_PHOTOS), libId: entry.id, ...(a.name ? {} : { name: entry.name }), ...(a.description ? {} : { description: entry.description }) }));
    setPickFor(null);
  };
  const genImage = async (a) => {
    if (!(a.description || '').trim()) return window.alert(t('asset.needsDesc'));
    if (!settings.geminiKey) return setError('NO_GEMINI_KEY');
    setBusy(a.id);
    setError('');
    try {
      const raw = await generateImage(settings, { prompt: assetImagePrompt(project, a, imageStyle), aspectRatio: '1:1', imageSize: '1K' });
      const dataURL = await resizeDataURL(raw, 1024 * 1024, 0.9);
      updateAsset(a.id, (cur) => ({ photos: [...(cur.photos || []), dataURL].slice(0, MAX_ASSET_PHOTOS), ...withLib(cur) }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };
  // the model proposes the assets of the story (new ones only)
  const findAssets = async () => {
    const keyErr = textKeyError(settings);
    if (keyErr) return setError(keyErr);
    setBusy('find');
    setError('');
    try {
      const data = await generateJSON(settings, findAssetsPrompt(project, genLang));
      const have = new Set(assets.map((a) => (a.name || '').trim().toLowerCase()));
      const fresh = (Array.isArray(data?.assets) ? data.assets : [])
        .map((x) => ({ id: uid(), name: String(x.name || '').trim(), description: String(x.description || '').trim(), type: ['prop', 'wardrobe', 'logo', 'ui', 'other'].includes(x.type) ? x.type : 'prop', photos: [], mentions: Array.isArray(x.mentions) ? x.mentions.map(String).slice(0, 6) : [] }))
        .filter((x) => x.name && !have.has(x.name.toLowerCase()));
      if (!fresh.length) return setError(t('asset.noneFound'));
      setAssets((list) => [...list, ...fresh].slice(0, MAX_STORY_ASSETS));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };
  const syncNow = () => {
    const { patch, attached } = syncShotAssets(project);
    if (Object.keys(patch).length) update(patch);
    window.alert(t('asset.synced', { n: attached.reduce((a, x) => a + x.assetIds.length, 0) }));
  };
  const issueText = (code) => (code ? t(`asset.issue_${code}`) : '');
  const hasShots = (project.outline || []).some((s) => (project.sceneDetails?.[s.id]?.shots || []).length);

  return (
    <div className="story-assets">
      <p className="hint">{t('asset.intro')}</p>
      <ErrorNote error={error} onSettings={onSettings} />
      {assets.map((a) => {
        const issue = assetNameIssue(project, a);
        const used = usage[a.id] || [];
        return (
          <div key={a.id} className="char-card asset-card">
            <div className="row">
              <input className="grow" value={a.name} placeholder={t('asset.namePh')} title={t('asset.nameTip')} onChange={(e) => updateAsset(a.id, { name: e.target.value })} />
              <select value={a.type || 'prop'} title={t('asset.typeTip')} onChange={(e) => updateAsset(a.id, { type: e.target.value })}>
                {['prop', 'wardrobe', 'logo', 'ui', 'other'].map((k) => (
                  <option key={k} value={k}>{t(`asset.type_${k}`)}</option>
                ))}
              </select>
              <span className="total-badge" title={t('asset.usedTip')}>{t(used.length === 1 ? 'asset.used1' : 'asset.used', { n: used.length })}</span>
              <button title={t('asset.remove')} className="btn danger small" onClick={() => removeAsset(a.id)}>✕</button>
            </div>
            {issue && <p className="hint error-text">{issueText(issue)}</p>}
            <AutoTextarea minRows={2} value={a.description} placeholder={t('asset.descPh')} title={t('asset.descTip')} onChange={(e) => updateAsset(a.id, { description: e.target.value })} />
            <label className="photos-label" title={t('asset.photosTip')}>{t('asset.photos')}</label>
            <div className="photo-row">
              {(a.photos || []).map((ph, i) => (
                <div key={i} className="photo-thumb">
                  <img decoding="async" loading="lazy" src={ph} alt="" onClick={() => setLightbox?.({ kind: 'img', src: ph })} />
                  <button title={t('tip.removePhoto')} className="photo-x" onClick={() => removePhoto(a.id, i)}>✕</button>
                </div>
              ))}
              {(a.photos || []).length < MAX_ASSET_PHOTOS && (
                <>
                  <label className="photo-add" title={t('pick.upload')} aria-label={t('pick.upload')}>
                    <Upload size={20} />
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(a.id, f); }} />
                  </label>
                  <button type="button" className="photo-add" title={t('asset.fromLib')} aria-label={t('asset.fromLib')} onClick={() => setPickFor(a.id)}>
                    <Layers size={20} />
                  </button>
                  <button type="button" className="photo-add" title={t('asset.genImage')} aria-label={t('asset.genImage')} disabled={busy === a.id} onClick={() => genImage(a)}>
                    {busy === a.id ? <span className="voice-dots">…</span> : <Stars size={20} />}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
      <div className="section-actions">
        <button title={t('asset.addTip')} className="btn small" disabled={assets.length >= MAX_STORY_ASSETS} onClick={addAsset}>{t('asset.add')}</button>
        <button title={t('asset.findTip')} className="btn small" disabled={busy === 'find'} onClick={findAssets}>
          <Stars size={14} />{busy === 'find' ? t('gen.generating') : t('asset.find')}
        </button>
        {hasShots && assets.length > 0 && (
          <button title={t('asset.syncTip')} className="btn small" onClick={syncNow}>{t('asset.sync')}</button>
        )}
      </div>
      {pickFor && <LibraryPicker kind="asset" library={library} onPick={(entry) => pickFromLibrary(pickFor, entry)} onClose={() => setPickFor(null)} />}
    </div>
  );
}
