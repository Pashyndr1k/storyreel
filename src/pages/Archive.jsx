import ProjectCard from '../components/ProjectCard.jsx';
import AppShell from '../components/AppShell.jsx';
import { Clapperboard } from '../components/icons.jsx';
import { useI18n } from '../lib/i18n.js';

export default function Archive({ projects, updateProject, removeProject, settings, setSettings, onOpen, onNav, onBack, onSettings }) {
  const { t } = useI18n();
  const archived = projects
    .filter((p) => p.archived)
    .sort((a, b) => b.createdAt - a.createdAt);

  const del = (p) => {
    if (window.confirm(t('confirm.delete', { title: p.title }))) removeProject(p.id);
  };

  return (
    <AppShell
      route="archive"
      onNavigate={onNav || ((r) => r === 'home' && onBack())}
      onSettings={onSettings}
      lang={settings.lang || 'en'}
      setLang={(l) => setSettings({ ...settings, lang: l })}
      theme={settings.theme || 'dark'}
      setTheme={(th) => setSettings({ ...settings, theme: th })}
    >
      <div className="title-row">
        <div className="title-left">
          <h1 className="page-title">{t('archive.title')}</h1>
          <span className="count-chip">{archived.length}</span>
        </div>
      </div>
      <p className="section-sub">{t('archive.subtitle')}</p>

      {archived.length === 0 ? (
        <div className="empty">
          <div className="empty-tile"><Clapperboard size={30} /></div>
          <p>{t('archive.empty')}</p>
        </div>
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
    </AppShell>
  );
}
