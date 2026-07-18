// Project files on disk. The project's text lives in a readable project.md
// (with a media-stripped JSON payload for re-import); every image/video is a
// STANDARD FILE next to it. In Electron each project mirrors continuously
// into <projectsDir>/<project title>/, and "export" bundles those files into
// one ZIP. In a plain browser the mirror is skipped and export downloads the
// same ZIP directly.
import { buildScriptMarkdown } from './exportScript.js';

export const DEFAULT_PROJECTS_DIR = 'D:\\Claude work\\StoryReel Projects';

export const sanitizeFolder = (title, id) =>
  (String(title || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || String(id || 'project')).slice(0, 80);

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
const extFor = (dataURL, fallback) => {
  const mime = String(dataURL).slice(5, String(dataURL).indexOf(';'));
  return EXT[mime] || fallback || 'bin';
};
const isDataURL = (v) => typeof v === 'string' && v.startsWith('data:');
const MARK = 'file:'; // media slots in the lite project hold "file:<name>"

// Split a project into a media-free copy plus a list of media files. The lite
// copy references each file as "file:<name>", so merge can reverse it.
export function splitProjectMedia(project) {
  const files = [];
  const put = (dataURL, name) => {
    files.push({ name, dataURL });
    return MARK + name;
  };
  const mapOf = (obj, prefix, fallbackExt) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      out[k] = isDataURL(v) ? put(v, `${prefix}_${k}.${extFor(v, fallbackExt)}`) : v;
    }
    return out;
  };

  const lite = { ...project };
  if (isDataURL(lite.cover)) lite.cover = put(lite.cover, `cover.${extFor(lite.cover, 'jpg')}`);
  lite.shotImages = mapOf(project.shotImages, 'img', 'jpg');
  lite.shotFinalImages = mapOf(project.shotFinalImages, 'final', 'jpg');
  lite.shotVideos = mapOf(project.shotVideos, 'vid', 'mp4');
  lite.shotAudios = mapOf(project.shotAudios, 'aud', 'mp3');
  lite.storyboards = mapOf(project.storyboards, 'sb', 'jpg');
  lite.shotImageHistory = {};
  for (const [k, arr] of Object.entries(project.shotImageHistory || {})) {
    lite.shotImageHistory[k] = (arr || []).map((v, i) =>
      isDataURL(v) ? put(v, `hist_${k}_${i}.${extFor(v, 'jpg')}`) : v
    );
  }
  if (project.storyline) {
    lite.storyline = {
      ...project.storyline,
      characters: (project.storyline.characters || []).map((c) => ({
        ...c,
        photos: (c.photos || []).map((v, i) => (isDataURL(v) ? put(v, `char_${c.id}_${i}.${extFor(v, 'jpg')}`) : v)),
      })),
    };
  }
  lite.outline = (project.outline || []).map((s) => ({
    ...s,
    photos: (s.photos || []).map((v, i) => (isDataURL(v) ? put(v, `scene_${s.id}_${i}.${extFor(v, 'jpg')}`) : v)),
  }));
  for (const key of ['musicTrack', 'voiceTrack']) {
    const trk = project[key];
    if (trk && isDataURL(trk.dataURL)) {
      lite[key] = { ...trk, dataURL: put(trk.dataURL, `${key === 'musicTrack' ? 'music' : 'voice'}.${extFor(trk.dataURL, 'mp3')}`) };
    }
  }
  lite.audioLayers = (project.audioLayers || []).map((L, li) => ({
    ...L,
    clips: (L.clips || []).map((c) =>
      isDataURL(c.dataURL) ? { ...c, dataURL: put(c.dataURL, `aclip_${li}_${c.id}.${extFor(c.dataURL, 'mp3')}`) } : c
    ),
  }));
  return { lite, files };
}

// Reverse of splitProjectMedia: resolve every "file:<name>" via getDataURL.
export function mergeProjectMedia(lite, getDataURL) {
  const get = (v) => {
    if (typeof v !== 'string' || !v.startsWith(MARK)) return v;
    return getDataURL(v.slice(MARK.length)) || '';
  };
  const mapOf = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) out[k] = get(v);
    return out;
  };
  const p = { ...lite };
  p.cover = get(p.cover);
  p.shotImages = mapOf(p.shotImages);
  p.shotFinalImages = mapOf(p.shotFinalImages);
  p.shotVideos = mapOf(p.shotVideos);
  p.shotAudios = mapOf(p.shotAudios);
  p.storyboards = mapOf(p.storyboards);
  p.shotImageHistory = {};
  for (const [k, arr] of Object.entries(lite.shotImageHistory || {})) {
    p.shotImageHistory[k] = (arr || []).map(get).filter(Boolean);
  }
  if (p.storyline) {
    p.storyline = {
      ...p.storyline,
      characters: (p.storyline.characters || []).map((c) => ({ ...c, photos: (c.photos || []).map(get).filter(Boolean) })),
    };
  }
  p.outline = (p.outline || []).map((s) => ({ ...s, photos: (s.photos || []).map(get).filter(Boolean) }));
  for (const key of ['musicTrack', 'voiceTrack']) {
    if (p[key]?.dataURL) p[key] = { ...p[key], dataURL: get(p[key].dataURL) };
  }
  p.audioLayers = (lite.audioLayers || []).map((L) => ({
    ...L,
    clips: (L.clips || []).map((c) => ({ ...c, dataURL: get(c.dataURL) })),
  }));
  return p;
}

// ---- readable+importable project.md (media-free) ----------------------------
const b64EncodeUtf8 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export function buildProjectMd(project, lite, lang) {
  return `${buildScriptMarkdown(project, lang)}\n\n<!-- storyreel-project:${b64EncodeUtf8(JSON.stringify(lite))} -->\n`;
}

// ---- continuous mirror into the project folder (Electron only) --------------
// Cheap by design: project.md is rewritten on every mirror (small), media
// files are written only when their byte length changed since the last write
// this session (they are immutable blobs in practice).
const mirrored = new Map(); // projectId -> Map<fileName, dataURL.length>

export async function mirrorProjectToDisk(settings, project, lang) {
  if (!window.localFiles?.saveOutput || !project?.id) return null;
  const root = (settings.projectsDir || DEFAULT_PROJECTS_DIR).replace(/[\\/]+$/, '');
  const dir = `${root}\\${sanitizeFolder(project.title, project.id)}`;
  const { lite, files } = splitProjectMedia(project);
  const seen = mirrored.get(project.id) || new Map();
  try {
    const md = buildProjectMd(project, lite, lang);
    await window.localFiles.saveOutput(dir, 'project.md', b64EncodeUtf8(md));
    for (const f of files) {
      if (seen.get(f.name) === f.dataURL.length) continue;
      const base64 = f.dataURL.slice(f.dataURL.indexOf(',') + 1);
      const res = await window.localFiles.saveOutput(dir, f.name, base64);
      if (res?.ok) seen.set(f.name, f.dataURL.length);
    }
    mirrored.set(project.id, seen);
    return dir;
  } catch {
    return null; // mirroring is best-effort; IndexedDB stays the source of truth
  }
}

// ---- minimal ZIP (store method) ---------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// entries: [{ name, bytes: Uint8Array }] → complete .zip bytes (no compression;
// jpg/mp4 payloads are already compressed).
export function buildZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const nameB = enc.encode(name);
    const crc = crc32(bytes);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); // store
    head.setUint32(14, crc, true);
    head.setUint32(18, bytes.length, true);
    head.setUint32(22, bytes.length, true);
    head.setUint16(26, nameB.length, true);
    chunks.push(new Uint8Array(head.buffer), nameB, bytes);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, bytes.length, true);
    cd.setUint32(24, bytes.length, true);
    cd.setUint16(28, nameB.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameB);
    offset += 30 + nameB.length + bytes.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, new Uint8Array(eocd.buffer)]) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// Read a .zip (store + deflate entries) → Map<name, Uint8Array>.
export async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const blob = new Blob([raw]);
      const buf = new Uint8Array(await new Response(blob.stream().pipeThrough(ds)).arrayBuffer());
      out.set(name, buf);
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

// ---- export / import ---------------------------------------------------------
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };

const dataURLToBytes = (dataURL) => {
  const bin = atob(dataURL.slice(dataURL.indexOf(',') + 1));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
};

const bytesToDataURL = (name, bytes) => {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
};

const bytesToBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// Bundle the whole project (project.md + media files) into one ZIP. In
// Electron a save dialog asks where to put it; in a browser it downloads.
export async function exportProjectZip(project, lang) {
  const { lite, files } = splitProjectMedia(project);
  const md = buildProjectMd(project, lite, lang);
  const entries = [{ name: 'project.md', bytes: new TextEncoder().encode(md) }];
  for (const f of files) entries.push({ name: f.name, bytes: dataURLToBytes(f.dataURL) });
  const zip = buildZip(entries);
  const zipName = `${sanitizeFolder(project.title, project.id)}.zip`;
  if (window.localFiles?.exportZip) {
    return window.localFiles.exportZip(zipName, bytesToBase64(zip));
  }
  const blob = new Blob([zip], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  return { ok: true };
}

// Reassemble a project from an exported ZIP (project.md + media files).
export async function importProjectZip(bytes) {
  const entries = await readZip(bytes);
  const mdBytes = entries.get('project.md');
  if (!mdBytes) throw new Error('project.md not found in the archive.');
  const md = new TextDecoder().decode(mdBytes);
  const m = md.match(/<!--\s*storyreel-project:([A-Za-z0-9+/=]+)\s*-->/);
  if (!m) throw new Error('The archive does not contain StoryReel project data.');
  const bin = atob(m[1]);
  const jb = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jb[i] = bin.charCodeAt(i);
  const lite = JSON.parse(new TextDecoder().decode(jb));
  return mergeProjectMedia(lite, (name) => {
    const b = entries.get(name);
    return b ? bytesToDataURL(name, b) : '';
  });
}
