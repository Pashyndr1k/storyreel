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
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';

// Five stages since 2.5 (Generation Prompts and Final Assembly merged).
export const STAGE_COUNT = 5;

// Shot length on every timeline and in every prompt rule.
export const SHOT_MIN_SEC = 2;
export const SHOT_MAX_SEC = 10;
export const SHOT_STEP_SEC = 0.5;

// First-frame versions kept per shot (oldest drops off).
export const MAX_IMAGE_VERSIONS = 6;
