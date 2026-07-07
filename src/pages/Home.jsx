import { useState } from 'react';
import ProjectCard from '../components/ProjectCard.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';
import { newProject, uid } from '../lib/storage.js';
import { parseProjectFile } from '../lib/exportScript.js';
import { useI18n } from '../lib/i18n.js';

export default function Home({
  projects,
  setProjects,
  updateProject,
  removeProject,
  settings,
  setSettings,
  onOpen,
  onArchivePage,
  onSettings,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [showNew, setShowNew] = useState(false);

  const active = projects.filter((p) => !p.archived);
  const archivedCount = projects.length - active.length;

  const q = query.trim().toLowerCase();
  const filtered = active.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.genres.some((g) => g.toLowerCase().includes(q)) ||
      (p.logline || '').toLowerCase().includes(q)
  );
  const sorted = [...filtered].sort((a, b) =>
    sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );

  const create = (title, logline) => {
    const p = newProject({ title, logline });
    setProjects((ps) => [p, ...ps]);
    setShowNew(false);
    onOpen(p.id);
  };

  const del = (p) => {
    if (window.confirm(t('confirm.delete', { title: p.title }))) {
      removeProject(p.id);
    }
  };

  const duplicate = (p) => {
    const copy = structuredClone(p);
    copy.id = uid();
    copy.createdAt = Date.now();
    copy.archived = false;
    copy.title = `${p.title} ${t('card.copySuffix')}`;
    setProjects((ps) => [copy, ...ps]);
  };

  const importProject = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const p = parseProjectFile(String(reader.result));
      if (!p) {
        window.alert(t('imp.invalid'));
        return;
      }
      p.id = uid();
      p.createdAt = Date.now();
      p.archived = false;
      setProjects((ps) => [p, ...ps]);
    };
    reader.readAsText(file);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>🎬 StoryReel <span className="app-version">v{__APP_VERSION__}</span></h1>
          <p className="subtitle">{t('home.subtitle')}</p>
        </div>
        <div className="header-actions">
          <select
            className="lang-select"
            value={settings.lang || 'en'}
            onChange={(e) => setSettings({ ...settings, lang: e.target.value })}
            title={t('set.language')}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
            <option value="uk">UA</option>
          </select>
          <button className="btn" onClick={onArchivePage}>
            {t('home.archive')}{archivedCount ? ` (${archivedCount})` : ''}
          </button>
          <button className="btn" onClick={onSettings}>{t('home.settings')}</button>
          <label className="btn file-btn">
            {t('home.importProject')}
            <input type="file" accept=".md,.json,text/markdown,application/json" hidden onChange={importProject} />
          </label>
          <button className="btn primary" onClick={() => setShowNew(true)}>{t('home.new')}</button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('home.search')}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">{t('home.newest')}</option>
          <option value="oldest">{t('home.oldest')}</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          {active.length === 0 ? (
            <>
              <p>{t('home.noProjects')}</p>
              <button className="btn primary" onClick={() => setShowNew(true)}>
                {t('home.createFirst')}
              </button>
            </>
          ) : (
            <p>{t('home.noMatch', { q: query })}</p>
          )}
        </div>
      ) : (
        <div className="grid">
          {sorted.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => onOpen(p.id)}
              onArchive={() => updateProject(p.id, { archived: true })}
              onDuplicate={() => duplicate(p)}
              onDelete={() => del(p)}
            />
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onCreate={create} onClose={() => setShowNew(false)} />}
    </div>
  );
}
