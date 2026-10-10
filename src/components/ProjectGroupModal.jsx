import { useState } from 'react';
import { useI18n, localeOf } from '../lib/i18n.js';
import { STAGE_COUNT } from '../lib/config.js';
import { childrenOf, childSpan } from '../lib/projectGroups.js';
import { Copy, Archive as ArchiveIcon, Trash, Download, Star } from './icons.jsx';

// The projects inside a split project, in a pop-up: the master first, then
// its parts in story order, as compact rows (no cover) with the same actions
// as the cards. A part that was split again opens inside the same pop-up
// (its own master and parts), with a way back.
function Row({ project, span, master, group, onOpen, onEnter, onArchive, onDuplicate, onDelete, onExport, onPin }) {
  const { t, lang } = useI18n();
  const [exporting, setExporting] = useState(false);
  const stage = Math.max(1, Math.min(project.stage || 1, STAGE_COUNT));
  const date = new Date(project.createdAt).toLocaleDateString(localeOf(lang), { month: '2-digit', day: '2-digit', year: 'numeric' });
  const spanText = span ? (span.kind === 'episodes' ? t('card.episodes', { a: span.from, b: span.to, m: span.total }) : t('card.scenes', { a: span.from, b: span.to, n: span.index, m: span.total })) : '';
  const act = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  const runExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className={`pcc ${master ? 'pcc-master' : ''}`}
      role="button"
      tabIndex={0}
      title={master ? t('card.masterTip') : t('card.openTip')}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="pcc-main">
        <div className="pcc-title">{project.title}</div>
        <div className="pcc-meta">
          {master && <span className="pc-group" title={t('card.masterTip')}>{t('card.master')}</span>}
          {spanText && <span className="pc-span" title={t('card.spanTip')}>{spanText}</span>}
          {group > 0 && (
            <button type="button" className="pc-group pcc-enter" title={t('card.groupTip', { n: group })} onClick={act(onEnter)}>
              {t(group === 1 ? 'card.group1' : 'card.group', { n: group })} ›
            </button>
          )}
          <span className="pcc-date" title={t('ind.created')}>{date}</span>
          <span className="pc-prog" title={t('ind.progress', { a: stage, b: STAGE_COUNT })}>
            <span className="pc-segs">
              {Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).map((n) => (
                <span key={n} className={`pc-seg ${n <= stage ? 'on' : ''}`} />
              ))}
            </span>
            <span className="pc-count">{stage}/{STAGE_COUNT}</span>
          </span>
        </div>
      </div>
      <div className="pcc-acts">
        <button type="button" className={`icon-btn ${project.pinned ? 'on' : ''}`} title={project.pinned ? t('card.unpin') : t('card.pin')} aria-label={project.pinned ? t('card.unpin') : t('card.pin')} onClick={act(onPin)}>
          <Star size={15} filled={!!project.pinned} />
        </button>
        <button type="button" className="icon-btn" title={t('card.export')} aria-label={t('card.export')} aria-busy={exporting} disabled={exporting} onClick={act(runExport)}>
          <Download size={15} />
        </button>
        <button type="button" className="icon-btn" title={t('card.duplicate')} aria-label={t('card.duplicate')} onClick={act(onDuplicate)}>
          <Copy size={15} />
        </button>
        <button type="button" className="icon-btn" title={t('card.archive')} aria-label={t('card.archive')} onClick={act(onArchive)}>
          <ArchiveIcon size={15} />
        </button>
        <button type="button" className="icon-btn danger" title={t('card.delete')} aria-label={t('card.delete')} onClick={act(onDelete)}>
          <Trash size={15} />
        </button>
      </div>
    </div>
  );
}

// `rootId`: the split project whose card was clicked; `pool`: the active
// projects; `actions`: { open, archive, duplicate, remove, exportZip, pin }.
export default function ProjectGroupModal({ rootId, pool, actions, onClose }) {
  const { t } = useI18n();
  const [path, setPath] = useState([rootId]); // the group shown, deepest last
  const current = pool.find((p) => p.id === path[path.length - 1]);
  // the group vanished (deleted / archived): step back, or close
  if (!current) {
    if (path.length > 1) setPath(path.slice(0, -1));
    else onClose();
    return null;
  }
  const children = childrenOf(pool, current.id);
  const row = (p, extra) => (
    <Row
      key={p.id}
      project={p}
      group={childrenOf(pool, p.id).length}
      onOpen={() => actions.open(p.id)}
      onEnter={() => setPath([...path, p.id])}
      onArchive={() => actions.archive(p)}
      onDuplicate={() => actions.duplicate(p)}
      onDelete={() => actions.remove(p)}
      onExport={() => actions.exportZip(p)}
      onPin={() => actions.pin(p)}
      {...extra}
    />
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal pgm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('card.insideTitle', { title: current.title })}>
        <div className="modal-head-row">
          <h2 title={t('card.insideTip')}>{t('card.insideTitle', { title: current.title })}</h2>
          <button type="button" className="modal-x" title={t('tip.close')} aria-label={t('tip.close')} onClick={onClose}>✕</button>
        </div>
        {path.length > 1 && (
          <button type="button" className="btn small pgm-back" title={t('card.backTip')} onClick={() => setPath(path.slice(0, -1))}>
            ← {t('card.back')}
          </button>
        )}
        <div className="pgm-list">
          {row(current, { master: true, span: childSpan(current), group: 0 })}
          {children.map((c) => row(c, { span: childSpan(c) }))}
        </div>
      </div>
    </div>
  );
}
