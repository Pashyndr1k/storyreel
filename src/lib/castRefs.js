// Character face references for ONE shot.
//
// Before 2.7.2 every first frame got the first photo of the first three
// characters in the cast list — whoever they were, even when the shot
// featured characters four and five. Now the shot decides:
//   - characters the shot NAMES (action, dialogue, notes) are the references,
//     in order of first mention — and only they are attached, so a face that
//     is not in the shot is never suggested to the image model;
//   - a shot that names nobody (pronouns only) falls back to the cast list
//     order, as before.
// Only characters with a photo can be a reference; `cap` bounds the count.
import { MAX_CHARACTER_REFS } from './config.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Position of the first mention of `name` in `text` (both lower-cased), or -1.
// Names are matched as whole words with a short inflection tail, so "Анна"
// also finds "Анны" / "Анной" and "Tom" finds "Tom's"; every part of a
// multi-word name counts ("Anna Petrova" is found by "Anna" alone).
function mentionAt(text, name) {
  const full = (name || '').trim().toLowerCase();
  if (!full) return -1;
  const parts = [full, ...full.split(/\s+/).filter((p) => p.length >= 3)];
  let best = -1;
  for (const p of parts) {
    // inflected languages change the last letter — match on the stem
    const stem = p.length >= 4 ? p.slice(0, -1) : p;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(stem)}[\\p{L}']{0,3}(?![\\p{L}\\p{N}])`, 'u');
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

// → [{ id, name, photo, named }] — the references to attach for this shot.
export function shotCastRefs(project, shot, cap = MAX_CHARACTER_REFS) {
  const cast = (project?.storyline?.characters || []).filter((c) => c.photos?.[0]);
  if (!cast.length) return [];
  const text = `${shot?.action || ''}\n${shot?.dialogue || ''}\n${shot?.notes || ''}`.toLowerCase();
  const named = cast
    .map((c) => ({ c, at: mentionAt(text, c.name) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.c);
  const pick = named.length ? named : cast;
  return pick.slice(0, cap).map((c) => ({ id: c.id, name: c.name || '', photo: c.photos[0], named: named.length > 0 }));
}
