// Turns a shot's 3D layout into exact statements a text model can use: where
// each character sits in the frame, which way body and head face relative to
// the camera, who looks at whom, distances, the shot size the lens gives and
// the camera's height and angle. Also the continuity warnings between shots.
// Everything is computed from the same camera maths the 3D view renders with.
import { layoutFor, cameraPosition, verticalFov, aspectValue, forwardOf, POSE_TOP, hasLayout, layoutEnabled, namedInShot } from './layout.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const r1 = (v) => Math.round(v * 10) / 10;

// Camera basis and a projector to normalised screen coordinates (-1..1).
export function cameraFrame(cam, aspect) {
  const pos = cameraPosition(cam);
  const target = { x: cam.tx, y: cam.ty, z: cam.tz };
  const fwd = norm(sub(target, pos));
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
  const up = cross(right, fwd);
  const vfov = rad(verticalFov(cam.lens, aspect));
  const tanV = Math.tan(vfov / 2);
  const project = (p) => {
    const v = sub(p, pos);
    const depth = dot(v, fwd);
    if (depth <= 0.05) return { depth, x: 0, y: 0, behind: true };
    return { depth, x: dot(v, right) / (depth * tanV * aspect), y: dot(v, up) / (depth * tanV), behind: false };
  };
  return { pos, fwd, right, up, vfov, tanV, project };
}

// five bands across the frame, so two people in a wide shot do not both read as centre
const sideWord = (x) => {
  const a = Math.abs(x);
  const side = x < 0 ? 'left' : 'right';
  if (a < 0.12) return 'centre';
  if (a < 0.45) return side + ' of centre';
  if (a < 0.8) return side;
  return 'far ' + side;
};
const inFrameWords = (side) => (side === 'centre' ? 'centre of frame' : side.endsWith('of centre') ? side : side + ' of frame');

function facingWords(fwd2, toCam, rightOnScreen) {
  const a = deg(Math.acos(Math.max(-1, Math.min(1, fwd2.x * toCam.x + fwd2.z * toCam.z))));
  if (a <= 30) return 'facing the camera';
  if (a >= 150) return 'back to the camera';
  const side = fwd2.x * rightOnScreen.x + fwd2.z * rightOnScreen.z > 0 ? 'screen-right' : 'screen-left';
  if (a < 70) return `three-quarter front, turned toward ${side}`;
  if (a <= 110) return `in profile, facing ${side}`;
  return `three-quarter back, turned toward ${side}`;
}

function shotSize(frameHeightAtSubject) {
  const h = frameHeightAtSubject;
  if (h < 0.3) return 'extreme close-up';
  if (h < 0.7) return 'close-up';
  if (h < 1.1) return 'medium close-up';
  if (h < 1.7) return 'medium shot';
  if (h < 2.6) return 'medium-full shot';
  if (h < 3.6) return 'full shot';
  if (h < 9) return 'wide shot';
  return 'extreme wide shot';
}

function cameraWords(cam, pos) {
  const height = pos.y < 0.6 ? 'ground-level' : pos.y < 1.2 ? 'low' : pos.y <= 1.9 ? 'eye-level' : pos.y <= 3.5 ? 'raised' : 'high';
  const tilt = cam.pitch >= 65 ? 'looking straight down (top-down)' : cam.pitch >= 20 ? 'looking down (high angle)' : cam.pitch <= -8 ? 'looking up (low angle)' : 'level';
  return `${cam.lens} mm lens, camera ${height} at ${r1(pos.y)} m, ${tilt}`;
}

// Per-character facts for one layout: [{ id, name, color, inFrame, side, x, depth, … }]
export function analyse(layout, aspect) {
  const frame = cameraFrame(layout.camera, aspect);
  const flatRight = norm({ x: frame.right.x, y: 0, z: frame.right.z });
  const people = layout.cast.filter((c) => !layout.chars[c.id].off).map((c) => {
    const st = layout.chars[c.id];
    const top = POSE_TOP[st.pose] || 1.8;
    const head = { x: st.x, y: top - 0.16, z: st.z };
    const mid = { x: st.x, y: top / 2, z: st.z };
    const ph = frame.project(head);
    const pm = frame.project(mid);
    const inFrame = !ph.behind && Math.abs(ph.x) <= 1.05 && Math.abs(ph.y) <= 1.1;
    const toCam = norm({ x: frame.pos.x - st.x, y: 0, z: frame.pos.z - st.z });
    const body = forwardOf(st);
    const headDir = forwardOf(st, true);
    return {
      ...c,
      state: st,
      inFrame,
      partly: !inFrame && !pm.behind && Math.abs(pm.x) <= 1.2 && Math.abs(pm.y) <= 1.3,
      sx: ph.x,
      sy: ph.y,
      depth: ph.depth,
      side: sideWord(ph.x),
      body: facingWords(body, toCam, flatRight),
      headFacing: Math.abs(st.head) >= 15 ? facingWords(headDir, toCam, flatRight) : null,
      headDir,
    };
  });
  return { frame, people };
}

// The measured description of one shot's layout, as plain sentences.
export function describeShot(project, scene, shotId) {
  if (!layoutEnabled(project) || !hasLayout(project, scene.id)) return '';
  const layout = layoutFor(project, scene, shotId);
  if (!layout.exists || !layout.cast.length) return '';
  const aspect = aspectValue(project.aspectRatio);
  const { frame, people } = analyse(layout, aspect);
  const visible = people.filter((p) => p.inFrame).sort((a, b) => a.sx - b.sx);
  const lines = [];

  // framing: the visible character nearest the frame centre sets the shot size
  const main = [...visible].sort((a, b) => Math.hypot(a.sx, a.sy) - Math.hypot(b.sx, b.sy))[0];
  const size = main ? shotSize(2 * main.depth * frame.tanV) : shotSize(2 * layout.camera.dist * frame.tanV);
  lines.push(`Camera: ${size}${main ? ` on ${main.name}` : ''}; ${cameraWords(layout.camera, frame.pos)}.`);

  if (visible.length) {
    const depths = visible.map((p) => p.depth);
    const near = Math.min(...depths);
    const far = Math.max(...depths);
    const plane = (d) => (far - near < 0.8 ? '' : d - near < (far - near) / 3 ? ', foreground' : far - d < (far - near) / 3 ? ', background' : ', middle distance');
    lines.push(`In frame, from screen-left to screen-right: ${visible.map((p) => p.name).join(', ')}.`);
    for (const p of visible) {
      const pose = p.state.pose === 'standing' ? 'standing' : p.state.pose === 'sitting' ? 'sitting' : p.state.pose === 'lying' ? 'lying down' : 'off the ground (jumping)';
      const head = p.headFacing ? `; head turned — ${p.headFacing}` : '';
      // who the head points at
      const looks = people
        .filter((o) => o.id !== p.id)
        .map((o) => {
          const to = norm({ x: o.state.x - p.state.x, y: 0, z: o.state.z - p.state.z });
          return { o, a: deg(Math.acos(Math.max(-1, Math.min(1, p.headDir.x * to.x + p.headDir.z * to.z)))) };
        })
        .filter((x) => x.a <= 22)
        .sort((a, b) => a.a - b.a)[0];
      lines.push(`- ${p.name} (${p.color.id} figure): ${inFrameWords(p.side)}${plane(p.depth)}, ${r1(p.depth)} m from camera, ${pose}, ${p.body}${head}${looks ? `; looking at ${looks.o.name}` : ''}.`);
    }
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        const d = Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z);
        const ab = norm({ x: b.state.x - a.state.x, y: 0, z: b.state.z - a.state.z });
        const fa = forwardOf(a.state);
        const fb = forwardOf(b.state);
        const aToB = fa.x * ab.x + fa.z * ab.z;
        const bToA = -(fb.x * ab.x + fb.z * ab.z);
        const rel = aToB > 0.7 && bToA > 0.7 ? 'facing each other' : aToB < -0.7 && bToA < -0.7 ? 'back to back' : aToB > 0.7 ? `${a.name} faces ${b.name}, who faces elsewhere` : bToA > 0.7 ? `${b.name} faces ${a.name}, who faces elsewhere` : 'side by side or at an angle';
        lines.push(`- ${a.name} is screen-left of ${b.name}, ${r1(d)} m apart, ${rel}.`);
      }
    }
  }
  const out = people.filter((p) => !p.inFrame);
  if (out.length) lines.push(`Present but outside the frame: ${out.map((p) => `${p.name}${p.partly ? ' (partly at the edge)' : ''}`).join(', ')}.`);
  const absent = layout.cast.filter((c) => layout.chars[c.id].off);
  if (absent.length) lines.push(`Not in this shot at all (do not show them): ${absent.map((c) => c.name).join(', ')}.`);

  // set pieces the camera sees
  const props = layout.props
    .map((pr) => ({ pr, p: frame.project({ x: pr.x, y: pr.h / 2, z: pr.z }) }))
    .filter((x) => !x.p.behind && Math.abs(x.p.x) <= 1.1 && x.pr.label);
  if (props.length) lines.push(`Set pieces in frame: ${props.map((x) => `${x.pr.label} (${sideWord(x.p.x)}, ${r1(x.p.depth)} m from camera)`).join('; ')}.`);
  return lines.join('\n');
}

// Continuity warnings across a scene's shots: [{ shotIndex, kind, text }].
export function continuityWarnings(project, scene) {
  if (!layoutEnabled(project) || !hasLayout(project, scene.id)) return [];
  const shots = project.sceneDetails?.[scene.id]?.shots || [];
  const aspect = aspectValue(project.aspectRatio);
  const out = [];
  let prev = null;
  shots.forEach((shot, i) => {
    const layout = layoutFor(project, scene, shot.id);
    const { people } = analyse(layout, aspect);
    for (const p of people) {
      if (namedInShot(project, shot, p.name) && !p.inFrame) out.push({ shotIndex: i, kind: 'outOfFrame', a: p.name });
    }
    // named in the shot's text but marked absent from it
    for (const c of layout.cast) {
      if (layout.chars[c.id].off && namedInShot(project, shot, c.name)) out.push({ shotIndex: i, kind: 'absentNamed', a: c.name });
    }
    if (prev) {
      // the line between two characters was crossed: their screen order flipped
      for (let a = 0; a < people.length; a++) {
        for (let b = a + 1; b < people.length; b++) {
          const pa = people[a];
          const pb = people[b];
          const qa = prev.find((x) => x.id === pa.id);
          const qb = prev.find((x) => x.id === pb.id);
          if (!pa.inFrame || !pb.inFrame || !qa?.inFrame || !qb?.inFrame) continue;
          const now = pa.sx - pb.sx;
          const was = qa.sx - qb.sx;
          if (Math.abs(now) > 0.12 && Math.abs(was) > 0.12 && Math.sign(now) !== Math.sign(was)) out.push({ shotIndex: i, kind: 'flip', a: pa.name, b: pb.name });
        }
      }
      // a character moved although the shot has no layout of its own is impossible;
      // a large move between two explicit layouts is worth a look
      for (const p of people) {
        const q = prev.find((x) => x.id === p.id);
        if (!q) continue;
        const moved = Math.hypot(p.state.x - q.state.x, p.state.z - q.state.z);
        if (moved > 3) out.push({ shotIndex: i, kind: 'jump', a: p.name, m: r1(moved) });
      }
    }
    prev = people;
  });
  return out;
}
