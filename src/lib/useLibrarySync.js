// Keeps the global library in step with the project's own cards.
// A character or a scene location that carries a libId mirrors its name,
// description and photos to that library entry whenever they change in the
// project — whichever stage (or undo) made the change. An entry is created
// the first time a card gets photos. Assets need no mirroring: shots reference
// library assets by id, so there is only one copy.
import { useEffect, useRef } from 'react';
import { locationsOf } from './sceneLocations.js';

const samePhotos = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

function cardsOf(project) {
  const cards = new Map();
  for (const c of project.storyline?.characters || []) {
    cards.set(`c:${c.id}`, { libId: c.libId || '', kind: 'character', name: c.name || '', description: c.description || '', photos: c.photos || [] });
  }
  for (const s of project.outline || []) {
    for (const l of locationsOf(s)) {
      // a location has no description of its own; a new entry starts from the scene summary
      cards.set(`l:${s.id}:${l.id}`, { libId: l.libId || '', kind: 'location', name: l.name || '', seedDescription: s.summary || '', photos: l.photos || [] });
    }
  }
  return cards;
}

export function useLibrarySync(project, library, libUpsert) {
  const prev = useRef(null);
  const libRef = useRef(library);
  libRef.current = library;
  const upsertRef = useRef(libUpsert);
  upsertRef.current = libUpsert;
  const pending = useRef(new Map());
  const timer = useRef(null);
  const flush = () => {
    clearTimeout(timer.current);
    timer.current = null;
    for (const entry of pending.current.values()) upsertRef.current?.(entry);
    pending.current.clear();
  };

  useEffect(() => {
    const cards = cardsOf(project);
    const was = prev.current;
    prev.current = { id: project.id, cards };
    // first render of a project is the baseline — only later edits are mirrored
    if (!was || was.id !== project.id) return;
    for (const [key, c] of cards) {
      if (!c.libId) continue;
      const old = was.cards.get(key);
      const ex = pending.current.get(c.libId) || (libRef.current || []).find((e) => e.id === c.libId);
      // just linked to an existing entry (picked from the library): the entry is the source
      if ((!old || old.libId !== c.libId) && ex) continue;
      const photosChanged = !old || !samePhotos(old.photos, c.photos);
      if (old && !photosChanged && old.name === c.name && old.description === c.description) continue;
      // no entry yet: one is created only when the card gains photos
      if (!ex && !(photosChanged && c.photos.length)) continue;
      pending.current.set(c.libId, {
        ...(ex || {}),
        id: c.libId,
        kind: c.kind,
        name: c.name,
        type: ex?.type || 'other',
        description: c.kind === 'character' ? c.description : ex?.description ?? c.seedDescription,
        photos: c.photos.length ? c.photos : ex?.photos || [],
        projectId: ex?.projectId || project.id,
        projectTitle: ex?.projectTitle || project.title,
        createdAt: ex?.createdAt || Date.now(),
      });
    }
    // typing fires on every keystroke — write the library once it settles
    if (pending.current.size) {
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.storyline?.characters, project.outline]);

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
}
