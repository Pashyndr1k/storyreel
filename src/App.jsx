import { useEffect, useMemo, useRef, useState } from 'react';
import Home from './pages/Home.jsx';
import Archive from './pages/Archive.jsx';
import Project from './pages/Project.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import { loadLibrary, persistLibraryEntry, deleteLibraryEntry } from './lib/library.js';
import SettingsModal from './components/SettingsModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { loadProjects, saveProjects, loadSettings, saveSettings } from './lib/storage.js';
import { loadStyles, saveStyles, absorbLegacyStyles } from './lib/styles.js';
import { checkForUpdate } from './lib/updateCheck.js';
import { mirrorProjectToDisk } from './lib/projectFiles.js';
import { I18nContext, createT } from './lib/i18n.js';

const HISTORY_LIMIT = 50;
const HISTORY_COALESCE_MS = 800;
const SAVE_DEBOUNCE_MS = 500;

export default function App() {
  const [projects, setProjectsRaw] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [styles, setStyles] = useState(loadStyles);
  const [library, setLibrary] = useState([]);
  const [route, setRoute] = useState({ name: 'home' });
  const [showSettings, setShowSettings] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const histRef = useRef({ past: [], future: [], lastPush: 0 });
  const saveTimer = useRef(null);
  const pendingRef = useRef(null);
  const stylesSaveArmed = useRef(false);

  const i18n = useMemo(
    () => ({ t: createT(settings.lang), lang: settings.lang || 'en' }),
    [settings.lang]
  );
  const { t } = i18n;

  // Load projects from IndexedDB (with one-time localStorage migration), then
  // absorb any pre-1.4.0 per-project prompts into the shared style library.
  useEffect(() => {
    let alive = true;
    loadProjects().then((ps) => {
      if (!alive) return;
      const res = absorbLegacyStyles(ps, styles);
      if (res.changed) {
        setStyles(res.styles);
        saveStyles(res.styles);
        saveProjects(res.projects);
      }
      setProjectsRaw(res.changed ? res.projects : ps);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist styles only after a genuine change — never on the initial render, so
  // a corrupt-load fallback can't overwrite the (stashed) stored data.
  useEffect(() => {
    if (!stylesSaveArmed.current) {
      stylesSaveArmed.current = true;
      return;
    }
    saveStyles(styles);
  }, [styles]);

  // Ask the browser/Electron to keep our storage instead of evicting it.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // Character/location library (IndexedDB, write-through).
  useEffect(() => {
    let alive = true;
    loadLibrary().then((rows) => alive && setLibrary(rows));
    return () => {
      alive = false;
    };
  }, []);

  const libUpsert = (entry) => {
    setLibrary((prev) => {
      const ex = prev.find((e) => e.id === entry.id);
      const merged = { ...entry, createdAt: ex?.createdAt ?? entry.createdAt ?? Date.now() };
      persistLibraryEntry(merged);
      return ex ? prev.map((e) => (e.id === merged.id ? merged : e)) : [...prev, merged];
    });
  };

  const libDelete = (id) => {
    setLibrary((prev) => prev.filter((e) => e.id !== id));
    deleteLibraryEntry(id);
  };

  const onNav = (r) => setRoute({ name: r });

  // All mutations go through this setter so they land in the undo history.
  // Rapid changes (typing) within HISTORY_COALESCE_MS merge into one step.
  const setProjects = (updater) =>
    setProjectsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      const h = histRef.current;
      const now = Date.now();
      if (now - h.lastPush > HISTORY_COALESCE_MS) {
        h.past.push(prev);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.lastPush = now;
      h.future = [];
      return next;
    });

  const undo = () =>
    setProjectsRaw((cur) => {
      const h = histRef.current;
      if (!h.past.length) return cur;
      const prev = h.past.pop();
      h.future.push(cur);
      h.lastPush = 0;
      return prev;
    });

  const redo = () =>
    setProjectsRaw((cur) => {
      const h = histRef.current;
      if (!h.future.length) return cur;
      const next = h.future.pop();
      h.past.push(cur);
      h.lastPush = 0;
      return next;
    });

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y). Inside text fields the browser's
  // native text undo wins; app-level undo covers structural changes.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced persistence: at most one diffed IndexedDB write per pause.
  // Each save also mirrors the changed projects into their on-disk folders
  // (<projectsDir>/<title>/: project.md + media as standard files) — created
  // the moment a new project is saved for the first time. Best-effort and
  // Electron-only; IndexedDB remains the live source of truth.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const mirroredRef = useRef(new Map()); // projectId -> last mirrored object
  const mirrorChanged = (ps) => {
    for (const p of ps) {
      if (mirroredRef.current.get(p.id) === p) continue;
      mirroredRef.current.set(p.id, p);
      mirrorProjectToDisk(settingsRef.current, p, p.lang || settingsRef.current.lang);
    }
  };
  useEffect(() => {
    if (!loaded) return;
    pendingRef.current = projects;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pendingRef.current = null;
      saveProjects(projects);
      mirrorChanged(projects);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [projects, loaded]);

  // Flush the pending save when the window closes or goes to the background.
  useEffect(() => {
    const flush = () => {
      if (pendingRef.current) {
        const p = pendingRef.current;
        pendingRef.current = null;
        clearTimeout(saveTimer.current);
        saveProjects(p);
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);
  useEffect(() => {
    checkForUpdate(__APP_VERSION__).then((u) => u && setUpdateInfo(u));
  }, []);

  const updateProject = (id, patch) =>
    setProjects((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))
    );

  const removeProject = (id) => {
    setProjects((ps) => ps.filter((p) => p.id !== id));
    if (route.name === 'project' && route.id === id) setRoute({ name: 'home' });
  };

  const current = route.name === 'project' ? projects.find((p) => p.id === route.id) : null;

  return (
    <I18nContext.Provider value={i18n}>
    <div className="app">
      <ErrorBoundary key={`${route.name}:${route.id || ''}`} onHome={() => setRoute({ name: 'home' })}>
      {loaded && route.name === 'home' && (
        <Home
          projects={projects}
          setProjects={setProjects}
          updateProject={updateProject}
          removeProject={removeProject}
          settings={settings}
          setSettings={setSettings}
          onOpen={(id) => setRoute({ name: 'project', id })}
          onNav={onNav}
          onArchivePage={() => setRoute({ name: 'archive' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {loaded && route.name === 'archive' && (
        <Archive
          projects={projects}
          updateProject={updateProject}
          removeProject={removeProject}
          settings={settings}
          setSettings={setSettings}
          onOpen={(id) => setRoute({ name: 'project', id })}
          onNav={onNav}
          onBack={() => setRoute({ name: 'home' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {loaded && (route.name === 'characters' || route.name === 'locations') && (
        <LibraryPage
          kind={route.name === 'locations' ? 'location' : 'character'}
          library={library}
          libUpsert={libUpsert}
          libDelete={libDelete}
          settings={settings}
          setSettings={setSettings}
          onNav={onNav}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {loaded && route.name === 'project' && current && (
        <Project
          project={current}
          updateProject={updateProject}
          settings={settings}
          setSettings={setSettings}
          styles={styles}
          setStyles={setStyles}
          library={library}
          libUpsert={libUpsert}
          libDelete={libDelete}
          onBack={() => setRoute({ name: 'home' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      </ErrorBoundary>
      {showSettings && (
        <SettingsModal
          settings={settings}
          setSettings={setSettings}
          projects={projects}
          styles={styles}
          setStyles={setStyles}
          onClose={() => setShowSettings(false)}
        />
      )}
      {updateInfo && (
        <div className="stale-toast update-toast">
          <p>{t('upd.msg', { v: updateInfo.version })}</p>
          <div className="row">
            <a className="btn small primary" href={updateInfo.url} target="_blank" rel="noreferrer">
              {t('upd.get')}
            </a>
            <button className="btn small" onClick={() => setUpdateInfo(null)}>
              {t('upd.later')}
            </button>
          </div>
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}
