import { useI18n, localeOf } from '../lib/i18n.js';
import StageRing from './StageRing.jsx';
import { Copy, Archive as ArchiveIcon, Trash, RestoreIcon } from './icons.jsx';

const TINTS = ['#f4805e', '#60a5fa', '#ec6ead', '#8b5cf6'];

function tintOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

// Prefer the generated cover; fall back to the first reference photo.
function posterOf(project) {
  if (project.cover) return project.cover;
  const scenePhoto = project.outline?.find((s) => s.photos?.length)?.photos?.[0];
  if (scenePhoto) return scenePhoto;
  const charPhoto = project.storyline?.characters?.find((c) => c.photos?.length)?.photos?.[0];
  return charPhoto || null;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export default function ProjectCard({ project, onOpen, onArchive, onRestore, onDuplicate, onDelete }) {
  const { t, lang } = useI18n();
  const date = new Date(project.createdAt).toLocaleDateString(localeOf(lang), {
    month: 'short',
    day: 'numeric',
  });
  const poster = posterOf(project);
  const tint = tintOf(project.id);
  const rgb = hexToRgb(tint);

  const posterStyle = poster
    ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {
        background: `repeating-linear-gradient(45deg, rgba(${rgb},0.12) 0 12px, rgba(${rgb},0.05) 12px 24px)`,
      };

  return (
    <div className="sr-card">
      <div className="sr-poster" style={posterStyle} onClick={onOpen}>
        {!poster && (
          <span className="sr-poster-label" style={{ color: `rgba(${rgb},0.8)` }}>
            poster · 16:9
          </span>
        )}
        <span className="sr-date">{date}</span>
      </div>

      <div className="sr-body">
        <div className="sr-body-main">
          <h3 className="sr-title" onClick={onOpen}>{project.title}</h3>
          <div className="sr-tags">
            {project.genres.slice(0, 3).map((g) => (
              <span key={g} className="sr-tag">{g}</span>
            ))}
            {!project.genres.length && <span className="sr-tag muted">{t('card.noGenre')}</span>}
          </div>
        </div>
        <StageRing stage={Math.min(project.stage, 6)} total={6} />
      </div>

      <div className="sr-actions">
        <button className="btn primary sr-open" onClick={onOpen}>{t('card.open')}</button>
        {onDuplicate && (
          <button className="icon-btn" title={t('card.duplicate')} aria-label={t('card.duplicate')} onClick={onDuplicate}>
            <Copy size={15} />
          </button>
        )}
        {onArchive && (
          <button className="icon-btn" title={t('card.archive')} aria-label={t('card.archive')} onClick={onArchive}>
            <ArchiveIcon size={15} />
          </button>
        )}
        {onRestore && (
          <button className="icon-btn" title={t('card.restore')} aria-label={t('card.restore')} onClick={onRestore}>
            <RestoreIcon size={15} />
          </button>
        )}
        <button className="icon-btn danger" title={t('card.delete')} aria-label={t('card.delete')} onClick={onDelete}>
          <Trash size={15} />
        </button>
      </div>
    </div>
  );
}
