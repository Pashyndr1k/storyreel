import { SHORT_DRAMA_STYLE_ID } from '../lib/series.js';
import { useState } from 'react';
import ProjectCard from '../components/ProjectCard.jsx';
import ProjectGroupModal from '../components/ProjectGroupModal.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';
import AppShell from '../components/AppShell.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { Upload, Plus, Search } from '../components/icons.jsx';
import Logo from '../components/Logo.jsx';
import { newProject, uid, migrateProject } from '../lib/storage.js';
import { parseProjectFile } from '../lib/exportScript.js';
import { importProjectZip, exportProjectZip } from '../lib/projectFiles.js';
import { useI18n } from '../lib/i18n.js';
import { appLog } from '../lib/actionLog.js';
import { groupProjects, childrenOf, childSpan } from '../lib/projectGroups.js';

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
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  // The sort choice survives navigation and restarts — Home unmounts whenever
  // a project opens, so plain component state silently reset it to "newest".
  const [sort, setSortState] = useState(() => localStorage.getItem('storyreel.homeSort.v1') || 'newest');
  const setSort = (v) => {
    setSortState(v);
    localStorage.setItem('storyreel.homeSort.v1', v);
  };
  const [showNew, setShowNew] = useState(false);
  // the split project (a series master with its episode projects, a project
  // with its parts) whose inner projects are shown in the pop-up
  const [openGroup, setOpenGroup] = useState(null);

  const active = projects.filter((p) => !p.archived);

  const q = query.trim().toLowerCase();
  const filtered = active.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.genres.some((g) => g.toLowerCase().includes(q)) ||
      (p.logline || '').toLowerCase().includes(q)
  );
  // Pinned projects always lead, whatever the sort order.
  const order = (a, b) => {
    if (sort === 'newest') return b.createdAt - a.createdAt;
    if (sort === 'oldest') return a.createdAt - b.createdAt;
    if (sort === 'edited') return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    if (sort === 'az') return a.title.localeCompare(b.title);
    if (sort === 'stage') return b.stage - a.stage;
    return 0;
  };
  const sorted = [...filtered].sort((a, b) => (a.pinned === b.pinned ? order(a, b) : a.pinned ? -1 : 1));

  const create = (title, logline, type, aspectRatio, episodeCount, episodeSeconds = 0) => {
    // both drama templates are series projects; the template picks the engine
    const scriptType = type === 'series2' ? 'series' : type;
    const dramaEngine = type === 'series2' ? 'v2' : 'v1';
    // a series starts with the Short Drama Series rules from the style library
    const p = newProject({
      title,
      logline,
      scriptType,
      aspectRatio,
      episodeCount,
      episodeSeconds,
      scriptStyleId: scriptType === 'series' ? SHORT_DRAMA_STYLE_ID : '',
      dramaEngine,
    });
    appLog('project.create', { projectId: p.id, title: p.title, scriptType, dramaEngine, aspectRatio, episodeCount: p.episodeCount || 0 });
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
    appLog('project.duplicate', { projectId: copy.id, from: p.id, title: copy.title });
    setProjects((ps) => [copy, ...ps]);
  };

  const addImported = (parsed) => {
    const p = migrateProject(parsed);
    p.id = uid();
    p.createdAt = Date.now();
    p.archived = false;
    appLog('project.import', { projectId: p.id, title: p.title });
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
    { value: 'edited', label: t('home.sortEdited') },
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
      theme={settings.theme || 'dark'}
      setTheme={(th) => setSettings({ ...settings, theme: th })}
    >
      <div className="title-row">
        <div className="title-left">
          <h1 className="page-title">{t('home.yourProjects')}</h1>
          <span className="count-chip">{active.length}</span>
        </div>
        <div className="title-actions">
          <div className="tr-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('home.search')}
              aria-label={t('home.search')}
            />
          </div>
          <Dropdown value={sort} options={sortOptions} onChange={setSort} title={t('home.newest')} />
          <label className="btn file-btn" title={t('tip.importProject')}>
            <Upload size={14} />
            {t('home.import')}
            <input type="file" accept=".zip,.md,.json,application/zip,text/markdown,application/json" className="sr-only" onChange={importProject} />
          </label>
          <button title={t('tip.newProject')} className="btn primary" onClick={() => setShowNew(true)}>
            <Plus size={14} />
            {t('home.newProject')}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-tile"><Logo size={38} /></div>
          {active.length === 0 ? (
            <>
              <p>{t('home.noProjects')}</p>
              <button title={t('tip.newProject')} className="btn primary" onClick={() => setShowNew(true)}>
                <Plus size={16} />
                {t('home.createFirst')}
              </button>
            </>
          ) : (
            <p>{t('home.noMatch', { q: query })}</p>
          )}
        </div>
      ) : (
        <div className="pgrid">
          {(() => {
            const card = (x, extra = {}) => (
              <ProjectCard
                key={x.id}
                project={x}
                onOpen={() => onOpen(x.id)}
                onArchive={() => updateProject(x.id, { archived: true }, { touch: false })}
                onPin={() => updateProject(x.id, { pinned: !x.pinned }, { touch: false })}
                onExport={() => exportProjectZip(x, lang).catch((e) => window.alert(e.message || String(e)))}
                onDuplicate={() => duplicate(x)}
                onDelete={() => del(x)}
                {...extra}
              />
            );
            // A split project is one card; clicking it opens a pop-up with the
            // projects inside it (the master, then its parts in story order,
            // nested parts navigable there). Searching shows every match flat.
            return groupProjects(sorted, active).map(({ project: p }) => {
              const children = q ? [] : childrenOf(active, p.id);
              if (!children.length) return card(p, { span: childSpan(p) });
              return card(p, { group: { count: children.length, expanded: openGroup === p.id }, onToggle: () => setOpenGroup(p.id), span: childSpan(p) });
            });
          })()}
        </div>
      )}

      {showNew && <NewProjectModal onCreate={create} onClose={() => setShowNew(false)} settings={settings} />}
      {openGroup && (
        <ProjectGroupModal
          rootId={openGroup}
          pool={active}
          onClose={() => setOpenGroup(null)}
          actions={{
            open: (id) => onOpen(id),
            archive: (p) => updateProject(p.id, { archived: true }, { touch: false }),
            pin: (p) => updateProject(p.id, { pinned: !p.pinned }, { touch: false }),
            exportZip: (p) => exportProjectZip(p, lang).catch((e) => window.alert(e.message || String(e))),
            duplicate,
            remove: del,
          }}
        />
      )}
    </AppShell>
  );
}
