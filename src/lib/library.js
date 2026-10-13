// Global asset libraries: characters and locations. Entries live in the
// IndexedDB 'library' store and are shared across projects. Characters/locations
// created from reference photos inside a project are auto-added here.
import { idbLibGetAll, idbLibPut, idbLibDelete } from './idb.js';
import { uid } from './storage.js';
import { MAX_LOCATION_PHOTOS, MAX_LIBRARY_PHOTOS } from './config.js';
import { locationsOf } from './sceneLocations.js';
import { storyAssetLibId } from './storyAssets.js';

export const libraryPhotoCap = (kind) => (kind === 'location' ? MAX_LOCATION_PHOTOS : MAX_LIBRARY_PHOTOS);

export const CHARACTER_TYPES = ['male', 'female', 'child', 'animal', 'robot', 'other'];
export const LOCATION_TYPES = ['interior', 'exterior', 'urban', 'nature', 'fantasy', 'other'];
export const ASSET_TYPES = ['prop', 'logo', 'ui', 'wardrobe', 'other'];
export const LIBRARY_KINDS = ['character', 'location', 'asset'];

function typesFor(kind) {
  return kind === 'location' ? LOCATION_TYPES : kind === 'asset' ? ASSET_TYPES : CHARACTER_TYPES;
}

export function newLibraryEntry(kind) {
  return {
    id: 'lib_' + uid(),
    kind, // 'character' | 'location' | 'asset'
    name: '',
    type: 'other',
    description: '',
    photos: [], // resized data URLs, up to libraryPhotoCap(kind)
    projectId: '',
    projectTitle: '',
    createdAt: Date.now(),
  };
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const kind = LIBRARY_KINDS.includes(e.kind) ? e.kind : 'character';
  const types = typesFor(kind);
  return {
    ...newLibraryEntry(kind),
    ...e,
    kind,
    type: types.includes(e.type) ? e.type : 'other',
    photos: Array.isArray(e.photos) ? e.photos.slice(0, libraryPhotoCap(kind)) : [],
    createdAt: e.createdAt || Date.now(),
  };
}

export async function loadLibrary() {
  try {
    const rows = await idbLibGetAll();
    return rows.map(normalizeEntry).filter(Boolean);
  } catch (e) {
    console.error('loadLibrary failed', e);
    return [];
  }
}

export async function persistLibraryEntry(entry) {
  try {
    await idbLibPut(entry);
  } catch (e) {
    console.error('persistLibraryEntry failed', e);
  }
}

export async function deleteLibraryEntry(id) {
  try {
    await idbLibDelete(id);
  } catch (e) {
    console.error('deleteLibraryEntry failed', e);
  }
}

export function sortLibrary(entries, mode) {
  const list = [...entries];
  if (mode === 'project') {
    list.sort((a, b) => (a.projectTitle || '').localeCompare(b.projectTitle || '') || b.createdAt - a.createdAt);
  } else if (mode === 'type') {
    list.sort((a, b) => (a.type || '').localeCompare(b.type || '') || b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

// ---- rebuild from the projects -------------------------------------------
// The library mirrors the projects' cards (useLibrarySync): a character or
// location with a libId and photos, and every story asset with photos, has
// an entry. These are the entries a project implies — what a lost library
// store can be rebuilt from.
export function impliedLibraryEntries(project) {
  const out = [];
  const base = (id, kind, name, description, photos) => ({
    ...newLibraryEntry(kind),
    id,
    name: name || '',
    description: description || '',
    photos: (photos || []).slice(0, libraryPhotoCap(kind)),
    projectId: project.id,
    projectTitle: project.title || '',
    createdAt: project.createdAt || Date.now(),
  });
  for (const c of project.storyline?.characters || []) {
    if (c.libId && (c.photos || []).length) out.push(base(c.libId, 'character', c.name, c.description, c.photos));
  }
  for (const a of project.storyline?.assets || []) {
    if ((a.photos || []).length) out.push(base(storyAssetLibId(project, a), 'asset', a.name, a.description, a.photos));
  }
  for (const s of project.outline || []) {
    for (const l of locationsOf(s)) {
      if (l.libId && (l.photos || []).length) out.push(base(l.libId, 'location', l.name, s.summary, l.photos));
    }
  }
  return out;
}

// The entries to add back for projects the library knows nothing about — a
// project with at least one entry keeps its state (an entry the user removed
// on purpose stays removed); a project with none gets every entry its cards
// imply. Returns the new entries, none already present.
export function rebuildLibraryFromProjects(projects, library) {
  const have = new Set((library || []).map((e) => e.id));
  const owners = new Set((library || []).map((e) => e.projectId).filter(Boolean));
  const out = [];
  for (const p of projects || []) {
    if (!p || owners.has(p.id)) continue;
    for (const e of impliedLibraryEntries(p)) {
      if (have.has(e.id)) continue;
      have.add(e.id);
      out.push(e);
    }
  }
  return out;
}
