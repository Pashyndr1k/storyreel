// Character face references for ONE shot.
//
// The shot decides who is attached:
//   - characters the shot NAMES (action, dialogue, notes) are the references,
//     in order of first mention — and only they are attached, so a face that
//     is not in the shot is never suggested to the image model;
//   - an actor GROUP named in the shot (storyline.groups — e.g. a band)
//     stands for all of its members: each member's photo is attached, in the
//     group's member order, as if every member had been named;
//   - a shot that names nobody (pronouns only) falls back to the cast list.
// Only characters with a photo can be a reference. The cap is
// MAX_CHARACTER_REFS, raised to MAX_GROUP_REFS when a group is in the shot.
import { MAX_CHARACTER_REFS, MAX_GROUP_REFS } from './config.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// words that are part of a name but must never match on their own
const STOP = new Set(['the', 'and', 'von', 'van', 'der', 'den', 'del', 'les', 'los', 'las', 'mrs', 'miss']);

// Position of the first mention of `name` in `text` (both lower-cased), or -1.
// Names are matched as whole words with a short inflection tail, so "Анна"
// also finds "Анны" / "Анной" and "Tom" finds "Tom's". With `parts`, every
// word of a multi-word name counts ("Anna Petrova" is found by "Anna").
function mentionAt(text, name, { parts = true } = {}) {
  const full = (name || '').trim().toLowerCase();
  if (!full) return -1;
  const noArticle = full.replace(/^the\s+/, '');
  const candidates = parts
    ? [full, ...full.split(/\s+/).filter((p) => p.length >= 3 && !STOP.has(p))]
    : [full, ...(noArticle !== full ? [noArticle] : [])];
  let best = -1;
  for (const p of candidates) {
    // inflected languages change the last letter — match on the stem
    const stem = p.length >= 4 ? p.slice(0, -1) : p;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(stem)}[\\p{L}']{0,3}(?![\\p{L}\\p{N}])`, 'u');
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

// → [{ id, name, role, photo, named, group }] — the references to attach for
// this shot. `group` is the group's name when the member came in through it.
export function shotCastRefs(project, shot, cap) {
  const all = project?.storyline?.characters || [];
  const hasPhoto = (c) => !!c?.photos?.[0];
  const cast = all.filter(hasPhoto);
  if (!cast.length) return [];
  const text = `${shot?.action || ''}\n${shot?.dialogue || ''}\n${shot?.notes || ''}`.toLowerCase();
  const groups = (project?.storyline?.groups || []).filter((g) => (g.name || '').trim());

  // every mention with its position: a character, or a group (= its members)
  const hits = [];
  for (const c of cast) {
    const at = mentionAt(text, c.name);
    if (at >= 0) hits.push({ at, chars: [c], group: null });
  }
  for (const g of groups) {
    const at = mentionAt(text, g.name, { parts: false });
    if (at < 0) continue;
    const members = (g.memberIds || []).map((id) => all.find((c) => c.id === id)).filter(hasPhoto);
    if (members.length) hits.push({ at, chars: members, group: g.name });
  }
  hits.sort((a, b) => a.at - b.at);

  const picked = [];
  const seen = new Map(); // character id → index in picked
  for (const h of hits) {
    for (const c of h.chars) {
      if (seen.has(c.id)) {
        // named alone AND through the group — keep the group label
        if (h.group) picked[seen.get(c.id)].group = h.group;
        continue;
      }
      seen.set(c.id, picked.length);
      picked.push({ c, group: h.group });
    }
  }
  const named = picked.length > 0;
  const anyGroup = picked.some((x) => x.group);
  const limit = cap ?? (anyGroup ? MAX_GROUP_REFS : MAX_CHARACTER_REFS);
  const list = named ? picked : cast.map((c) => ({ c, group: null }));
  return list
    .slice(0, limit)
    .map(({ c, group }) => ({ id: c.id, name: c.name || '', role: c.role || '', photo: c.photos[0], named, group }));
}
