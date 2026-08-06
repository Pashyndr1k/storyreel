import { useMemo } from 'react';
import { useI18n } from '../lib/i18n.js';
import { H3_REF_CAPS } from '../lib/comfy.js';

// Reference picker for MiniMax H3 reference mode (ref2va). The app already
// owns every asset the checkpoint wants — character photos, location refs,
// generated frames, approved shot videos, voice takes — so the picker only
// curates, it never uploads. Caps mirror the documented budget: 9 images,
// 3 videos, 3 audio clips, 12 files (~15s of media) total.
const empty = { images: [], videos: [], audios: [] };

export default function RefPicker({ project, scene, shot, refs, onChange, onClose }) {
  const { t } = useI18n();
  const cur = { ...empty, ...(refs || {}) };

  // Candidate media, grouped by kind. Labels double as the <Picture N> /
  // <Video N> / <Audio N> descriptions fed into the prompt writer.
  const candidates = useMemo(() => {
    const images = [];
    const videos = [];
    const audios = [];
    for (const ch of project.storyline?.characters || []) {
      (ch.photos || []).forEach((src, k) =>
        images.push({ src, label: t('refs.charPhoto', { name: ch.name || '?', n: k + 1 }) })
      );
    }
    project.outline.forEach((sc, si) => {
      (sc.photos || []).forEach((src, k) =>
        images.push({ src, label: t('refs.scenePhoto', { n: si + 1, k: k + 1 }) })
      );
    });
    project.outline.forEach((sc, si) => {
      (project.sceneDetails[sc.id]?.shots || []).forEach((sh, shi) => {
        const img = (project.shotImages || {})[sh.id];
        const fin = (project.shotFinalImages || {})[sh.id];
        const board = (project.referenceFrames || {})[sh.id];
        const vid = (project.shotVideos || {})[sh.id];
        const aud = (project.shotAudios || {})[sh.id];
        const at = { s: si + 1, n: shi + 1 };
        if (img) images.push({ src: img, label: t('refs.shotFrame', at) });
        if (fin) images.push({ src: fin, label: t('refs.shotFinal', at) });
        if (board) images.push({ src: board, label: t('refs.shotBoard', at), board: true });
        if (vid && sh.id !== shot.id) videos.push({ src: vid, label: t('refs.shotVideo', at) });
        if (aud) audios.push({ src: aud, label: t('refs.shotVoice', at) });
      });
    });
    return { images, videos, audios };
  }, [project, shot.id, t]);

  const total = cur.images.length + cur.videos.length + cur.audios.length;
  const capOf = { images: H3_REF_CAPS.images, videos: H3_REF_CAPS.videos, audios: H3_REF_CAPS.audios };
  const picked = (kind, src) => cur[kind].some((r) => r.src === src);
  const toggle = (kind, item) => {
    const has = picked(kind, item.src);
    if (!has && (cur[kind].length >= capOf[kind] || total >= H3_REF_CAPS.total)) return;
    const next = {
      ...cur,
      [kind]: has
        ? cur[kind].filter((r) => r.src !== item.src)
        : [...cur[kind], { src: item.src, label: item.label, ...(item.board ? { board: true } : {}) }],
    };
    onChange(next);
  };

  const section = (kind, title) => (
    <div className="refpick-sec">
      <div className="s5e-eyebrow">
        {title} · {cur[kind].length}/{capOf[kind]}
      </div>
      {candidates[kind].length === 0 ? (
        <p className="hint">{t('refs.none')}</p>
      ) : (
        <div className="refpick-grid">
          {candidates[kind].map((item, k) => (
            <button
              key={`${kind}${k}`}
              type="button"
              className={`refpick-item ${picked(kind, item.src) ? 'on' : ''}`}
              title={item.label}
              onClick={() => toggle(kind, item)}
            >
              {kind === 'images' && <img src={item.src} alt="" loading="lazy" decoding="async" />}
              {kind === 'videos' && <video src={item.src} preload="metadata" muted />}
              {kind === 'audios' && <span className="refpick-aud">♪</span>}
              <i>{item.label}</i>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide refpick-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-row">
          <h3>{t('refs.title', { n: shot.number || '' })}</h3>
          <span className={`total-badge ${total >= H3_REF_CAPS.total ? 'warn' : ''}`}>
            {t('refs.budget', { a: total, b: H3_REF_CAPS.total })}
          </span>
        </div>
        <p className="hint">{t('refs.hint')}</p>
        {section('images', t('refs.images'))}
        {section('videos', t('refs.videos'))}
        {section('audios', t('refs.audios'))}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            {t('refs.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
