import { scenePhotos } from '../lib/sceneLocations.js';
import { STAGE_COUNT } from '../lib/config.js';
import { useI18n, localeOf } from '../lib/i18n.js';
import { useState } from 'react';
import { Copy, Archive as ArchiveIcon, Trash, RestoreIcon, Star, Download } from './icons.jsx';

// Prefer the generated cover; fall back to the first reference photo.
function posterOf(project) {
  if (project.cover) return project.cover;
  const scenePhoto = (project.outline || []).map((s) => scenePhotos(s, 1)[0]).find(Boolean);
  if (scenePhoto) return scenePhoto;
  const charPhoto = project.storyline?.characters?.find((c) => c.photos?.length)?.photos?.[0];
  return charPhoto || null;
}

// Dashboard project cell (design 5a): the whole card is the open action.
// The still sits grayscale under a paper wash and regains full colour on
// hover; progress is five accent segments plus a tabular counter.
// `group` = { count, expanded } turns the card into the head of a split
// project: the click shows / hides the projects inside it (onToggle); `master`
// marks that project inside the opened group; `span` labels a part ("Episodes
// 1–5 of 10", "Scenes 4–6 · part 2 of 3").
export default function ProjectCard({ project, onOpen, onArchive, onRestore, onDuplicate, onDelete, onPin, onExport, group = null, onToggle = null, master = false, span = null }) {
  const { t, lang } = useI18n();
  const [exporting, setExporting] = useState(false);
  // exporting a big project takes a moment; one click per run
  const runExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  };
  const date = new Date(project.createdAt).toLocaleDateString(localeOf(lang), {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const poster = posterOf(project);
  const stage = Math.max(1, Math.min(project.stage || 1, STAGE_COUNT));

  const act = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  // a group head opens the group, not the project
  const main = group ? onToggle : onOpen;
  const spanText = span ? (span.kind === 'episodes' ? t('card.episodes', { a: span.from, b: span.to, m: span.total }) : t('card.scenes', { a: span.from, b: span.to, n: span.index, m: span.total })) : '';

  return (
    <div
      className={`pc ${group ? 'pc-head' : ''} ${group?.expanded ? 'pc-open' : ''} ${master ? 'pc-master' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={group ? !!group.expanded : undefined}
      title={group ? t('card.groupTip', { n: group.count }) : master ? t('card.masterTip') : undefined}
      onClick={main}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          main();
        }
      }}
    >
      {poster && <div className="pc-still" style={{ backgroundImage: `url(${poster})` }} />}
      <div className="pc-wash" />
      <div className="pc-in">
        <div className="pc-top">
          {onPin && (
            <button
              type="button"
              className={`pc-pin ${project.pinned ? 'on' : ''}`}
              title={project.pinned ? t('card.unpin') : t('card.pin')}
              aria-label={project.pinned ? t('card.unpin') : t('card.pin')}
              aria-pressed={!!project.pinned}
              onClick={act(onPin)}
            >
              <Star size={13} filled={!!project.pinned} />
            </button>
          )}
          <span title={t('ind.created')}>{date}</span>
          <span className="pc-prog" title={t('ind.progress', { a: stage, b: STAGE_COUNT })}>
            <span className="pc-segs">
              {Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((n) => (
                <span key={n} className={`pc-seg ${n <= stage ? 'on' : ''}`} />
              ))}
            </span>
            <span className="pc-count">{stage}/{STAGE_COUNT}</span>
          </span>
        </div>
        <h4 className="pc-title" title={project.title}>{project.title}</h4>
        {(group || master || spanText) && (
          <div className="pc-kind">
            {group && (
              <span className="pc-group" title={t('card.groupTip', { n: group.count })}>
                {t(group.count === 1 ? 'card.group1' : 'card.group', { n: group.count })} <i className={`pc-chev ${group.expanded ? 'open' : ''}`} aria-hidden="true">▾</i>
              </span>
            )}
            {master && <span className="pc-group" title={t('card.masterTip')}>{t('card.master')}</span>}
            {spanText && <span className="pc-span" title={t('card.spanTip')}>{spanText}</span>}
          </div>
        )}
        <div className="pc-tags">
          {project.genres.slice(0, 3).map((g) => (
            <span key={g} className="pc-tag" title={t('ind.genre')}>{g}</span>
          ))}
          {!project.genres.length && <span className="pc-tag">{t('card.noGenre')}</span>}
        </div>
        <div className="pc-foot">
          <div className="pc-acts">
            {onExport && (
              <button
                className="icon-btn"
                title={t('card.export')}
                aria-label={t('card.export')}
                aria-busy={exporting}
                disabled={exporting}
                onClick={act(runExport)}
              >
                <Download size={16} />
              </button>
            )}
            {onDuplicate && (
              <button className="icon-btn" title={t('card.duplicate')} aria-label={t('card.duplicate')} onClick={act(onDuplicate)}>
                <Copy size={16} />
              </button>
            )}
            {onArchive && (
              <button className="icon-btn" title={t('card.archive')} aria-label={t('card.archive')} onClick={act(onArchive)}>
                <ArchiveIcon size={16} />
              </button>
            )}
            {onRestore && (
              <button className="icon-btn" title={t('card.restore')} aria-label={t('card.restore')} onClick={act(onRestore)}>
                <RestoreIcon size={16} />
              </button>
            )}
            <button className="icon-btn danger" title={t('card.delete')} aria-label={t('card.delete')} onClick={act(onDelete)}>
              <Trash size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
