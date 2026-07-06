import ProjectCard from '../components/ProjectCard.jsx';
import { useI18n } from '../lib/i18n.js';

export default function Archive({ projects, updateProject, removeProject, onOpen, onBack }) {
  const { t } = useI18n();
  const archived = projects
    .filter((p) => p.archived)
    .sort((a, b) => b.createdAt - a.createdAt);

  const del = (p) => {
    if (window.confirm(t('confirm.delete', { title: p.title }))) {
      removeProject(p.id);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <button className="btn back" onClick={onBack}>{t('archive.back')}</button>
          <h1>{t('archive.title')}</h1>
          <p className="subtitle">{t('archive.subtitle')}</p>
        </div>
      </header>

      {archived.length === 0 ? (
        <div className="empty"><p>{t('archive.empty')}</p></div>
      ) : (
        <div className="grid">
          {archived.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => onOpen(p.id)}
              onRestore={() => updateProject(p.id, { archived: false })}
              onDelete={() => del(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
