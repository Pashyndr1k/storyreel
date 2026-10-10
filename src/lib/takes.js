// Multi-shot takes (MiniMax H3). A take groups 2–3 consecutive shots of one
// scene into a single H3 generation: the model renders the internal cuts
// itself (no crossfade seam, continuity modelled across the cut). The first
// member is the take's lead — its prompt, first frame / references, video slot
// and assembly-timeline clip stand for the whole take.
import { h3Frames } from './comfy.js';
import { locationsOf } from './sceneLocations.js';

// The field guide's generation ceiling is 15s; the largest valid 17n+5 frame
// count inside it is 345 (14.375s), because the next grid point (362) rounds
// past 15s.
export const MAX_TAKE_FRAMES = 345;

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

// ---- extended shots (Stage 4 option): 2–3 sub-shots written as one take
// Shrink member durations proportionally until the take fits the frame
// ceiling (each member keeps at least `minSec`). Returns the new durations.
export function fitTakeDurations(durations, minSec = 2) {
  let d = durations.map((v) => Math.max(minSec, Number(v) || minSec));
  // 345 frames = 14.375 s; aim a little under it and shrink in half-second steps
  for (let k = 0; k < 20 && h3Frames(d.reduce((a, b) => a + b, 0)) > MAX_TAKE_FRAMES; k++) {
    const total = d.reduce((a, b) => a + b, 0);
    const scale = Math.min(0.97, 14.3 / total);
    d = d.map((v) => Math.max(minSec, Math.floor(v * scale * 2) / 2));
  }
  return d;
}

// The references an extended take renders with (reference_to_video /
// multiframe_reference): the first photo of every character the take's shots
// name, the shot's location photos, and the first image of every attached
// asset — the same faces, objects and place through the whole take.
export function autoTakeRefs(project, sceneId, shotIds, library = [], caps = { images: 9 }) {
  const scene = (project.outline || []).find((s) => s.id === sceneId);
  const shots = (project.sceneDetails?.[sceneId]?.shots || []).filter((s) => shotIds.includes(s.id));
  if (!scene || !shots.length) return null;
  const text = shots.map((s) => `${s.action || ''}\n${s.dialogue || ''}\n${s.notes || ''}`).join('\n').toLowerCase();
  const images = [];
  const seen = new Set();
  const add = (src, label) => {
    if (src && !seen.has(src) && images.length < caps.images) {
      seen.add(src);
      images.push({ src, label });
    }
  };
  for (const c of project.storyline?.characters || []) {
    const name = String(c.name || '').trim().toLowerCase();
    if (name && c.photos?.[0] && (text.includes(name) || text.includes(name.split(/\s+/)[0]))) add(c.photos[0], c.name);
  }
  for (const l of locationsOf(scene)) if (l.photos?.[0]) add(l.photos[0], l.name || scene.title);
  for (const id of shotIds) {
    for (const aid of (project.shotAssets || {})[id] || []) {
      const a = library.find((e) => e.id === aid);
      if (a?.photos?.[0]) add(a.photos[0], a.name);
    }
  }
  return images.length ? { images, videos: [], audios: [] } : null;
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
