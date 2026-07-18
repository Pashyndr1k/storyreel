import { useState } from 'react';
import ProjectCard from '../components/ProjectCard.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';
import AppShell from '../components/AppShell.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { Upload, Plus, Clapperboard } from '../components/icons.jsx';
import { newProject, uid, migrateProject } from '../lib/storage.js';
import { parseProjectFile } from '../lib/exportScript.js';
import { importProjectZip } from '../lib/projectFiles.js';
import { useI18n } from '../lib/i18n.js';

export default function Home({
  projects,
  setProjects,
  updateProject,
  removeProject,
  settings,
  setSettings,
  onOpen,
  onNav,
  onArchivePage,
  onSettings,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [showNew, setShowNew] = useState(false);

  const active = projects.filter((p) => !p.archived);

  const q = query.trim().toLowerCase();
  const filtered = active.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.genres.some((g) => g.toLowerCase().includes(q)) ||
      (p.logline || '').toLowerCase().includes(q)
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'newest') return b.createdAt - a.createdAt;
    if (sort === 'oldest') return a.createdAt - b.createdAt;
    if (sort === 'az') return a.title.localeCompare(b.title);
    if (sort === 'stage') return b.stage - a.stage;
    return 0;
  });

  const create = (title, logline, scriptType, aspectRatio) => {
    const p = newProject({ title, logline, scriptType, aspectRatio });
    setProjects((ps) => [p, ...ps]);
    setShowNew(false);
    onOpen(p.id);
  };

  const del = (p) => {
    if (window.confirm(t('confirm.delete', { title: p.title }))) removeProject(p.id);
  };

  const duplicate = (p) => {
    const copy = structuredClone(p);
    copy.id = uid();
    copy.createdAt = Date.now();
    copy.archived = false;
    copy.title = `${p.title} ${t('card.copySuffix')}`;
    setProjects((ps) => [copy, ...ps]);
  };

  const addImported = (parsed) => {
    const p = migrateProject(parsed);
    p.id = uid();
    p.createdAt = Date.now();
    p.archived = false;
    setProjects((ps) => [p, ...ps]);
  };

  const importProject = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      // ZIP export (project.md + media files) or a legacy .md/.json file.
      if (/\.zip$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        addImported(await importProjectZip(bytes));
        return;
      }
      const text = await file.text();
      const parsed = parseProjectFile(text);
      if (!parsed) {
        window.alert(t('imp.invalid'));
        return;
      }
      addImported(parsed);
    } catch (err) {
      window.alert(err.message || String(err));
    }
  };

  const sortOptions = [
    { value: 'newest', label: t('home.newest') },
    { value: 'oldest', label: t('home.oldest') },
    { value: 'az', label: t('home.sortAZ') },
    { value: 'stage', label: t('home.sortStage') },
  ];

  return (
    <AppShell
      route="home"
      onNavigate={onNav || ((r) => r === 'archive' && onArchivePage())}
      onSettings={onSettings}
      lang={settings.lang || 'en'}
      setLang={(l) => setSettings({ ...settings, lang: l })}
      search={{ value: query, onChange: setQuery, placeholder: t('home.search') }}
    >
      <div className="title-row">
        <div className="title-left">
          <h1 className="page-title">{t('home.yourProjects')}</h1>
          <span className="count-chip">{active.length}</span>
        </div>
        <div className="title-actions">
          <Dropdown value={sort} options={sortOptions} onChange={setSort} title={t('home.newest')} />
          <label className="glass-btn file-btn">
            <Upload size={15} />
            {t('home.import')}
            <input type="file" accept=".zip,.md,.json,application/zip,text/markdown,application/json" hidden onChange={importProject} />
          </label>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Plus size={16} />
            {t('home.newProject')}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-tile"><Clapperboard size={30} /></div>
          {active.length === 0 ? (
            <>
              <p>{t('home.noProjects')}</p>
              <button className="btn primary" onClick={() => setShowNew(true)}>
                <Plus size={16} />
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

      {showNew && <NewProjectModal onCreate={create} onClose={() => setShowNew(false)} settings={settings} />}
    </AppShell>
  );
}
