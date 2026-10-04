// "Build layout": the text model reads the scene and its shots and places the
// characters, a few set boxes and the camera for every shot. The result is a
// starting point the user adjusts in the 3D window.
import { layoutFor, namedInShot, sceneCast, normalizeChar, normalizeCamera, normalizeProp, LENSES, POSES, MAX_PROPS, POSE_TOP } from './layout.js';

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
- Add up to ${MAX_PROPS} set pieces as plain boxes only where the action uses them or they define the place (door, table, bench, bed, car, counter, window, wall). They do not move between shots.`,
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
  let prevChars = null;
  (Array.isArray(data?.shots) ? data.shots : []).forEach((row, k) => {
    const shot = shots[(Number(row?.shot) || k + 1) - 1];
    if (!shot) return;
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
    const camera = normalizeCamera({
      tx: aimed ? aimed.x : cam.target_x,
      tz: aimed ? aimed.z : cam.target_z,
      ty: Number.isFinite(Number(cam.target_height)) ? cam.target_height : aimed ? Math.max(0.3, (POSE_TOP[aimed.pose] || 1.8) - 0.25) : 1.3,
      yaw: cam.yaw_deg,
      pitch: cam.elevation_deg,
      dist: cam.distance_m,
      lens: cam.lens_mm,
    });
    if (Object.keys(chars).length) {
      out.shots[shot.id] = { chars, camera };
      prevChars = chars;
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
