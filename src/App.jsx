import { useEffect, useMemo, useRef, useState } from 'react';
import Home from './pages/Home.jsx';
import Archive from './pages/Archive.jsx';
import Project from './pages/Project.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import StylesPage from './pages/StylesPage.jsx';
import { loadLibrary, persistLibraryEntry, deleteLibraryEntry, rebuildLibraryFromProjects } from './lib/library.js';
import SettingsModal from './components/SettingsModal.jsx';
import PolicyNotice from './components/PolicyNotice.jsx';
import { POLICY_EVENT } from './lib/policy.js';
import { useAgentScope } from './lib/agent/registry.js';
import { callAgent, toolList } from './lib/agent/api.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { loadProjects, saveProjects, loadSettings, saveSettings, hasStoredSettings, migrateProject, isCold, hydrateProject, hydrateCached, noteHydrated } from './lib/storage.js';
import { vaultAvailable, vaultRoot, vaultReadLibrary, vaultWriteLibrary, vaultReadJson, vaultWriteJson, settingsForVault } from './lib/vault.js';
import { loadStyles, saveStyles, absorbLegacyStyles, hasStoredStyles } from './lib/styles.js';
import { checkForUpdate } from './lib/updateCheck.js';
import { mirrorProjectToDisk } from './lib/projectFiles.js';
import { I18nContext, createT } from './lib/i18n.js';
import { appLog, withLogEntry, patchKeys } from './lib/actionLog.js';

const HISTORY_LIMIT = 50;
const HISTORY_COALESCE_MS = 800;
const SAVE_DEBOUNCE_MS = 500;

export default function App() {
  const [projects, setProjectsRaw] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [styles, setStyles] = useState(loadStyles);
  const [library, setLibrary] = useState([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [vaultChecked, setVaultChecked] = useState(false); // the vault's start-up pass ran (lib/vault.js)
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

  const mirroredRef = useRef(new Map()); // projectId -> last mirrored object
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  // Projects load without their media (lib/storage.js, lazy media): a
  // project's images, videos and audio are read when it is opened, or when
  // the agent works on it. Returns true when media was loaded.
  const hydrateInState = async (id) => {
    const p = projectsRef.current.find((x) => x.id === id);
    if (!p || !isCold(p)) return false;
    await hydrateProject(p);
    setProjectsRaw((ps) =>
      ps.map((x) => {
        if (x.id !== id || !isCold(x)) return x;
        const full = hydrateCached(x);
        if (!full) return x;
        noteHydrated(x, full);
        if (mirroredRef.current.get(id) === x) mirroredRef.current.set(id, full);
        return full;
      })
    );
    return true;
  };

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
      // what was just loaded is already on disk: the mirror follows changes
      // from here on (re-writing every project at start-up read and sent
      // gigabytes of media through the bridge each launch)
      for (const p of res.changed ? res.projects : ps) mirroredRef.current.set(p.id, p);
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
    loadLibrary().then((rows) => {
      if (!alive) return;
      setLibrary(rows);
      setLibLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A project the library holds nothing for (its entries lost, or made before
  // the library existed) gets the entries its cards imply — characters,
  // locations and story assets with photos — so shots that reference them by
  // id and the asset picker work again.
  // A project without media in memory is checked on its references first and
  // read only when it really has entries to give.
  useEffect(() => {
    if (!loaded || !libLoaded || !vaultChecked) return;
    let alive = true;
    (async () => {
      const owners = new Set(rebuildLibraryFromProjects(projects, library).map((e) => e.projectId));
      if (!owners.size) return;
      const full = [];
      for (const p of projects) if (owners.has(p.id)) full.push(isCold(p) ? await hydrateProject(p, { cache: false }) : p);
      const add = rebuildLibraryFromProjects(full, libraryRef.current);
      if (!alive || !add.length) return;
      appLog('library.rebuild', { entries: add.length, projects: [...new Set(add.map((e) => e.projectId))].length });
      setLibrary((prev) => [...prev, ...add.filter((e) => !prev.some((x) => x.id === e.id))]);
      for (const e of add) persistLibraryEntry(e);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, libLoaded, vaultChecked]);

  // A project brought back from its folder (Settings → Backups) keeps its
  // id, dates and parts; one already present is left alone.
  // "Back up now" (Settings → Backups): every project's folder rewritten,
  // one project at a time (the mirror normally follows changes only)
  const backupAllProjects = async () => {
    for (const p of projects) {
      mirroredRef.current.set(p.id, p);
      // a project not opened this session is read for its folder only
      const full = isCold(p) ? await hydrateProject(p, { cache: false }) : p;
      await mirrorProjectToDisk(settingsRef.current, full, p.lang || settingsRef.current.lang);
    }
  };

  const restoreProjects = (list, from) => {
    const restored = list.map((p) => ({ ...migrateProject(p), archived: !!p.archived }));
    for (const p of restored) appLog('project.restore', { projectId: p.id, title: p.title, folder: from?.folder || '' });
    setProjects((ps) => [...restored.filter((p) => !ps.some((x) => x.id === p.id)), ...ps]);
  };

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
      appLog('undo');
      return prev;
    });

  const redo = () =>
    setProjectsRaw((cur) => {
      const h = histRef.current;
      if (!h.future.length) return cur;
      const next = h.future.pop();
      h.past.push(cur);
      h.lastPush = 0;
      appLog('redo');
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
      // The disk mirror re-serializes the whole project (markdown + media
      // split) — heavy string work. Run it when the main thread is idle so it
      // never competes with typing or stage switches.
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
      idle(() => mirrorChanged(projects));
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

  // ---- the vault (lib/vault.js): the library, the styles and the settings as
  // files under the projects directory — what the browser stores come back
  // from when they are lost. Start-up: restore what is missing (an empty
  // library store with a vault → the vault's entries; no stored styles or
  // settings → the vault's copies) or create the vault; then every change
  // goes to the vault once it settles.
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const vaultTimer = useRef(null);
  const vaultArmed = useRef(false);
  useEffect(() => {
    if (!libLoaded) return;
    if (!vaultAvailable()) {
      setVaultChecked(true);
      return;
    }
    (async () => {
      const root = vaultRoot(settingsRef.current);
      try {
        const stored = await vaultReadLibrary(root, { withPhotos: false });
        if (stored === null) {
          await vaultWriteLibrary(root, libraryRef.current);
        } else if (!libraryRef.current.length && stored.length) {
          const full = await vaultReadLibrary(root);
          appLog('library.restoreVault', { entries: full.length });
          setLibrary(full);
          for (const e of full) persistLibraryEntry(e);
        }
        if (!hasStoredStyles()) {
          const s = await vaultReadJson(root, 'styles.json');
          if (s) {
            appLog('styles.restoreVault');
            setStyles(s);
          }
        }
        if (!hasStoredSettings()) {
          const s = await vaultReadJson(root, 'settings.json');
          if (s) {
            appLog('settings.restoreVault');
            setSettings((cur) => ({ ...cur, ...s }));
          }
        }
      } catch (e) {
        console.error('vault start-up failed', e);
      }
      setVaultChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libLoaded]);
  useEffect(() => {
    if (!vaultChecked || !vaultAvailable()) return;
    // the state at the end of the start-up pass is already in the vault
    if (!vaultArmed.current) {
      vaultArmed.current = true;
      return;
    }
    clearTimeout(vaultTimer.current);
    vaultTimer.current = setTimeout(() => vaultWriteLibrary(vaultRoot(settingsRef.current), libraryRef.current).catch(() => {}), 1500);
    return () => clearTimeout(vaultTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, vaultChecked]);
  useEffect(() => {
    if (!vaultChecked || !vaultAvailable()) return;
    vaultWriteJson(vaultRoot(settings), 'styles.json', styles).catch(() => {});
  }, [styles, vaultChecked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!vaultChecked || !vaultAvailable()) return;
    vaultWriteJson(vaultRoot(settings), 'settings.json', settingsForVault(settings)).catch(() => {});
  }, [settings, vaultChecked]);

  useEffect(() => saveSettings(settings), [settings]);
  // A generation refused by the active content policy reports here.
  const [policyNotice, setPolicyNotice] = useState(null);
  useEffect(() => {
    const onPolicy = (e) => setPolicyNotice(e.detail);
    window.addEventListener(POLICY_EVENT, onPolicy);
    return () => window.removeEventListener(POLICY_EVENT, onPolicy);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);
  useEffect(() => {
    document.documentElement.setAttribute('data-font', settings.uiFont || 'default');
  }, [settings.uiFont]);
  useEffect(() => {
    checkForUpdate(__APP_VERSION__).then((u) => u && setUpdateInfo(u));
  }, []);

  // Content edits stamp updatedAt (the "last edited" sort reads it). View-only
  // changes — pinning, archiving — pass { touch: false } so they don't pretend
  // the film was worked on.
  // Every content change is also written to the project's own action log
  // (which fields, by whom — the user or the agent); explicit actions pass a
  // patch made with logged() and keep their name.
  const updateProject = (id, patch, { touch = true } = {}) =>
    setProjects((ps) =>
      ps.map((p) => {
        if (p.id !== id) return p;
        const body = typeof patch === 'function' ? patch(p) : patch;
        const keys = patchKeys(body);
        const log = touch && keys.length && !('actionLog' in body) ? { actionLog: withLogEntry(p, { action: 'edit', keys }) } : {};
        return { ...p, ...body, ...log, ...(touch ? { updatedAt: Date.now() } : {}) };
      })
    );

  // ---- AI agent access: the app-level scope the agent API works through,
  // and the bridge to the local server in the desktop app's main process.
  useAgentScope('app', {
    version: __APP_VERSION__,
    projects,
    settings,
    styles,
    library,
    lang: settings.lang || 'en',
    updateProject: (id, patch) => updateProject(id, patch),
    addProjects: (list) => setProjects((ps) => [...list, ...ps]),
    openProject: (id) => setRoute((r) => (r.name === 'project' && r.id === id ? r : { name: 'project', id })),
    ensureHydrated: hydrateInState,
  });
  useEffect(() => {
    // dev and tests reach the same entry point without the server
    window.__storyreelAgent = { call: callAgent, tools: toolList };
    return window.agentBridge?.onCall?.((method, params) => (method === '__tools' ? { ok: true, result: toolList() } : callAgent(method, params)));
  }, []);
  useEffect(() => {
    window.agentBridge?.configure?.({ enabled: !!settings.agentEnabled, port: Number(settings.agentPort) || 47821 });
  }, [settings.agentEnabled, settings.agentPort]);

  const removeProject = (id) => {
    appLog('project.delete', { projectId: id, title: projects.find((p) => p.id === id)?.title || '' });
    setProjects((ps) => ps.filter((p) => p.id !== id));
    if (route.name === 'project' && route.id === id) setRoute({ name: 'home' });
  };

  const current = route.name === 'project' ? projects.find((p) => p.id === route.id) : null;
  // the open project's media is read when it opens (and again after an undo
  // that brings back its media-free version — from memory then)
  const currentCold = !!current && isCold(current);
  const [openError, setOpenError] = useState(null);
  useEffect(() => {
    if (!currentCold) return;
    setOpenError(null);
    hydrateInState(current.id).catch((e) => setOpenError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, currentCold]);

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
      {loaded && route.name === 'styles' && (
        <StylesPage
          styles={styles}
          setStyles={setStyles}
          settings={settings}
          setSettings={setSettings}
          onNav={onNav}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {loaded && route.name === 'project' && currentCold && (
        <div className="app-opening" title={t('app.openingHint')}>
          {openError ? t('app.openFailed', { error: openError }) : t('app.opening', { title: current.title || '' })}
        </div>
      )}
      {loaded && route.name === 'project' && current && !currentCold && (
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
          addProjects={(list) => setProjects((ps) => [...list, ...ps])}
          openProject={(id) => setRoute({ name: 'project', id })}
          projectExists={(id) => projects.some((p) => p.id === id)}
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
          library={library}
          setLibrary={setLibrary}
          onRestoreProjects={restoreProjects}
          onBackupProjects={backupAllProjects}
          onClose={() => setShowSettings(false)}
        />
      )}
      {!settings.h3NoticeShown && settings.videoEngine !== 'minimax' && (
        <div className="stale-toast update-toast">
          <p>{t('h3n.msg')}</p>
          <div className="row">
            <button title={t('tip.h3nOpen')}
              className="btn small primary"
              onClick={() => {
                setSettings((s) => ({ ...s, h3NoticeShown: true }));
                setShowSettings(true);
              }}
            >
              {t('h3n.open')}
            </button>
            <button title={t('tip.later')} className="btn small" onClick={() => setSettings((s) => ({ ...s, h3NoticeShown: true }))}>
              {t('upd.later')}
            </button>
          </div>
        </div>
      )}
      {policyNotice && <PolicyNotice notice={policyNotice} onClose={() => setPolicyNotice(null)} />}
      {updateInfo && (
        <div className="stale-toast update-toast">
          <p>{t('upd.msg', { v: updateInfo.version })}</p>
          <div className="row">
            <a className="btn small primary" href={updateInfo.url} target="_blank" rel="noreferrer">
              {t('upd.get')}
            </a>
            <button title={t('tip.later')} className="btn small" onClick={() => setUpdateInfo(null)}>
              {t('upd.later')}
            </button>
          </div>
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}
