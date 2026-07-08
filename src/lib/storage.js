const PROJECTS_KEY = 'storyreel.projects.v1';
const SETTINGS_KEY = 'storyreel.settings.v1';

// Bump when the project shape changes. Used only to tag exports; import/load
// tolerate any older shape via migrateProject below.
export const SCHEMA_VERSION = 2;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadProjects() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTS_KEY)) || [];
    return Array.isArray(raw) ? raw.map(migrateProject) : [];
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
      geminiKey: '',
      geminiModel: 'gemini-3-pro-image-preview',
      ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}),
    };
  } catch {
    return { apiKey: '', model: 'claude-sonnet-5', lang: 'en', geminiKey: '', geminiModel: 'gemini-3-pro-image-preview' };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// The complete default shape of a project. Single source of truth for the schema.
function projectDefaults() {
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    title: 'Untitled project',
    genres: [],
    createdAt: Date.now(),
    archived: false,
    lang: '', // '' = follow the app language; 'en'/'ru'/'uk' = per-project override
    systemPrompt: '', // extra project-specific instructions for the prompt builder
    imageTemplate: '', // optional template for Nano Banana image prompts
    videoTemplate: '', // optional template for image-to-video prompts
    stage: 1,
    cover: '', // generated project cover image (data URL)
    shotImages: {}, // shotId -> generated image (data URL)
    logline: '',
    ideas: [],
    selectedIdeaId: null,
    approvedPlot: '',
    storyline: null, // { synopsis, characters: [{id, name, role, description, photos}] }
    outline: [], // [{id, number, title, summary, duration, photos}]
    sceneDetails: {}, // sceneId -> { shots: [{id, duration, shotType, location, action, dialogue, notes}] }
    shotPrompts: {}, // shotId -> { imagePrompt, videoPrompt }
  };
}

export function newProject({ title, logline }) {
  return {
    ...projectDefaults(),
    title: (title || '').trim() || 'Untitled project',
    logline: logline || '',
  };
}

// Normalize a project (from an older export or older localStorage) to the current
// schema so newer code never reads a missing field. Backward-compatible: fills
// gaps, never drops user data.
export function migrateProject(raw) {
  if (!raw || typeof raw !== 'object') return newProject({ title: '', logline: '' });
  const d = projectDefaults();
  const p = { ...d, ...raw };

  p.id = raw.id || d.id;
  p.createdAt = raw.createdAt || d.createdAt;
  p.schemaVersion = SCHEMA_VERSION;
  p.genres = Array.isArray(p.genres) ? p.genres.slice(0, 3) : [];
  p.ideas = Array.isArray(p.ideas) ? p.ideas : [];
  p.stage = Number(p.stage) || 1;
  p.archived = !!p.archived;
  p.cover = typeof p.cover === 'string' ? p.cover : '';
  p.lang = typeof p.lang === 'string' ? p.lang : '';
  p.systemPrompt = typeof p.systemPrompt === 'string' ? p.systemPrompt : '';
  p.imageTemplate = typeof p.imageTemplate === 'string' ? p.imageTemplate : '';
  p.videoTemplate = typeof p.videoTemplate === 'string' ? p.videoTemplate : '';
  p.shotImages = p.shotImages && typeof p.shotImages === 'object' ? p.shotImages : {};
  p.shotPrompts = p.shotPrompts && typeof p.shotPrompts === 'object' ? p.shotPrompts : {};

  p.storyline =
    p.storyline && typeof p.storyline === 'object'
      ? {
          synopsis: p.storyline.synopsis || '',
          characters: Array.isArray(p.storyline.characters)
            ? p.storyline.characters.map((c) => ({
                id: c.id || uid(),
                name: c.name || '',
                role: c.role || '',
                description: c.description || '',
                photos: Array.isArray(c.photos) ? c.photos : [],
              }))
            : [],
        }
      : null;

  p.outline = Array.isArray(p.outline)
    ? p.outline.map((s) => ({
        ...s,
        id: s.id || uid(),
        title: s.title || '',
        summary: s.summary || '',
        duration: Number(s.duration) || 0,
        photos: Array.isArray(s.photos) ? s.photos : [],
      }))
    : [];

  const sd = {};
  if (p.sceneDetails && typeof p.sceneDetails === 'object') {
    for (const key of Object.keys(p.sceneDetails)) {
      const shots = p.sceneDetails[key]?.shots;
      sd[key] = { shots: Array.isArray(shots) ? shots : [] };
    }
  }
  p.sceneDetails = sd;

  return p;
}
