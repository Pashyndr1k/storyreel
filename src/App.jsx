import { useEffect, useMemo, useState } from 'react';
import Home from './pages/Home.jsx';
import Archive from './pages/Archive.jsx';
import Project from './pages/Project.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { loadProjects, saveProjects, loadSettings, saveSettings } from './lib/storage.js';
import { I18nContext, createT } from './lib/i18n.js';

export default function App() {
  const [projects, setProjects] = useState(loadProjects);
  const [settings, setSettings] = useState(loadSettings);
  const [route, setRoute] = useState({ name: 'home' });
  const [showSettings, setShowSettings] = useState(false);

  const i18n = useMemo(
    () => ({ t: createT(settings.lang), lang: settings.lang || 'en' }),
    [settings.lang]
  );

  useEffect(() => saveProjects(projects), [projects]);
  useEffect(() => saveSettings(settings), [settings]);

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
      {route.name === 'home' && (
        <Home
          projects={projects}
          setProjects={setProjects}
          updateProject={updateProject}
          removeProject={removeProject}
          settings={settings}
          setSettings={setSettings}
          onOpen={(id) => setRoute({ name: 'project', id })}
          onArchivePage={() => setRoute({ name: 'archive' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {route.name === 'archive' && (
        <Archive
          projects={projects}
          updateProject={updateProject}
          removeProject={removeProject}
          onOpen={(id) => setRoute({ name: 'project', id })}
          onBack={() => setRoute({ name: 'home' })}
        />
      )}
      {route.name === 'project' && current && (
        <Project
          project={current}
          updateProject={updateProject}
          settings={settings}
          onBack={() => setRoute({ name: 'home' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {showSettings && (
        <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
    </I18nContext.Provider>
  );
}
