// Global asset libraries: characters and locations. Entries live in the
// IndexedDB 'library' store and are shared across projects. Characters/locations
// created from reference photos inside a project are auto-added here.
import { idbLibGetAll, idbLibPut, idbLibDelete } from './idb.js';
import { uid } from './storage.js';

export const CHARACTER_TYPES = ['male', 'female', 'child', 'animal', 'robot', 'other'];
export const LOCATION_TYPES = ['interior', 'exterior', 'urban', 'nature', 'fantasy', 'other'];

export function newLibraryEntry(kind) {
  return {
    id: 'lib_' + uid(),
    kind, // 'character' | 'location'
    name: '',
    type: 'other',
    description: '',
    photos: [], // resized data URLs, max 3
    projectId: '',
    projectTitle: '',
    createdAt: Date.now(),
  };
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const kind = e.kind === 'location' ? 'location' : 'character';
  const types = kind === 'location' ? LOCATION_TYPES : CHARACTER_TYPES;
  return {
    ...newLibraryEntry(kind),
    ...e,
    kind,
    type: types.includes(e.type) ? e.type : 'other',
    photos: Array.isArray(e.photos) ? e.photos.slice(0, 3) : [],
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
