// Which short-drama engine a series project runs on, and its rule set.
//   v1 — "Short drama": the 2026 craft-guide engine (lib/shortDrama/rules.js)
//   v2 — "Short Drama 2": the AI Short Drama Production Manual engine
//        (lib/shortDrama/rules2.js) — video for MiniMax H3, images for
//        Nano Banana 2.1
// Both are series projects (scriptType 'series'); project.dramaEngine picks
// the rules every text stage, the prompt writers, the genre check and the
// agent read. Everything that used to import rules.js constants directly
// goes through rulesFor(project) now.
import * as v1 from './rules.js';
import * as v2 from './rules2.js';

export const DRAMA_ENGINES = ['v1', 'v2'];
export const dramaEngineOf = (project) => (project?.dramaEngine === 'v2' ? 'v2' : 'v1');
export const ENGINE_LABEL = { v1: 'Short drama', v2: 'Short Drama 2' };

// The engine's surface: constants, functions and briefs under one name set.
export function rulesFor(project) {
  const engine = dramaEngineOf(project);
  const m = engine === 'v2' ? v2 : v1;
  return {
    engine,
    label: ENGINE_LABEL[engine],
    HOOK_TYPES: m.HOOK_TYPES,
    HOOK_LABEL: m.HOOK_LABEL,
    OPENING_HOOKS: m.OPENING_HOOKS,
    expectedHook: m.expectedHook,
    hookTag: m.HOOK_TAG,
    tagPrefix: m.TAG_PREFIX,
    BEATS: m.BEATS,
    beatEnum: m.BEATS.join(' | '),
    MAX_LINE_WORDS: m.MAX_LINE_WORDS,
    MAX_ACTION_WORDS: m.MAX_ACTION_WORDS,
    WORDS_PER_SEC: m.WORDS_PER_SEC,
    MAX_LOCATIONS_PER_EPISODE: m.MAX_LOCATIONS_PER_EPISODE,
    OPENING_HOOK_SEC: m.OPENING_HOOK_SEC,
    TURN_EVERY_SEC: m.TURN_EVERY_SEC,
    SHOCK_EVERY_SEC: m.SHOCK_EVERY_SEC,
    seasonLandmarks: m.seasonLandmarks,
    timingGrid: m.timingGrid,
    timingText: m.timingText,
    DRAMA_CORE: m.DRAMA_CORE,
    DRAMA_STAGE: m.DRAMA_STAGE,
    DRAMA_FRAME_RULE: m.DRAMA_FRAME_RULE,
    frameShort: m.FRAME_SHORT,
    landmarksText: m.landmarksText,
    arcsNotes: m.arcsNotes,
    episodePlanNotes: m.episodePlanNotes,
    shotsSceneNote: m.shotsSceneNote,
    check: m.CHECK,
    dramaRulesSummary: m.dramaRulesSummary,
    // engine-specific extras (v2 only; v1 gives null)
    extras: m.EXTRAS || null,
  };
}
