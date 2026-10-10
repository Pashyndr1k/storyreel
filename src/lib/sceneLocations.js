// Scene locations. A scene holds any number of named locations, each with its
// own reference photos:
//   scene.locations = [{ id, name, photos: [dataURL…], libId }]
// A shot picks the ones it uses through project.shotLocations[shotId] = [id…];
// a shot with no stored choice uses the scene's first location.
// Before 2.10 a scene had one flat list (scene.photos) — locationsOf() still
// reads that shape as a single location, and migrateProject converts it.
import { MAX_LOCATION_PHOTOS } from './config.js';

const legacyId = (scene) => `loc_${scene.id}`;

export function locationsOf(scene) {
  if (!scene) return [];
  if (Array.isArray(scene.locations)) return scene.locations;
  return Array.isArray(scene.photos) && scene.photos.length
    ? [{ id: legacyId(scene), name: scene.title || '', photos: scene.photos, libId: '' }]
    : [];
}

// The library entry a location is mirrored to. The scene's original location
// keeps the pre-2.10 id so existing library cards stay linked.
export function locationLibId(projectId, scene, locId) {
  return locId === legacyId(scene) ? `libl_${projectId}_${scene.id}` : `libl_${projectId}_${scene.id}_${locId}`;
}

// For migrateProject: scene.photos → scene.locations.
export function normalizeSceneLocations(scene, projectId) {
  const { photos, ...rest } = scene;
  const list = locationsOf(scene)
    .filter((l) => l && typeof l === 'object')
    .map((l) => {
      const id = l.id || legacyId(scene);
      return {
        id,
        name: typeof l.name === 'string' ? l.name : '',
        photos: (Array.isArray(l.photos) ? l.photos : []).filter(Boolean).slice(0, MAX_LOCATION_PHOTOS),
        libId: l.libId || locationLibId(projectId, scene, id),
      };
    });
  return { ...rest, locations: list };
}

// The reference image of a location rendered from nothing but the scene text
// (the agent's storyreel_location_image; the workbench cuts one from a frame
// instead): the empty place, with its landmarks, in the story's world.
export function locationImagePrompt(project, scene, loc, imageStyle = '') {
  const world = (project.genres || []).join(', ');
  return `Location reference plate for a film: "${loc.name || scene.title}". The scene set there: ${String(scene.summary || scene.title).trim().replace(/[.\s]+$/, '')}.
The story's world: ${world || 'contemporary drama'}${project.storyline?.synopsis ? ` — ${String(project.storyline.synopsis).slice(0, 400).replace(/[.\s]+$/, '')}` : ''}.
Show the EMPTY place — no people, no animals — from a natural eye-level wide view that reveals its defining landmarks (windows, doors, counters, furniture, signs) and where they stand relative to each other, with the lighting and time of day the scene implies. Realistic architecture and materials, consistent perspective, no text, no watermark. This image becomes the environment reference for every shot of the scene.${imageStyle ? `\n\nVisual style: ${imageStyle}` : ''}`;
}

// Every location photo of the scene, taken round-robin (photo 1 of each
// location first) so a cap never drops a whole location.
export function scenePhotos(scene, cap = MAX_LOCATION_PHOTOS) {
  const lists = locationsOf(scene).map((l) => l.photos || []);
  const out = [];
  for (let k = 0; out.length < cap && lists.some((p) => k < p.length); k++) {
    for (const p of lists) if (k < p.length && out.length < cap) out.push(p[k]);
  }
  return out;
}

// The locations a shot uses, in scene order.
export function shotLocations(project, scene, shotId) {
  const all = locationsOf(scene);
  const picked = (project.shotLocations || {})[shotId];
  if (!Array.isArray(picked)) return all.slice(0, 1);
  return all.filter((l) => picked.includes(l.id));
}

// Reference photos for a shot, grouped by location: [{ name, photos }]. The
// cap is shared round-robin, so several locations each keep their lead photo.
export function shotLocationRefs(project, scene, shotId, cap = MAX_LOCATION_PHOTOS) {
  const locs = shotLocations(project, scene, shotId).filter((l) => l.photos?.length);
  const counts = locs.map(() => 0);
  let total = 0;
  for (let k = 0; total < cap && locs.some((l) => k < l.photos.length); k++) {
    locs.forEach((l, i) => {
      if (k < l.photos.length && total < cap) {
        counts[i]++;
        total++;
      }
    });
  }
  return locs.map((l, i) => ({ name: l.name || '', photos: l.photos.slice(0, counts[i]) })).filter((g) => g.photos.length);
}
