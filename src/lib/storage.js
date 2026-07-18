import { idbGetAll, idbPutMany, idbDeleteMany } from './idb.js';
import { isValidAspect } from './aspect.js';
import { sanitizeMethods } from './randomization.js';

const LEGACY_PROJECTS_KEY = 'storyreel.projects.v1'; // pre-1.3.0 localStorage store
const SETTINGS_KEY = 'storyreel.settings.v1';

// Bump when the project shape changes. Used only to tag exports; import/load
// tolerate any older shape via migrateProject below.
export const SCHEMA_VERSION = 2;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Reference map of what's already persisted, so saveProjects only writes
// projects whose object identity changed (and deletes removed ones).
let lastSaved = new Map();
// When IndexedDB can't be opened (blocked by another window, corrupted, …)
// fall back to the legacy localStorage store so the app keeps working.
let idbBroken = false;

function readLegacy() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_PROJECTS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function loadProjects() {
  let list;
  try {
    list = await idbGetAll();
    if (!list.length) {
      // One-time migration from the pre-1.3.0 localStorage store.
      const legacy = readLegacy();
      if (legacy.length) {
        list = legacy.map(migrateProject);
        await idbPutMany(list);
        localStorage.removeItem(LEGACY_PROJECTS_KEY); // frees the old quota
      }
    }
  } catch (e) {
    console.error('IndexedDB unavailable, falling back to localStorage', e);
    idbBroken = true;
    list = readLegacy();
  }
  const migrated = list.map(migrateProject);
  migrated.sort((a, b) => b.createdAt - a.createdAt);
  lastSaved = new Map(migrated.map((p) => [p.id, p]));
  return migrated;
}

export async function saveProjects(projects) {
  if (idbBroken) {
    try {
      localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('legacy save failed', e);
      window.alert('Storage is full — the latest change could not be saved. Remove some reference photos or delete old projects.');
    }
    return;
  }
  try {
    const next = new Map(projects.map((p) => [p.id, p]));
    const changed = projects.filter((p) => lastSaved.get(p.id) !== p);
    const removed = [...lastSaved.keys()].filter((id) => !next.has(id));
    await idbPutMany(changed);
    await idbDeleteMany(removed);
    lastSaved = next;
  } catch (e) {
    console.error('saveProjects failed', e);
    window.alert('Could not save the latest change (storage error). Free some disk space and try again.');
  }
}

// --- API keys at rest -------------------------------------------------------
// In Electron a preload bridge (window.secureStore) exposes safeStorage, so the
// Anthropic/Gemini keys are stored OS-encrypted. In a plain browser (dev) they
// stay as-is. Encrypted values are prefixed so both forms can be read back.
const ENC_PREFIX = 'enc.v1:';

function secureStore() {
  try {
    const ss = typeof window !== 'undefined' ? window.secureStore : null;
    return ss && ss.available && ss.available() ? ss : null;
  } catch {
    return null;
  }
}

function protectKey(value) {
  const ss = secureStore();
  if (!ss || !value) return value || '';
  try {
    const enc = ss.encrypt(value);
    return enc ? ENC_PREFIX + enc : value;
  } catch {
    return value;
  }
}

function revealKey(value) {
  if (!value) return '';
  const s = String(value);
  if (!s.startsWith(ENC_PREFIX)) return s;
  const ss = secureStore();
  if (!ss) return ''; // encrypted blob without the bridge (e.g. dev browser)
  try {
    return ss.decrypt(s.slice(ENC_PREFIX.length)) || '';
  } catch {
    return '';
  }
}

export function loadSettings() {
  const defaults = {
    apiKey: '',
    model: 'claude-sonnet-5',
    lang: 'en',
    theme: 'dark',
    geminiKey: '',
    geminiModel: 'gemini-3-pro-image-preview',
    textService: 'claude', // 'claude' | 'gemini' — plots, scripts and prompts
    storyboardService: 'gemini', // 'gemini' | 'comfy' — Stage-4 storyboard frames
    videoService: 'comfy', // shot video generation (only ComfyUI for now)
    comfyUrl: 'http://127.0.0.1:8000',
    comfyOutputDir: 'D:\\Claude work\\ComfyUI\\Output',
    projectsDir: 'D:\\Claude work\\StoryReel Projects', // per-project folders (project.md + media files)
  };
  try {
    const s = { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    s.apiKey = revealKey(s.apiKey);
    s.geminiKey = revealKey(s.geminiKey);
    return s;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...settings,
      apiKey: protectKey(settings.apiKey),
      geminiKey: protectKey(settings.geminiKey),
    })
  );
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
    scriptType: 'medium', // 'short' 10-30s | 'medium' 1-4min | 'long' 5-10min
    aspectRatio: '16:9', // image/video aspect ratio: 16:9|4:3|1:1|3:4|9:16
    scriptStyleId: '', // selected style from the library (empty = neutral)
    imageStyleId: '',
    videoStyleId: '',
    randomization: [], // Stage-1 plot randomization method ids (max 2, ordered)
    stage: 1,
    cover: '', // generated project cover image (data URL)
    shotImages: {}, // shotId -> current generated image (data URL)
    shotImageHistory: {}, // shotId -> older versions, newest first (max 5)
    shotFinalImages: {}, // shotId -> generated FINAL frame (data URL), paired with shotImages
    shotVideos: {}, // shotId -> generated shot video (data URL, ComfyUI LTX-2)
    shotAudios: {}, // shotId -> generated voice audio (data URL, ComfyUI Chatterbox TTS)
    shotAssets: {}, // shotId -> [assetId] referencing the global asset library
    dynamicsPlan: null, // Action Dynamics Plan generated at Stage 3 (see lib/dynamics.js)
    videoGenDurations: {}, // shotId -> raw seconds requested from the video model (+2s padding)
    shotTrims: {}, // shotId -> { head, tail } seconds — manual overrides of the 15-frame rule
    musicTrack: null, // { dataURL, name, duration } — full-film music, mixed into the render
    voiceTrack: null, // { dataURL, name, duration } — full-film voice-over, mixed into the render
    shotTransitions: {}, // shotId -> transition_type override for the cut INTO the next shot
    storyboards: {}, // shotId -> low-res storyboard frame (data URL)
    logline: '',
    ideas: [],
    selectedIdeaId: null,
    approvedPlot: '',
    storyline: null, // { synopsis, characters: [{id, name, role, description, photos}] }
    outline: [], // [{id, number, title, summary, duration, photos}]
    sceneDetails: {}, // sceneId -> { shots: [{id, duration, shotType, location, action, dialogue, notes}] }
    shotPrompts: {}, // shotId -> { imagePrompt, videoPrompt, audioPrompt }
  };
}

export function newProject({ title, logline, scriptType, aspectRatio }) {
  return {
    ...projectDefaults(),
    title: (title || '').trim() || 'Untitled project',
    logline: logline || '',
    scriptType: ['short', 'medium', 'long'].includes(scriptType) ? scriptType : 'medium',
    aspectRatio: isValidAspect(aspectRatio) ? aspectRatio : '16:9',
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
  p.scriptType = ['short', 'medium', 'long'].includes(p.scriptType) ? p.scriptType : 'medium';
  p.aspectRatio = isValidAspect(p.aspectRatio) ? p.aspectRatio : '16:9';
  p.scriptStyleId = typeof p.scriptStyleId === 'string' ? p.scriptStyleId : '';
  p.imageStyleId = typeof p.imageStyleId === 'string' ? p.imageStyleId : '';
  p.videoStyleId = typeof p.videoStyleId === 'string' ? p.videoStyleId : '';
  p.randomization = sanitizeMethods(p.randomization);
  // Legacy per-project prompt fields (systemPrompt/imageTemplate/videoTemplate) are
  // intentionally preserved here so absorbLegacyStyles() can convert them to library
  // styles once, then strip them.
  p.shotImages = p.shotImages && typeof p.shotImages === 'object' ? p.shotImages : {};
  p.shotImageHistory = p.shotImageHistory && typeof p.shotImageHistory === 'object' ? p.shotImageHistory : {};
  p.shotFinalImages = p.shotFinalImages && typeof p.shotFinalImages === 'object' ? p.shotFinalImages : {};
  p.shotVideos = p.shotVideos && typeof p.shotVideos === 'object' ? p.shotVideos : {};
  p.shotAssets = p.shotAssets && typeof p.shotAssets === 'object' ? p.shotAssets : {};
  p.dynamicsPlan = p.dynamicsPlan && typeof p.dynamicsPlan === 'object' ? p.dynamicsPlan : null;
  p.videoGenDurations = p.videoGenDurations && typeof p.videoGenDurations === 'object' ? p.videoGenDurations : {};
  p.shotTrims = p.shotTrims && typeof p.shotTrims === 'object' ? p.shotTrims : {};
  p.shotTransitions = p.shotTransitions && typeof p.shotTransitions === 'object' ? p.shotTransitions : {};
  p.storyboards = p.storyboards && typeof p.storyboards === 'object' ? p.storyboards : {};
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
                libId: typeof c.libId === 'string' ? c.libId : '',
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
