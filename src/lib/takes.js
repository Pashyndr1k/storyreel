// Multi-shot takes (MiniMax H3). A take groups 2–3 consecutive shots of one
// scene into a single H3 generation: the model renders the internal cuts
// itself (no crossfade seam, continuity modelled across the cut). The first
// member is the take's lead — its prompt, first frame / references, video slot
// and Stage-6 clip stand for the whole take.
import { h3Frames } from './comfy.js';

// The field guide's generation ceiling is 15s; the largest valid 17n+5 frame
// count inside it is 345 (14.375s), because the next grid point (362) rounds
// past 15s.
export const MAX_TAKE_FRAMES = 360;

export function takeOf(project, shotId) {
  for (const g of Object.values(project.shotGroups || {})) {
    if ((g.shotIds || []).includes(shotId)) return g;
  }
  return null;
}

export const isTakeLead = (project, shotId) => takeOf(project, shotId)?.shotIds?.[0] === shotId;
export const isTakeMember = (project, shotId) => {
  const g = takeOf(project, shotId);
  return !!g && g.shotIds[0] !== shotId;
};

const shotMap = (project) => {
  const map = {};
  for (const sc of project.outline) {
    for (const sh of project.sceneDetails[sc.id]?.shots || []) map[sh.id] = sh;
  }
  return map;
};

export function takeShots(project, take) {
  const map = shotMap(project);
  return (take.shotIds || []).map((id) => map[id]).filter(Boolean);
}

export const takeTotal = (project, take) =>
  takeShots(project, take).reduce((a, s) => a + (Number(s.duration) || 0), 0);

// Internal cut positions in seconds from the take's start (raw durations:
// only the TOTAL must land on the 17n+5 grid, the cuts are prompt-timed).
export function takeCutTimes(project, take) {
  const shots = takeShots(project, take);
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < shots.length - 1; i++) {
    acc += Number(shots[i].duration) || 0;
    cuts.push(Math.round(acc * 1000) / 1000);
  }
  return cuts;
}

// MM:SS.mmm — the timestamp format H3's [Shot N] At markers use.
export function takeStamp(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const mmm = String(Math.round((s % 1) * 1000)).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

// Validate combining `count` shots starting at `startIdx` of a scene.
export function canCombine(project, sceneId, startIdx, count) {
  const shots = project.sceneDetails[sceneId]?.shots || [];
  const members = shots.slice(startIdx, startIdx + count);
  if (members.length < count) return { ok: false, reason: 'short' };
  if (members.some((sh) => takeOf(project, sh.id))) return { ok: false, reason: 'taken' };
  const total = members.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  if (h3Frames(total) > MAX_TAKE_FRAMES) return { ok: false, reason: 'long', total };
  return { ok: true, ids: members.map((s) => s.id), total };
}
