import { useI18n } from '../lib/i18n.js';

export default function ProjectCard({ project, onOpen, onArchive, onRestore, onDelete }) {
  const { t, lang } = useI18n();
  const date = new Date(project.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="card">
      <div className="card-body" onClick={onOpen}>
        <h3>{project.title}</h3>
        <div className="tags">
          {project.genres.slice(0, 3).map((g) => (
            <span key={g} className="tag">{g}</span>
          ))}
          {!project.genres.length && <span className="tag muted">{t('card.noGenre')}</span>}
        </div>
        <div className="card-meta">
          <span>{date}</span>
          <span className="stage-badge">{t('card.stage', { n: Math.min(project.stage, 5) })}</span>
        </div>
      </div>
      <div className="card-actions">
        <button className="btn primary small" onClick={onOpen}>{t('card.open')}</button>
        {onArchive && <button className="btn small" onClick={onArchive}>{t('card.archive')}</button>}
        {onRestore && <button className="btn small" onClick={onRestore}>{t('card.restore')}</button>}
        <button className="btn danger small" onClick={onDelete}>{t('card.delete')}</button>
      </div>
    </div>
  );
}
