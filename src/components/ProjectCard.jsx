import { useI18n, localeOf } from '../lib/i18n.js';
import { Copy, Archive as ArchiveIcon, Trash, RestoreIcon } from './icons.jsx';

// Prefer the generated cover; fall back to the first reference photo.
function posterOf(project) {
  if (project.cover) return project.cover;
  const scenePhoto = project.outline?.find((s) => s.photos?.length)?.photos?.[0];
  if (scenePhoto) return scenePhoto;
  const charPhoto = project.storyline?.characters?.find((c) => c.photos?.length)?.photos?.[0];
  return charPhoto || null;
}

// Dashboard project cell (design 5a): the whole card is the open action.
// The still sits grayscale under a paper wash and regains full colour on
// hover; progress is six accent segments plus a tabular counter.
export default function ProjectCard({ project, onOpen, onArchive, onRestore, onDuplicate, onDelete }) {
  const { t, lang } = useI18n();
  const date = new Date(project.createdAt).toLocaleDateString(localeOf(lang), {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const poster = posterOf(project);
  const stage = Math.max(1, Math.min(project.stage || 1, 6));

  const act = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className="pc"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {poster && <div className="pc-still" style={{ backgroundImage: `url(${poster})` }} />}
      <div className="pc-wash" />
      <div className="pc-in">
        <div className="pc-top">
          <span>{date}</span>
          <span className="pc-prog">
            <span className="pc-segs">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <span key={n} className={`pc-seg ${n <= stage ? 'on' : ''}`} />
              ))}
            </span>
            <span className="pc-count">{stage}/6</span>
          </span>
        </div>
        <h4 className="pc-title">{project.title}</h4>
        <div className="pc-tags">
          {project.genres.slice(0, 3).map((g) => (
            <span key={g} className="pc-tag">{g}</span>
          ))}
          {!project.genres.length && <span className="pc-tag">{t('card.noGenre')}</span>}
        </div>
        <div className="pc-foot">
          <div className="pc-acts">
            {onDuplicate && (
              <button className="icon-btn" title={t('card.duplicate')} aria-label={t('card.duplicate')} onClick={act(onDuplicate)}>
                <Copy size={14} />
              </button>
            )}
            {onArchive && (
              <button className="icon-btn" title={t('card.archive')} aria-label={t('card.archive')} onClick={act(onArchive)}>
                <ArchiveIcon size={14} />
              </button>
            )}
            {onRestore && (
              <button className="icon-btn" title={t('card.restore')} aria-label={t('card.restore')} onClick={act(onRestore)}>
                <RestoreIcon size={14} />
              </button>
            )}
            <button className="icon-btn danger" title={t('card.delete')} aria-label={t('card.delete')} onClick={act(onDelete)}>
              <Trash size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
