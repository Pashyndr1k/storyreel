// "Build layout": the text model reads the scene and its shots and places the
// characters, a few set boxes and the camera for every shot. The result is a
// starting point the user adjusts in the 3D window.
import { layoutFor, namedInShot, sceneCast, normalizeChar, normalizeCamera, normalizeProp, LENSES, POSES, MAX_PROPS, POSE_TOP, verticalFov, aspectValue, actionAxis, cameraSide, mirrorCamera, crossesLineOnPurpose } from './layout.js';
import { cameraFrame } from './describe.js';

// ---- framing from the shot type
// The frame height at the subject (metres) a shot size implies, and the lens
// that suits it. Read from the words of the shot type ("low-angle medium
// close-up"); the order matters (extreme close-up before close-up, …).
const FRAMINGS = [
  [/extreme[- ]close|\becu\b|macro|detail shot/i, 0.28, 85],
  [/medium[- ]close|\bmcu\b/i, 0.95, 50],
  [/close[- ]?up|\bcu\b/i, 0.55, 85],
  [/medium[- ]full|cowboy|american/i, 2.1, 35],
  [/over[- ]the[- ]shoulder|\bots\b/i, 1.1, 50],
  [/two[- ]shot/i, 2.2, 35],
  [/medium|\bms\b|mid[- ]shot/i, 1.4, 50],
  [/full[- ]?(shot|body|figure|length)|\bfs\b|head[- ]to[- ]toe/i, 3.0, 35],
  [/extreme[- ]wide|\bews\b|\bels\b|establishing|aerial|drone|bird/i, 12, 18],
  [/wide|\bws\b|\bls\b|long shot|master/i, 6, 24],
  [/insert/i, 0.4, 85],
];
export function framingOf(shotType) {
  const t = String(shotType || '');
  const hit = FRAMINGS.find(([re]) => re.test(t));
  return hit ? { height: hit[1], lens: hit[2] } : null;
}
const rad = (d) => (d * Math.PI) / 180;

// Fit the camera to the shot type: the distance that gives the shot size at
// the target with the lens (a lens more than one step off the one the size
// suits is replaced — a telephoto planned for a wide view puts the camera in
// the subject's face), then, for medium shots and wider, far enough back
// that every named present character is inside the frame.
export function fitCamera(cam, shotType, aspect, heads = []) {
  const f = framingOf(shotType);
  const out = { ...cam };
  if (f) {
    if (Math.abs(LENSES.indexOf(out.lens) - LENSES.indexOf(f.lens)) > 1) out.lens = f.lens;
    const tanV = Math.tan(rad(verticalFov(out.lens, aspect)) / 2);
    out.dist = f.height / (2 * tanV);
  }
  if (heads.length && (!f || f.height >= 1.4)) {
    // at most twice the framing's distance: a medium shot may become a
    // full shot to hold everyone, never a wide one (the warnings say the rest)
    const maxDist = f ? out.dist * 2 : 40;
    for (let k = 0; k < 12 && out.dist * 1.15 <= maxDist; k++) {
      const frame = cameraFrame(normalizeCamera(out), aspect);
      const outside = heads.some((h) => {
        const p = frame.project(h);
        return p.behind || Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.95;
      });
      if (!outside) break;
      out.dist *= 1.15;
    }
  }
  return normalizeCamera(out);
}

// Keep the camera on the side of the line it had in the previous shot (the
// 180° rule): when it crossed, mirror it back — unless the shot's text asks
// for the crossing. Returns the camera to use.
export function keepSide(prev, cur, cast, shot) {
  if (!prev || crossesLineOnPurpose(shot)) return cur.camera;
  const axis = actionAxis(cur.chars, cast, cur.camera);
  const before = actionAxis(prev.chars, cast, prev.camera);
  if (!axis || !before || axis.key !== before.key) return cur.camera;
  const was = cameraSide(before, prev.camera);
  const now = cameraSide(axis, cur.camera);
  return was && now && was !== now ? mirrorCamera(axis, cur.camera) : cur.camera;
}

// the heads of the present characters a shot's text names
const namedHeads = (project, shot, cast, chars) =>
  cast.filter((c) => chars[c.id] && !chars[c.id].off && namedInShot(project, shot, c.name)).map((c) => ({ x: chars[c.id].x, y: (POSE_TOP[chars[c.id].pose] || 1.8) - 0.16, z: chars[c.id].z }));

export function layoutPrompt(project, scene, shots) {
  const cast = sceneCast(project, scene);
  const sceneNo = project.outline.findIndex((s) => s.id === scene.id) + 1;
  return {
    system: `You are a film blocking planner. You place actors, a few set pieces and the camera on a floor plan for every shot of a scene, so that the shots cut together without anyone jumping around the set.

Respond with VALID JSON ONLY. No markdown, no commentary.

FLOOR PLAN CONVENTIONS
- Units are metres. The floor is the x–z plane; the scene's centre is x = 0, z = 0. x grows to the right and z grows toward the viewer of the default camera. Keep the action within about 6 metres of the centre.
- "facing_deg" is the direction a body faces: 0 = toward +z (toward a camera placed at yaw 0), 90 = toward +x, 180 = toward -z (away from that camera), 270 = toward -x.
- "head_turn_deg" turns the head relative to the body, from -80 to 80: 0 = looking straight ahead, positive = toward the character's own left, negative = toward their own right.
- "pose" is one of: ${POSES.join(', ')}. It sets the height of the figure, not its anatomy.
- The camera orbits a target point. "yaw_deg" is where the camera stands around the target: 0 = on the +z side looking toward -z, 90 = on the +x side, 180 = on the -z side, 270 = on the -x side. "elevation_deg" raises it: 0 = level with the target, 30 = looking down from above, 80 = almost top-down, negative = looking up from below. "distance_m" is the distance from the camera to the target. "target_height" is the height of the target point (about 1.5 for a standing head, 1.1 for a seated one, 0.9 for a full figure).
- "lens_mm" is one of: ${LENSES.join(', ')} (full-frame).

RULES
- THE CAST COVERS THE WHOLE SCENE. List EVERY character in EVERY shot, with "present": true when the character is at the location during that shot (on or off camera) and "present": false when they are not there — they have not arrived yet, or have left. Read all the shots first: a character who first appears in shot 3 is "present": false in shots 1 and 2. For an absent character still give the position where they will enter or where they left.
- CONTINUITY: a character stays exactly where they were in the previous shot unless this shot's action moves them; then move them only as far as the action says. Never swap two characters' places.
- People who talk to each other face each other, 1 to 1.5 metres apart. Nobody stands closer than 0.6 metres to anyone else. People walking together face the same way.
- THE LINE: for two characters in conversation, keep the camera on the same side of the line between them for the whole scene, so the one on screen-left stays on screen-left. Cross the line only when a shot's description demands it.
- FRAMING: choose distance and lens from the shot type — extreme close-up: 85 mm at about 1 m; close-up: 85 mm at 1.5–2.5 m; medium close-up: 50 mm at 2–2.5 m; medium: 50 mm at 3–4 m; full: 35 mm at 5–6 m; wide: 24 mm at 6–9 m; extreme wide: 18 mm at 10 m or more. Low angle: negative elevation with the camera low; high angle: elevation 25–45; top-down: elevation 80; ground-level: target_height 0.3 and elevation 0 to -10.
- The camera must see every PRESENT character the shot's action or dialogue names. Aim it ("aim_at") at the character who is the subject of the shot, or give target_x / target_z for a group.
- Add up to ${MAX_PROPS} set pieces as plain boxes: ALWAYS the landmarks that define the place and its background (the window, the shop front, the door, the counter, the bar, the table, the bed, the car, a wall with a sign) and anything the action uses. They do not move between shots.
- THE SET KEEPS ITS SIDE: because the set pieces never move, a camera that stays on one side of the action keeps the window / door / counter on the same side of the screen in every shot. Placing the camera on the opposite side (yaw about 180° away, so the background swaps sides) is a line crossing: do it only when the shot's description asks for it.`,
    maxTokens: 9000,
    user: `SCENE ${sceneNo}: ${scene.title} — ${scene.summary}

CHARACTERS (use these exact names):
${cast.map((c) => { const first = shots.findIndex((s) => namedInShot(project, s, c.name)); return `- ${c.name}${first >= 0 ? ` (first named in shot ${first + 1})` : ''}`; }).join('\n')}

SHOTS:
${shots.map((s, i) => `${i + 1}. [${s.shotType || 'shot'}] location: ${s.location || scene.title}. Action: ${s.action || '—'}${s.dialogue ? ` Dialogue: ${s.dialogue}` : ''}`).join('\n')}

Return the layout for all ${shots.length} shots, in order.

JSON schema:
{"props":[{"label":"door","x":0,"z":-3,"w":1,"d":0.2,"h":2.1,"rot":0}],"shots":[{"shot":1,"characters":[{"name":"${cast[0]?.name || 'Name'}","present":true,"x":-0.6,"z":0,"facing_deg":90,"head_turn_deg":0,"pose":"standing"}],"camera":{"aim_at":"${cast[0]?.name || 'Name'}","target_x":0,"target_z":0,"target_height":1.5,"yaw_deg":20,"elevation_deg":5,"distance_m":3,"lens_mm":50}}]}`,
  };
}

// The model's answer → the stored layout { props, shots }.
export function layoutFromModel(project, scene, shots, data) {
  const cast = sceneCast(project, scene);
  const byName = (name) => {
    const n = String(name || '').trim().toLowerCase();
    return cast.find((c) => c.name.toLowerCase() === n) || cast.find((c) => n && (c.name.toLowerCase().startsWith(n) || n.startsWith(c.name.toLowerCase().split(/\s+/)[0])));
  };
  const keptCast = (project.sceneLayouts || {})[scene.id]?.cast;
  const out = { ...(Array.isArray(keptCast) ? { cast: keptCast } : {}), props: (Array.isArray(data?.props) ? data.props : []).slice(0, MAX_PROPS).map(normalizeProp), shots: {} };
  const aspect = aspectValue(project.aspectRatio);
  let prevChars = null;
  let prevLayout = null; // the shot before, for the line of action
  (Array.isArray(data?.shots) ? data.shots : []).forEach((row, k) => {
    const index = (Number(row?.shot) || k + 1) - 1;
    const shot = shots[index];
    if (!shot) return;
    // a single rebuilt shot (or the first row) continues the stored layout before it
    if (!prevLayout && index > 0) {
      const l = layoutFor(project, scene, shots[index - 1].id);
      if (l.exists) prevLayout = { chars: l.chars, camera: l.camera };
    }
    const chars = {};
    for (const c of Array.isArray(row.characters) ? row.characters : []) {
      const who = byName(c?.name);
      if (who) chars[who.id] = normalizeChar({ x: c.x, z: c.z, rot: c.facing_deg, head: c.head_turn_deg, pose: c.pose, off: c.present === false });
    }
    // anyone the model left out stays where they were
    for (const c of cast) if (!chars[c.id] && prevChars?.[c.id]) chars[c.id] = prevChars[c.id];
    const cam = row.camera || {};
    const aim = byName(cam.aim_at);
    const aimed = aim && chars[aim.id] && !chars[aim.id].off ? chars[aim.id] : null;
    let camera = normalizeCamera({
      tx: aimed ? aimed.x : cam.target_x,
      tz: aimed ? aimed.z : cam.target_z,
      ty: Number.isFinite(Number(cam.target_height)) ? cam.target_height : aimed ? Math.max(0.3, (POSE_TOP[aimed.pose] || 1.8) - 0.25) : 1.3,
      yaw: cam.yaw_deg,
      pitch: cam.elevation_deg,
      dist: cam.distance_m,
      lens: cam.lens_mm,
    });
    // the shot type decides the shot size, not the planner's distance; the
    // camera stays on its side of the line
    camera = fitCamera(camera, shot.shotType, aspect, namedHeads(project, shot, cast, chars));
    camera = keepSide(prevLayout, { chars, camera }, cast, shot);
    if (Object.keys(chars).length) {
      out.shots[shot.id] = { chars, camera };
      prevChars = chars;
      prevLayout = { chars, camera };
    }
  });
  return out;
}

// "Rebuild shot": the same planner re-places ONE shot. It is given the layout
// of the neighbouring shots and the set pieces as fixed facts, so the new
// staging cuts together with what is already there.
export function shotLayoutPrompt(project, scene, shots, index) {
  const base = layoutPrompt(project, scene, shots);
  const r1 = (v) => Math.round(v * 10) / 10;
  const stateOf = (i) => {
    const l = layoutFor(project, scene, shots[i].id);
    const people = l.cast.map((c) => {
      const st = l.chars[c.id];
      return st.off ? `${c.name}: not present` : `${c.name}: x ${r1(st.x)}, z ${r1(st.z)}, facing_deg ${Math.round((st.rot + 360) % 360)}, head_turn_deg ${Math.round(st.head)}, ${st.pose}`;
    });
    const cam = l.camera;
    return `Shot ${i + 1}:\n${people.map((p) => `  - ${p}`).join('\n')}\n  - camera: target x ${r1(cam.tx)}, z ${r1(cam.tz)}, height ${r1(cam.ty)}; yaw_deg ${Math.round((cam.yaw + 360) % 360)}, elevation_deg ${Math.round(cam.pitch)}, distance_m ${r1(cam.dist)}, lens_mm ${cam.lens}`;
  };
  const current = layoutFor(project, scene, shots[index].id);
  const around = [index - 1, index + 1].filter((i) => i >= 0 && i < shots.length);
  const props = current.props.length
    ? current.props.map((p) => `- ${p.label || 'box'}: x ${r1(p.x)}, z ${r1(p.z)}, ${r1(p.w)} × ${r1(p.d)} m, ${r1(p.h)} m high`).join('\n')
    : '(none)';
  const head = base.user.slice(0, base.user.indexOf('Return the layout for all'));
  const one = `{"shots":[{"shot":${index + 1},${base.user.slice(base.user.indexOf('"characters":['))}`;
  return {
    system: base.system,
    maxTokens: 4000,
    user: `${head}SET PIECES ALREADY ON THE FLOOR (fixed — do not move, add or return them):
${props}

LAYOUT OF THE NEIGHBOURING SHOTS (fixed — they stay as they are):
${around.length ? around.map(stateOf).join('\n') : '(this is the only shot)'}

Re-plan ONLY shot ${index + 1}. Stage it afresh from its own action and shot type: choose the positions, facing, poses and the camera that tell this shot best. Keep it continuous with the neighbouring shots above — a character stands where the previous shot left them unless this shot's action moves them, and screen sides do not flip against the previous shot unless the action demands it. List every character with "present".

Return exactly one entry in "shots", with "shot": ${index + 1}.

JSON schema:
${one}`,
  };
}

// One rebuilt shot from the model's answer: { chars, camera } or null.
export function shotLayoutFromModel(project, scene, shots, index, data) {
  const rows = Array.isArray(data?.shots) ? data.shots : data?.characters ? [data] : [];
  const row = rows.find((r) => Number(r?.shot) === index + 1) || rows[0];
  if (!row) return null;
  const built = layoutFromModel(project, scene, shots, { shots: [{ ...row, shot: index + 1 }] }).shots[shots[index].id];
  if (!built) return null;
  // anyone the model left out keeps the state they had in this shot
  const cur = layoutFor(project, scene, shots[index].id);
  for (const c of cur.cast) if (!built.chars[c.id]) built.chars[c.id] = cur.chars[c.id];
  return built;
}
