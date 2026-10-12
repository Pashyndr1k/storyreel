// One on-disk folder per project id.
//
// The renderer mirrors a project after every debounced save, so while a title
// is being typed the folder name changes character by character. Each of those
// names used to create a NEW folder (a full copy of the project); now every
// mirrored folder carries a hidden `.storyreel-id` marker and a title change
// renames the marked folder instead.
const fs = require('fs');
const path = require('path');

const ID_MARKER = '.storyreel-id';

function subdirs(root) {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function idOf(dir) {
  try {
    const marker = path.join(dir, ID_MARKER);
    if (fs.existsSync(marker)) return fs.readFileSync(marker, 'utf8').trim();
    // Folders written before the marker existed: recover the id from the
    // project payload embedded in project.md.
    const md = path.join(dir, 'project.md');
    if (!fs.existsSync(md)) return '';
    const m = fs.readFileSync(md, 'utf8').match(/<!--\s*storyreel-project:([A-Za-z0-9+/=]+)\s*-->/);
    if (!m) return '';
    return (JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) || {}).id || '';
  } catch {
    return '';
  }
}

function findDirById(root, projectId) {
  for (const name of subdirs(root)) {
    if (idOf(path.join(root, name)) === projectId) return name;
  }
  return null;
}

const isEmptyDir = (dir) => {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
};

// A name no other project occupies. Two projects may legitimately share a
// title, so the loser of the race gets "Title (2)" rather than their folders
// being merged.
function freeName(root, projectId, folderName) {
  let target = folderName;
  for (let n = 2; n < 100; n++) {
    const dir = path.join(root, target);
    if (!fs.existsSync(dir)) return target;
    const id = idOf(dir);
    if (id === projectId || (!id && isEmptyDir(dir))) return target; // ours, or free to adopt
    target = `${folderName} (${n})`;
  }
  return `${folderName} (${projectId.slice(-6)})`;
}

// Returns the folder this project must mirror into, renaming/creating as needed.
function resolveProjectDir(root, projectId, folderName) {
  fs.mkdirSync(root, { recursive: true });
  const current = findDirById(root, projectId);
  let name;

  if (current === folderName) {
    name = current;
  } else if (current) {
    name = freeName(root, projectId, folderName); // title changed → rename in place
    fs.renameSync(path.join(root, current), path.join(root, name));
  } else {
    name = freeName(root, projectId, folderName);
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }

  const dir = path.join(root, name);
  fs.writeFileSync(path.join(dir, ID_MARKER), projectId);
  return dir;
}

// Folders holding a copy of a project that already lives in another folder —
// leftovers of the old rename behavior. `projects` is [{ id, folderName }].
function listStrayDirs(root, projects) {
  const live = new Map((projects || []).map((p) => [p.id, p.folderName]));
  const out = [];
  for (const name of subdirs(root)) {
    const dir = path.join(root, name);
    const id = idOf(dir);
    if (!id || !live.has(id) || live.get(id) === name) continue;
    let size = 0;
    let files = 0;
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!f.isFile()) continue;
        files++;
        size += fs.statSync(path.join(dir, f.name)).size;
      }
    } catch {
      /* size is informational only */
    }
    out.push({ name, files, size, keeps: live.get(id) });
  }
  return out;
}

// Delete by NAME only: anything with a separator, or resolving outside root,
// is refused so a bad argument can't reach beyond the projects folder.
function deleteDirs(root, names) {
  const rootAbs = path.resolve(root);
  let removed = 0;
  for (const name of names || []) {
    if (!name || /[\\/]/.test(name)) continue;
    const dir = path.resolve(rootAbs, name);
    if (path.dirname(dir) !== rootAbs) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed++;
    } catch {
      /* keep going */
    }
  }
  return removed;
}

// Every mirrored project folder under root, with the facts a restore needs.
// Folders starting with "_" (backups) are skipped; a folder without the
// project payload in its project.md is reported with hasPayload false.
function listProjectDirs(root) {
  const out = [];
  for (const name of subdirs(root)) {
    if (name.startsWith('_')) continue;
    const dir = path.join(root, name);
    const mdPath = path.join(dir, 'project.md');
    if (!fs.existsSync(mdPath)) continue;
    try {
      const st = fs.statSync(mdPath);
      const m = fs.readFileSync(mdPath, 'utf8').match(/<!--\s*storyreel-project:([A-Za-z0-9+/=]+)\s*-->/);
      const lite = m ? JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) : null;
      const files = fs.readdirSync(dir).filter((f) => f !== 'project.md' && f !== ID_MARKER);
      let bytes = st.size;
      for (const f of files) {
        try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* unreadable file: not counted */ }
      }
      out.push({
        folder: name,
        id: idOf(dir) || (lite && lite.id) || '',
        hasPayload: !!lite,
        title: (lite && lite.title) || name,
        stage: lite ? lite.stage || 0 : 0,
        scriptType: lite ? lite.scriptType || '' : '',
        scenes: lite ? (lite.outline || []).length : 0,
        createdAt: lite ? lite.createdAt || 0 : 0,
        updatedAt: (lite && lite.updatedAt) || st.mtimeMs,
        savedAt: st.mtimeMs,
        files: files.length,
        bytes,
      });
    } catch { /* unreadable folder: skipped */ }
  }
  return out;
}

// A folder name or file name given by the renderer must stay inside root.
const inside = (root, ...parts) => {
  const p = path.resolve(root, ...parts);
  const r = path.resolve(root);
  if (!p.startsWith(r + path.sep)) throw new Error('Path outside the projects folder.');
  return p;
};

// The project file of a mirrored folder plus the names of its media files.
function readProjectDir(root, folder) {
  const dir = inside(root, folder);
  const md = fs.readFileSync(path.join(dir, 'project.md'), 'utf8');
  const files = fs.readdirSync(dir).filter((f) => f !== 'project.md' && f !== ID_MARKER && fs.statSync(path.join(dir, f)).isFile());
  return { md, files };
}

// One media file of a mirrored folder, base64.
function readProjectFile(root, folder, name) {
  return fs.readFileSync(inside(root, folder, name)).toString('base64');
}

module.exports = {
  listProjectDirs,
  readProjectDir,
  readProjectFile, ID_MARKER, resolveProjectDir, listStrayDirs, deleteDirs, findDirById };
