const PROJECTS_KEY = 'storyreel.projects.v1';
const SETTINGS_KEY = 'storyreel.settings.v1';

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('saveProjects failed', e);
    window.alert('Storage is full — the latest change could not be saved. Remove some reference photos or delete old projects.');
  }
}

export function loadSettings() {
  try {
    return {
      apiKey: '',
      model: 'claude-sonnet-5',
      lang: 'en',
      ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}),
    };
  } catch {
    return { apiKey: '', model: 'claude-sonnet-5', lang: 'en' };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function newProject({ title, logline }) {
  return {
    id: uid(),
    title: title.trim() || 'Untitled project',
    genres: [],
    createdAt: Date.now(),
    archived: false,
    lang: '', // '' = follow the app language; 'en'/'ru'/'uk' = per-project override
    stage: 1,
    logline: logline || '',
    ideas: [],
    selectedIdeaId: null,
    approvedPlot: '',
    storyline: null, // { synopsis, characters: [{id, name, role, description}] }
    outline: [], // [{id, number, title, summary, duration}]
    sceneDetails: {}, // sceneId -> { shots: [{id, duration, shotType, location, action, dialogue, notes}] }
    shotPrompts: {}, // shotId -> { imagePrompt, videoPrompt }
  };
}
