// Minimal promise wrappers around IndexedDB for the projects store.
// IndexedDB gives us hundreds of MB (vs localStorage's ~5MB), which matters
// because projects carry base64 images.
const DB_NAME = 'storyreel-app';
const DB_VERSION = 2; // v2 adds the 'library' store (characters & locations)
const STORE = 'projects';
const LIB_STORE = 'library';
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
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbDeleteMany(ids) {
  if (!ids.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const id of ids) s.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
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
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbLibDelete(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(LIB_STORE, 'readwrite');
    t.objectStore(LIB_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
