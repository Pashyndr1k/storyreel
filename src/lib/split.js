// Splitting a project into parts at Stage 3: the user cuts the scene outline
// anywhere, each part becomes its own project with that run of scenes and
// everything already made for them (shots, prompts, frames, videos, layouts),
// while the storyline, cast, styles and settings are shared by copy.
//
//   project.splitCuts  — scene indices (0-based) after which a new part starts
//   project.parts      — [{ from, to, projectId, title }] parts created so far (0-based, inclusive)
//   part.partInfo      — { parentId, parentTitle, index, total, from, to } on a part project (1-based)
import { uid } from './storage.js';

// Maps keyed by shot id, copied for the shots a part keeps.
const SHOT_MAPS = [
  'shotPrompts', 'shotImages', 'shotImageHistory', 'shotFinalImages', 'shotVideos', 'shotAudios', 'shotAudioSrc',
  'shotAudioPads', 'shotAssets', 'shotLocations', 'videoGenDurations', 'shotVideoModes', 'shotSeeds', 'shotSeedMode',
  'shotVideoEngines', 'shotPromptEngines', 'shotCamera', 'shotAction', 'shotPromptDyn', 'shotVoiceSources',
  'shotSpeakerNotes', 'shotRefs', 'shotGroups', 'shotKeyframes', 'shotTrims', 'shotTransitions',
];

export const normalizeCuts = (cuts, sceneCount) =>
  [...new Set((Array.isArray(cuts) ? cuts : []).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < sceneCount - 1))].sort((a, b) => a - b);

// The parts the cuts define: [{ from, to }] 0-based inclusive, in order.
export function planParts(sceneCount, cuts) {
  if (!sceneCount) return [];
  const c = normalizeCuts(cuts, sceneCount);
  const parts = [];
  let from = 0;
  for (const k of c) {
    parts.push({ from, to: k });
    from = k + 1;
  }
  parts.push({ from, to: sceneCount - 1 });
  return parts;
}

// Cuts that give parts of `size` scenes each (the last one takes the rest).
export const cutsEvery = (sceneCount, size) => {
  const n = Math.max(1, Math.round(Number(size) || 1));
  const out = [];
  for (let k = n - 1; k < sceneCount - 1; k += n) out.push(k);
  return out;
};

// The dynamics plan reduced to the part's scenes: scene numbers restart at 1
// and block timestamps restart at 0.
function partPlan(plan, outline, from, to) {
  if (!plan || !Array.isArray(plan.rhythm_blocks)) return plan || null;
  const keep = new Set(Array.from({ length: to - from + 1 }, (_, i) => from + 1 + i));
  const offset = outline.slice(0, from).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const blocks = plan.rhythm_blocks
    .map((b) => ({ ...b, scene_numbers: (b.scene_numbers || []).filter((n) => keep.has(n)).map((n) => n - from) }))
    .filter((b) => b.scene_numbers.length)
    .map((b, i) => ({
      ...b,
      block_id: `blk_${i + 1}`,
      timestamp_start: Math.max(0, (Number(b.timestamp_start) || 0) - offset),
      intended_duration_sec: b.scene_numbers.reduce((a, n) => a + (Number(outline[from + n - 1]?.duration) || 0), 0),
    }));
  return blocks.length ? { ...plan, rhythm_blocks: blocks } : null;
}

// One part as a new project: the master cloned, trimmed to scenes from..to.
export function buildPartProject(master, { from, to }, index, total, label) {
  const p = structuredClone(master);
  const scenes = master.outline.slice(from, to + 1);
  const sceneIds = new Set(scenes.map((s) => s.id));
  const shotIds = new Set(scenes.flatMap((s) => (master.sceneDetails?.[s.id]?.shots || []).map((sh) => sh.id)));
  const pick = (map, ids) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => ids.has(k)));
  p.id = uid();
  p.title = `${master.title} · ${label}`;
  p.createdAt = Date.now();
  p.updatedAt = Date.now();
  p.outline = scenes;
  p.sceneDetails = pick(master.sceneDetails, sceneIds);
  p.sceneLayouts = pick(master.sceneLayouts, sceneIds);
  for (const key of SHOT_MAPS) p[key] = pick(master[key], shotIds);
  p.dynamicsPlan = partPlan(master.dynamicsPlan, master.outline, from, to);
  // flags and attempts that point at kept shots / scenes
  p.agentFlags = (master.agentFlags || []).filter((f) => (f.target?.shotId ? shotIds.has(f.target.shotId) : f.target?.sceneId ? sceneIds.has(f.target.sceneId) : false));
  p.agentAttempts = Object.fromEntries(Object.entries(master.agentAttempts || {}).filter(([k]) => [...shotIds, ...sceneIds].some((id) => k.includes(`:${id}:`))));
  // the assembly's audio lanes are timed against the whole film — a part starts its own
  p.audioLayers = [];
  p.parts = [];
  p.splitCuts = [];
  p.partInfo = { parentId: master.id, parentTitle: master.title, index, total, from: from + 1, to: to + 1 };
  return p;
}
