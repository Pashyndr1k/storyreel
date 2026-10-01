// Shared defaults and limits — the single source of truth for values that
// used to be repeated across stages, settings and storage (and, for the two
// folders, hardcoded to one developer's machine).
//
// The folders derive from the OS Documents folder that the Electron main
// process exposes on window.appPaths (see electron/preload.cjs); in a plain
// browser build there is no folder I/O, so they stay empty.
const paths = typeof window !== 'undefined' ? window.appPaths || {} : {};
const SEP = paths.sep || '\\';
const inDocuments = (name) => (paths.documents ? `${paths.documents}${SEP}${name}` : '');

export const DEFAULT_PROJECTS_DIR = inDocuments('StoryReel Projects'); // per-project folders (project.md + media)
export const DEFAULT_OUTPUT_DIR = inDocuments('StoryReel Outputs'); // where generated results are saved locally

export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'; // ComfyUI's own default port
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
// Anthropic models offered in Settings. A saved model that is no longer
// listed is moved to its successor (or the default) by loadSettings.
export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recommended)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (higher quality)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];
export const CLAUDE_MODEL_SUCCESSORS = { 'claude-opus-4-8': 'claude-opus-5-5' };
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';
export const DEFAULT_KLING_MODEL = 'kling-3.0'; // cloud video (first + last frame, 3–15 s)

// Five stages since 2.5 (Generation Prompts and Final Assembly merged).
export const STAGE_COUNT = 5;

// Shot length on every timeline and in every prompt rule.
export const SHOT_MIN_SEC = 2;
export const SHOT_MAX_SEC = 10;
export const SHOT_STEP_SEC = 0.5;

// Character face references attached to one first frame (picked per shot,
// see lib/castRefs.js). Local Flux.2 Klein still takes two images in total.
export const MAX_CHARACTER_REFS = 4;
// …raised when the shot names an actor group (a band, a crew): its members
// are attached one photo each.
export const MAX_GROUP_REFS = 6;
// Reference photos one location holds (a scene may have any number of locations).
export const MAX_LOCATION_PHOTOS = 6;
// Photos a character or asset card holds in the library.
export const MAX_LIBRARY_PHOTOS = 3;

// First-frame versions kept per shot (oldest drops off).
export const MAX_IMAGE_VERSIONS = 6;
