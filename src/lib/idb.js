// Minimal promise wrappers around IndexedDB for the projects store.
// IndexedDB gives us hundreds of MB (vs localStorage's ~5MB), which matters
// because projects carry base64 images.
//
// Since v3 a project is stored in two pieces: the 'projects' record holds the
// media-free project (every media slot reads "file:<name>") and the 'media'
// store holds one record per image / video / audio clip, keyed by project id
// and file name. A save then writes the small record plus only the media
// that changed, instead of re-serialising hundreds of megabytes in one value
// (which was enough to kill the page on a large project).
const DB_NAME = 'storyreel-app';
const DB_VERSION = 3; // v2 adds the 'library' store (characters & locations); v3 the 'media' store
const STORE = 'projects';
const LIB_STORE = 'library';
const MEDIA_STORE = 'media';
const OPEN_TIMEOUT_MS = 5000;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    // Never hang forever: a blocked open (another window mid-upgrade, a stuck
    // delete) must surface as an error so callers can fall back.
    const timer = setTimeout(() => {
      dbPromise = null;
      reject(new Error('IndexedDB open timed out'));
    }, OPEN_TIMEOUT_MS);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LIB_STORE)) {
        db.createObjectStore(LIB_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(new Error('IndexedDB open blocked'));
    };
  });
  return dbPromise;
}

const done = (t, resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error);
};

export async function idbGetAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function idbPutMany(items) {
  if (!items.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const it of items) s.put(it);
    done(t, resolve, reject);
  });
}

export async function idbDeleteMany(ids) {
  if (!ids.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const id of ids) s.delete(id);
    done(t, resolve, reject);
  });
}

// ---- media store (one record per media file of a project) ----
// key = "<projectId>\0<name>"; a project's media is the key range
// [<projectId>\0, <projectId>\0￿].
export const mediaKey = (projectId, name) => `${projectId}\u0000${name}`;
const mediaRange = (projectId) => IDBKeyRange.bound(`${projectId}\u0000`, `${projectId}\u0000￿`);

export async function idbMediaGetAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

// The keys of the media store only — which projects own media — without
// reading a single blob (start-up reads these, not the gigabytes behind them).
export async function idbMediaKeys() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

// Every media record of one project (its key range).
export async function idbMediaGetProject(projectId) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAll(mediaRange(projectId));
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

// One media record (a card's poster).
export async function idbMediaGet(projectId, name) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).get(mediaKey(projectId, name));
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

// Save projects in one transaction: each item is { lite, mediaPut, mediaDelete }
// — the media-free record, the media records to write (new or changed) and
// the media keys to remove. All or nothing per call.
export async function idbSaveProjects(items) {
  if (!items.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE, MEDIA_STORE], 'readwrite');
    const ps = t.objectStore(STORE);
    const ms = t.objectStore(MEDIA_STORE);
    for (const it of items) {
      ps.put(it.lite);
      for (const m of it.mediaPut || []) ms.put(m);
      for (const k of it.mediaDelete || []) ms.delete(k);
    }
    done(t, resolve, reject);
  });
}

// Delete projects with every media record they own.
export async function idbDeleteProjects(ids) {
  if (!ids.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE, MEDIA_STORE], 'readwrite');
    const ps = t.objectStore(STORE);
    const ms = t.objectStore(MEDIA_STORE);
    for (const id of ids) {
      ps.delete(id);
      ms.delete(mediaRange(id));
    }
    done(t, resolve, reject);
  });
}

// ---- library store (characters & locations) ----
export async function idbLibGetAll() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(LIB_STORE, 'readonly').objectStore(LIB_STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function idbLibPut(entry) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(LIB_STORE, 'readwrite');
    t.objectStore(LIB_STORE).put(entry);
    done(t, resolve, reject);
  });
}

export async function idbLibDelete(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(LIB_STORE, 'readwrite');
    t.objectStore(LIB_STORE).delete(id);
    done(t, resolve, reject);
  });
}
