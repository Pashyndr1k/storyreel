// Spatial layout ("blocking") of a scene: where each character stands, which
// way body and head face, the pose, a few labelled set boxes, and the camera —
// one layout per shot. Pure data and maths; the 3D view is lib/spatial/scene3d.js
// and the text the prompt writers read is lib/spatial/describe.js.
//
// Stored in project.sceneLayouts[sceneId]:
//   { props: [{ id, label, x, z, w, d, h, rot }],
//     shots: { [shotId]: { chars: { [charId]: { x, z, rot, head, pose } },
//                          camera: { tx, ty, tz, yaw, pitch, dist, lens },
//                          view? } } }
// A shot without its own entry continues the previous shot's layout, so a
// character never jumps unless a shot says so.
//
// Coordinates: metres on the floor, x to the right and z toward the viewer of
// the default camera. Angles in degrees. A body at rot 0 faces +z (toward a
// camera at yaw 0); rot 90 faces +x. The camera orbits its target: yaw 0 puts
// it on the +z side, positive yaw moves it toward +x, pitch raises it.
import { uid } from '../storage.js';

export const CHAR_COLORS = [
  { id: 'red', hex: '#d83a34' },
  { id: 'blue', hex: '#2f6fdd' },
  { id: 'green', hex: '#2f9e4f' },
  { id: 'orange', hex: '#f08a24' },
  { id: 'purple', hex: '#8a4fd0' },
  { id: 'gray', hex: '#8a8f98' },
];
export const MAX_LAYOUT_CHARS = CHAR_COLORS.length;
export const POSES = ['standing', 'sitting', 'lying', 'jumping'];
export const LENSES = [18, 24, 35, 50, 85]; // mm, full-frame
export const FIGURE_HEIGHT = 1.8; // metres, standing
// height of the top of the head above the floor, per pose
export const POSE_TOP = { standing: 1.8, sitting: 1.4, lying: 0.35, jumping: 2.4 }; // matches the block figures in scene3d.js
export const MAX_PROPS = 8;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapDeg = (a) => ((((num(a, 0) + 180) % 360) + 360) % 360) - 180;

export const DEFAULT_CAMERA = { tx: 0, ty: 1.3, tz: 0, yaw: 0, pitch: 8, dist: 5, lens: 35 };

export function normalizeCamera(c) {
  const lens = LENSES.includes(Number(c?.lens)) ? Number(c.lens) : LENSES.reduce((best, l) => (Math.abs(l - num(c?.lens, 35)) < Math.abs(best - num(c?.lens, 35)) ? l : best), 35);
  return {
    tx: clamp(num(c?.tx, 0), -30, 30),
    ty: clamp(num(c?.ty, 1.3), 0, 6),
    tz: clamp(num(c?.tz, 0), -30, 30),
    yaw: wrapDeg(c?.yaw),
    pitch: clamp(num(c?.pitch, 8), -30, 89),
    dist: clamp(num(c?.dist, 5), 0.6, 40),
    lens,
  };
}
export function normalizeChar(c) {
  return {
    x: clamp(num(c?.x, 0), -30, 30),
    z: clamp(num(c?.z, 0), -30, 30),
    rot: wrapDeg(c?.rot),
    head: clamp(num(c?.head, 0), -80, 80),
    pose: POSES.includes(c?.pose) ? c.pose : 'standing',
    off: !!c?.off, // not present in this shot (still tracked across the scene)
  };
}
export function normalizeProp(p) {
  return {
    id: p?.id || `prop_${uid()}`,
    label: String(p?.label || '').slice(0, 24),
    x: clamp(num(p?.x, 0), -30, 30),
    z: clamp(num(p?.z, 0), -30, 30),
    w: clamp(num(p?.w, 1), 0.1, 12),
    d: clamp(num(p?.d, 1), 0.1, 12),
    h: clamp(num(p?.h, 1), 0.05, 6),
    rot: wrapDeg(p?.rot),
  };
}

// The layout tool is optional per project (Project settings), off by default.
export const layoutEnabled = (project) => !!project?.useLayout;

// Does a text mention a character? Whole name or any word of it; Cyrillic
// words are matched by their stem so inflected forms count ("Анну" → Анна).
export function mentions(text, name) {
  const low = String(text || '').toLowerCase();
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (low.includes(n)) return true;
  return n.split(/\s+/).filter((w) => w.length >= 3).some((w) => {
    const stem = /[а-яёіїєґ]/.test(w) ? w.slice(0, Math.max(3, w.length - 2)) : w;
    return new RegExp(`(^|[^\\p{L}])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(low);
  });
}
const shotText = (s) => `${s.action || ''}\n${s.dialogue || ''}\n${s.notes || ''}`;

// Characters named anywhere in the scene — in ANY of its shots — in cast order.
export function autoCastIds(project, scene) {
  const all = project.storyline?.characters || [];
  const shots = project.sceneDetails?.[scene.id]?.shots || [];
  const text = [scene.title, scene.summary, ...shots.map(shotText)].join('\n');
  const groups = project.storyline?.groups || [];
  const viaGroup = new Set(groups.filter((g) => mentions(text, g.name)).flatMap((g) => g.memberIds || []));
  const named = all.filter((c) => mentions(text, c.name) || viaGroup.has(c.id));
  return (named.length ? named : all).map((c) => c.id);
}

// The characters a scene's layout holds for ALL its shots: the list the user
// set in the window, or everyone the scene's shots name. Each character is
// placed once per scene and marked present or absent shot by shot.
export function sceneCast(project, scene) {
  const all = project.storyline?.characters || [];
  const stored = (project.sceneLayouts || {})[scene.id]?.cast;
  const ids = Array.isArray(stored) ? stored : autoCastIds(project, scene);
  return ids
    .map((id) => all.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, MAX_LAYOUT_CHARS)
    .map((c, i) => ({ id: c.id, name: c.name || `Character ${i + 1}`, color: CHAR_COLORS[i] }));
}
// Is the character named in this particular shot?
export const namedInShot = (project, shot, name) => mentions(shotText(shot), name);

// Everyone in a row facing the camera — the layout before anything is placed.
export function defaultChars(cast) {
  const gap = 0.9;
  return Object.fromEntries(cast.map((c, i) => [c.id, normalizeChar({ x: (i - (cast.length - 1) / 2) * gap, z: 0, rot: 0 })]));
}

export const sceneLayout = (project, sceneId) => (project.sceneLayouts || {})[sceneId] || null;

// The layout in force for a shot: its own, or the nearest earlier shot's, or
// the default. Every cast member is present in the result.
export function layoutFor(project, scene, shotId) {
  const cast = sceneCast(project, scene);
  const stored = sceneLayout(project, scene.id);
  const shots = project.sceneDetails?.[scene.id]?.shots || [];
  const idx = Math.max(0, shots.findIndex((s) => s.id === shotId));
  let base = null;
  let from = null;
  for (let i = idx; i >= 0; i--) {
    const own = stored?.shots?.[shots[i]?.id];
    if (own) {
      base = own;
      from = i;
      break;
    }
  }
  const fallback = defaultChars(cast);
  // Each character continues from the nearest earlier shot that placed them.
  // One who is placed only later has not arrived yet: shown at that future
  // spot, marked absent. One never placed anywhere stands in the default row.
  const stateOf = (cid) => {
    for (let i = idx; i >= 0; i--) {
      const st = stored?.shots?.[shots[i]?.id]?.chars?.[cid];
      if (st) return normalizeChar(st);
    }
    for (let i = idx + 1; i < shots.length; i++) {
      const st = stored?.shots?.[shots[i]?.id]?.chars?.[cid];
      if (st) return normalizeChar({ ...st, off: true });
    }
    // never placed (e.g. added to the cast after the layout was made): absent
    // until a shot's text first names them
    const name = cast.find((c) => c.id === cid)?.name;
    const arrived = !base || shots.slice(0, idx + 1).some((s) => namedInShot(project, s, name));
    return normalizeChar({ ...fallback[cid], off: !arrived });
  };
  const chars = Object.fromEntries(cast.map((c) => [c.id, stateOf(c.id)]));
  return {
    cast,
    chars,
    camera: normalizeCamera(base?.camera || DEFAULT_CAMERA),
    props: (stored?.props || []).map(normalizeProp),
    own: from === idx && !!stored?.shots?.[shotId],
    inheritedFrom: from != null && from !== idx ? from : null,
    exists: !!base,
  };
}

export const hasLayout = (project, sceneId) => Object.keys(sceneLayout(project, sceneId)?.shots || {}).length > 0;

// ---- camera maths (shared by the 3D view and the description)
const rad = (d) => (d * Math.PI) / 180;

export function cameraPosition(cam) {
  const y = rad(cam.yaw);
  const p = rad(cam.pitch);
  return {
    x: cam.tx + cam.dist * Math.sin(y) * Math.cos(p),
    y: Math.max(0.05, cam.ty + cam.dist * Math.sin(p)),
    z: cam.tz + cam.dist * Math.cos(y) * Math.cos(p),
  };
}

// Vertical field of view (degrees) of a lens on a full-frame sensor, for the
// project's aspect ratio: the long side of the frame uses the 36 mm width.
export function verticalFov(lens, aspect) {
  const sensorH = aspect >= 1 ? 36 / aspect : 36;
  return (2 * Math.atan(sensorH / (2 * lens)) * 180) / Math.PI;
}

export const aspectValue = (ratio) => {
  const [a, b] = String(ratio || '16:9').split(':').map(Number);
  return a > 0 && b > 0 ? a / b : 16 / 9;
};

// forward unit vector of a body (or of its head, with the head turn added)
export const forwardOf = (c, withHead = false) => {
  const a = rad(c.rot + (withHead ? c.head : 0));
  return { x: Math.sin(a), z: Math.cos(a) };
};

// ---- the line of action (the 180° rule)
// The axis the camera must stay on one side of: between the two present
// characters nearest the camera's target (in cast order, so the axis points
// the same way in every shot), or a lone character's facing line. Set pieces
// never move, so a camera that keeps its side also keeps the window, door and
// counter on the same side of the screen from shot to shot.
export function actionAxis(chars, cast, cam) {
  const present = cast.map((c, i) => ({ i, id: c.id, st: chars[c.id] })).filter((x) => x.st && !x.st.off);
  if (!present.length) return null;
  if (present.length === 1) {
    const s = present[0].st;
    const f = forwardOf(s);
    return { key: present[0].id, ax: s.x, az: s.z, dx: f.x, dz: f.z };
  }
  const near = [...present].sort((p, q) => Math.hypot(p.st.x - cam.tx, p.st.z - cam.tz) - Math.hypot(q.st.x - cam.tx, q.st.z - cam.tz)).slice(0, 2).sort((p, q) => p.i - q.i);
  const [a, b] = near;
  const dx = b.st.x - a.st.x;
  const dz = b.st.z - a.st.z;
  const l = Math.hypot(dx, dz) || 1;
  return { key: `${a.id}|${b.id}`, ax: a.st.x, az: a.st.z, dx: dx / l, dz: dz / l };
}
// Which side of the axis the camera stands on: +1 / -1, or 0 when it is on
// the line (within 0.3 m) — then no side is established.
export function cameraSide(axis, cam) {
  if (!axis) return 0;
  const p = cameraPosition(cam);
  const s = axis.dx * (p.z - axis.az) - axis.dz * (p.x - axis.ax);
  return Math.abs(s) < 0.3 ? 0 : Math.sign(s);
}
// The camera mirrored across the axis (position and target), same distance,
// height and lens: the same shot from the other side of the line.
export function mirrorCamera(axis, cam) {
  const refl = (x, z) => {
    const vx = x - axis.ax;
    const vz = z - axis.az;
    const k = vx * axis.dx + vz * axis.dz;
    return { x: axis.ax + 2 * k * axis.dx - vx, z: axis.az + 2 * k * axis.dz - vz };
  };
  const p = cameraPosition(cam);
  const P = refl(p.x, p.z);
  const T = refl(cam.tx, cam.tz);
  const yaw = (Math.atan2(P.x - T.x, P.z - T.z) * 180) / Math.PI;
  return normalizeCamera({ ...cam, tx: T.x, tz: T.z, yaw });
}
// Does the shot's text ask for the line to be crossed on purpose?
export const crossesLineOnPurpose = (shot) => /cross(es|ed|ing)? the line|other side of|opposite side|180[ -]?degree|turn(s|ed)? around/i.test(`${shot?.shotType || ''} ${shot?.action || ''} ${shot?.notes || ''}`);
