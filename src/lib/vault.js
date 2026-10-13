// The vault: copies of the stores that are NOT inside a project — the global
// library (characters, locations, assets), the styles and the settings — kept
// as plain files under the projects directory, next to the per-project
// folders. IndexedDB and localStorage live in the browser profile and can go
// in one stroke (2026-10-11: the library store was lost with the database's
// tables); the vault is what they come back from. Electron only (the bridge
// writes and reads files inside the projects directory).
//
//   <projectsDir>/_library/library.json   entries, photos as "file:<name>"
//   <projectsDir>/_library/<entryId>_<i>.<ext>
//   <projectsDir>/_settings/styles.json
//   <projectsDir>/_settings/settings.json (API keys left out)
import { DEFAULT_PROJECTS_DIR } from './projectFiles.js';

const LIB_DIR = '_library';
const SET_DIR = '_settings';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const b64Utf8 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const utf8FromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

export const vaultAvailable = () => !!(typeof window !== 'undefined' && window.localFiles?.saveOutput && window.localFiles?.readProjectFile);
export const vaultRoot = (settings) => String(settings?.projectsDir || DEFAULT_PROJECTS_DIR).replace(/[\\/]+$/, '');

const readFile = async (root, folder, name) => {
  const res = await window.localFiles.readProjectFile(root, folder, name);
  return res?.ok ? res.base64 : null;
};
const writeFile = (root, folder, name, base64) => window.localFiles.saveOutput(`${root}\\${folder}`, name, base64);

// ---- library ----------------------------------------------------------------
// photo files already written this session: name -> data URL length (photos
// are immutable in practice, so a same-length file is the same photo)
const written = new Map();

export async function vaultWriteLibrary(root, entries) {
  const lite = [];
  for (const e of entries || []) {
    const photos = [];
    for (const [i, ph] of (e.photos || []).entries()) {
      if (typeof ph !== 'string' || !ph.startsWith('data:')) continue;
      const mime = ph.slice(5, ph.indexOf(';'));
      const name = `${e.id}_${i}.${EXT[mime] || 'jpg'}`;
      if (written.get(name) !== ph.length) {
        const res = await writeFile(root, LIB_DIR, name, ph.slice(ph.indexOf(',') + 1));
        if (res?.ok) written.set(name, ph.length);
      }
      photos.push(`file:${name}`);
    }
    lite.push({ ...e, photos });
  }
  const res = await writeFile(root, LIB_DIR, 'library.json', b64Utf8(JSON.stringify({ version: 1, savedAt: Date.now(), entries: lite })));
  return !!res?.ok;
}

// The vault's library: null when there is none; entries without their photos
// unless withPhotos (the photo files are read one by one).
export async function vaultReadLibrary(root, { withPhotos = true } = {}) {
  const b64 = await readFile(root, LIB_DIR, 'library.json');
  if (!b64) return null;
  let data;
  try {
    data = JSON.parse(utf8FromB64(b64));
  } catch {
    return null;
  }
  const out = [];
  for (const e of data?.entries || []) {
    const photos = [];
    if (withPhotos) {
      for (const ref of e.photos || []) {
        const name = String(ref).replace(/^file:/, '');
        const ph = await readFile(root, LIB_DIR, name);
        if (ph) photos.push(`data:${MIME[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] || 'image/jpeg'};base64,${ph}`);
      }
    }
    out.push({ ...e, photos });
  }
  return out;
}

// ---- styles and settings -----------------------------------------------------
export async function vaultWriteJson(root, name, obj) {
  const res = await writeFile(root, SET_DIR, name, b64Utf8(JSON.stringify({ version: 1, savedAt: Date.now(), data: obj })));
  return !!res?.ok;
}
export async function vaultReadJson(root, name) {
  const b64 = await readFile(root, SET_DIR, name);
  if (!b64) return null;
  try {
    const parsed = JSON.parse(utf8FromB64(b64));
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : null;
  } catch {
    return null;
  }
}
// The API keys stay in the OS-encrypted store only.
const SECRET_KEYS = ['apiKey', 'geminiKey', 'klingKey', 'kreaKey'];
export function settingsForVault(settings) {
  const out = { ...(settings || {}) };
  for (const k of SECRET_KEYS) delete out[k];
  return out;
}
