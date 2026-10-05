// Agent tools for the 3D spatial layout: read it, have the text model build it
// (a scene or one shot), and place characters, camera and set boxes directly.
// Numbers use the same conventions the layout planner is given (see
// lib/spatial/build.js): metres, facingDeg 0 = toward +z, yawDeg around the
// camera's target. The handlers get the api's helpers through `ctx`.
import { layoutFor, sceneLayout, sceneCast, layoutEnabled, hasLayout, normalizeChar, normalizeCamera, normalizeProp, POSES, LENSES, POSE_TOP, MAX_PROPS, MAX_LAYOUT_CHARS } from '../spatial/layout.js';
import { describeShot, continuityWarnings } from '../spatial/describe.js';
import { layoutPrompt, layoutFromModel, shotLayoutPrompt, shotLayoutFromModel } from '../spatial/build.js';
import { layoutSnapshot } from '../spatial/offscreen.js';
import { generateJSON, textKeyError } from '../claude.js';

const r1 = (v) => Math.round(v * 10) / 10;
const deg = (v) => Math.round(((v % 360) + 360) % 360);
const shotsOf = (project, scene) => project.sceneDetails[scene.id]?.shots || [];

const WARN = {
  outOfFrame: (w) => `Shot ${w.shotIndex + 1}: ${w.a} is named in the shot but is outside the frame.`,
  absentNamed: (w) => `Shot ${w.shotIndex + 1}: ${w.a} is named in the shot but is marked as not present.`,
  flip: (w) => `Shot ${w.shotIndex + 1}: ${w.a} and ${w.b} swapped screen sides against the previous shot (the line was crossed).`,
  jump: (w) => `Shot ${w.shotIndex + 1}: ${w.a} is ${w.m} m from where the previous shot left them.`,
};
const warningsOf = (project, scene) => continuityWarnings(project, scene).map((w) => (WARN[w.kind] ? WARN[w.kind](w) : `Shot ${w.shotIndex + 1}: ${w.kind}`));

function shotLayoutView(project, scene, shot, i) {
  const l = layoutFor(project, scene, shot.id);
  return {
    shotId: shot.id,
    number: i + 1,
    action: shot.action || '',
    layout: l.own ? 'own' : l.inheritedFrom != null ? `continues shot ${l.inheritedFrom + 1}` : 'default (nothing placed yet)',
    characters: l.cast.map((c) => {
      const st = l.chars[c.id];
      return { name: c.name, present: !st.off, x: r1(st.x), z: r1(st.z), facingDeg: deg(st.rot), headTurnDeg: Math.round(st.head), pose: st.pose };
    }),
    camera: { targetX: r1(l.camera.tx), targetZ: r1(l.camera.tz), targetHeight: r1(l.camera.ty), yawDeg: deg(l.camera.yaw), elevationDeg: Math.round(l.camera.pitch), distanceM: r1(l.camera.dist), lensMm: l.camera.lens },
    description: describeShot(project, scene, shot.id) || null,
  };
}

export function layoutView(project, scene, shotId = null) {
  const shots = shotsOf(project, scene);
  const stored = sceneLayout(project, scene.id);
  return {
    enabled: layoutEnabled(project),
    ...(layoutEnabled(project) ? {} : { note: 'The 3D layout is off for this project: prompts ignore it. Turn it on with storyreel_update_project { useLayout: true }.' }),
    sceneId: scene.id,
    hasLayout: hasLayout(project, scene.id),
    cast: sceneCast(project, scene).map((c) => c.name),
    castSource: Array.isArray(stored?.cast) ? 'set by hand' : 'everyone the scene\'s shots name',
    setBoxes: (stored?.props || []).map(normalizeProp).map((p) => ({ label: p.label, x: r1(p.x), z: r1(p.z), width: r1(p.w), depth: r1(p.d), height: r1(p.h), facingDeg: deg(p.rot) })),
    shots: shots.map((s, i) => ({ s, i })).filter(({ s }) => !shotId || s.id === shotId).map(({ s, i }) => shotLayoutView(project, scene, s, i)),
    warnings: warningsOf(project, scene),
  };
}

const num = { type: 'number' };
const CHARACTER = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Character name as on the card.' },
    present: { type: 'boolean', description: 'false = not at the location in this shot (not arrived yet, or gone).' },
    x: num,
    z: num,
    facingDeg: { type: 'number', description: '0 = toward +z, 90 = toward +x, 180 = toward -z, 270 = toward -x.' },
    headTurnDeg: { type: 'number', description: '-80…80 relative to the body; positive = the character\'s own left.' },
    pose: { type: 'string', enum: POSES },
  },
  required: ['name'],
  additionalProperties: false,
};
const CAMERA = {
  type: 'object',
  properties: {
    aimAt: { type: 'string', description: 'Character name to point the camera at (sets the target to them).' },
    targetX: num,
    targetZ: num,
    targetHeight: { type: 'number', description: 'About 1.5 for a standing head, 1.1 seated, 0.9 for a full figure.' },
    yawDeg: { type: 'number', description: 'Where the camera stands around its target: 0 = +z side, 90 = +x side, 180 = -z side, 270 = -x side.' },
    elevationDeg: { type: 'number', description: '0 = level, 30 = looking down, 80 = top-down, negative = from below.' },
    distanceM: num,
    lensMm: { type: 'integer', enum: LENSES },
  },
  additionalProperties: false,
};
const BOX = {
  type: 'object',
  properties: { label: { type: 'string' }, x: num, z: num, width: num, depth: num, height: num, facingDeg: num },
  required: ['label'],
  additionalProperties: false,
};

export function layoutTools(ctx) {
  const { app, projectOf, patchProject, sceneOf, findShot, fail, settle, countAttempt, schema, PROJECT } = ctx;
  const needOn = (p) => layoutEnabled(p) || fail('LAYOUT_OFF', 'The 3D layout is off for this project. Turn it on with storyreel_update_project { useLayout: true } — only when the staging of the scene matters enough to plan it.');
  const writeScene = (projectId, sceneId, fn) =>
    patchProject(projectId, (q) => {
      const sl = (q.sceneLayouts || {})[sceneId] || { props: [], shots: {} };
      return { sceneLayouts: { ...(q.sceneLayouts || {}), [sceneId]: fn(sl, q) } };
    });
  // the camera view of each given shot, saved with its layout (what
  // storyreel_review_shot shows as the intended composition)
  const saveViews = async (projectId, sceneId, shotIds) => {
    await settle();
    const p = projectOf(projectId);
    const scene = sceneOf(p, sceneId);
    const views = {};
    for (const sid of shotIds) {
      if (!sceneLayout(p, sceneId)?.shots?.[sid]) continue;
      const img = layoutSnapshot(p, scene, sid);
      if (img) views[sid] = img;
    }
    if (Object.keys(views).length) {
      writeScene(projectId, sceneId, (sl) => ({ ...sl, shots: Object.fromEntries(Object.entries(sl.shots || {}).map(([k, v]) => [k, views[k] ? { ...v, view: views[k] } : v])) }));
      await settle();
    }
  };
  const resolveScene = (p, sceneId, shotId) => (shotId ? findShot(p, shotId).scene : sceneOf(p, sceneId || fail('BAD_INPUT', 'Give sceneId or shotId.')));

  return [
    {
      name: 'storyreel_get_layout',
      description:
        'The 3D spatial layout of a scene (or of one shot with shotId): the scene\'s cast, set boxes, and for every shot each character\'s position (metres), facing, pose and whether they are present, the camera, the measured description the prompt writers receive, and the continuity warnings. image=true also returns the camera view of each listed shot (block figures; one colour per character).',
      inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, shotId: { type: 'string' }, image: { type: 'boolean' } }, ['projectId']),
      run: async ({ projectId, sceneId, shotId, image }) => {
        const p = projectOf(projectId);
        const scene = resolveScene(p, sceneId, shotId);
        const view = layoutView(p, scene, shotId || null);
        if (!image) return view;
        const images = [];
        for (const s of view.shots.slice(0, 12)) {
          const img = layoutSnapshot(p, scene, s.shotId);
          if (img) images.push({ label: `Shot ${s.number} — camera view of the layout (block figures stand in for the characters)`, dataURL: img });
        }
        return { ...view, images };
      },
    },
    {
      name: 'storyreel_build_layout',
      description:
        'Have the app\'s text model build the 3D layout: with sceneId — for every shot of the scene (replaces the scene\'s layout and set boxes); with shotId — for that shot only, kept continuous with the shots before and after it. Needs the layout turned on (storyreel_update_project useLayout) and the scene\'s shots. Counts as an attempt. Read the warnings in the result, then recreate the scene\'s prompts so they follow the layout.',
      inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, shotId: { type: 'string' } }, ['projectId']),
      run: async ({ projectId, sceneId, shotId }) => {
        const settings = app().settings;
        if (textKeyError(settings)) fail('NO_KEY', 'The text model API key is not set in StoryReel Settings.');
        let p = projectOf(projectId);
        needOn(p);
        const scene = resolveScene(p, sceneId, shotId);
        const shots = shotsOf(p, scene);
        if (!shots.length) fail('NOT_READY', 'This scene has no shots yet (Stage 4).');
        if (shotId) {
          const index = shots.findIndex((s) => s.id === shotId);
          const attempt = countAttempt(projectId, { shotId, sceneId: scene.id, kind: 'layout' }, 'The layout of this shot');
          const built = shotLayoutFromModel(p, scene, shots, index, await generateJSON(settings, shotLayoutPrompt(p, scene, shots, index)));
          if (!built) fail('GENERATION_FAILED', 'The model returned no layout for the shot.');
          writeScene(projectId, scene.id, (sl) => ({ ...sl, shots: { ...sl.shots, [shotId]: built } }));
          await saveViews(projectId, scene.id, [shotId]);
          p = projectOf(projectId);
          return { attempt, ...layoutView(p, sceneOf(p, scene.id), shotId), next: 'storyreel_create_prompts for this shot (image, then video).' };
        }
        const attempt = countAttempt(projectId, { sceneId: scene.id, kind: 'layout' }, 'The layout of this scene');
        const built = layoutFromModel(p, scene, shots, await generateJSON(settings, layoutPrompt(p, scene, shots)));
        if (!Object.keys(built.shots).length) fail('GENERATION_FAILED', 'The model returned no layout.');
        writeScene(projectId, scene.id, () => built);
        await saveViews(projectId, scene.id, Object.keys(built.shots));
        p = projectOf(projectId);
        return { attempt, ...layoutView(p, sceneOf(p, scene.id)), next: 'storyreel_create_prompts with sceneId.' };
      },
    },
    {
      name: 'storyreel_set_layout',
      description:
        'Edit the 3D layout by hand. Scene level (sceneId): cast — the full list of character names the layout holds (max 6); setBoxes — the full list of set pieces (max 8, they do not move between shots). Shot level (shotId): characters — only those you change, only the fields you change; camera — only the fields you change (aimAt points it at a character); usePrevious=true drops the shot\'s own layout so it continues the previous shot\'s. A shot you edit gets its own layout; later shots without their own continue from it. Free — does not count as an attempt. Returns the new measured description and the warnings.',
      inputSchema: schema(
        {
          ...PROJECT,
          sceneId: { type: 'string' },
          shotId: { type: 'string' },
          cast: { type: 'array', items: { type: 'string' }, maxItems: MAX_LAYOUT_CHARS },
          setBoxes: { type: 'array', items: BOX, maxItems: MAX_PROPS },
          characters: { type: 'array', items: CHARACTER },
          camera: CAMERA,
          usePrevious: { type: 'boolean' },
        },
        ['projectId']
      ),
      run: async ({ projectId, sceneId, shotId, cast, setBoxes, characters, camera, usePrevious }) => {
        let p = projectOf(projectId);
        needOn(p);
        const scene = resolveScene(p, sceneId, shotId);
        if ((characters || camera || usePrevious) && !shotId) fail('BAD_INPUT', 'characters, camera and usePrevious need shotId.');
        if (cast) {
          const all = p.storyline?.characters || [];
          const ids = cast.map((n) => (all.find((c) => (c.name || '').toLowerCase() === String(n).trim().toLowerCase()) || fail('NOT_FOUND', `No character named "${n}". Names: ${all.map((c) => c.name).join(', ')}.`)).id);
          writeScene(projectId, scene.id, (sl) => ({ ...sl, cast: [...new Set(ids)].slice(0, MAX_LAYOUT_CHARS) }));
        }
        if (setBoxes) {
          writeScene(projectId, scene.id, (sl) => ({
            ...sl,
            props: setBoxes.slice(0, MAX_PROPS).map((b, i) => normalizeProp({ id: (sl.props || [])[i]?.id, label: b.label, x: b.x, z: b.z, w: b.width, d: b.depth, h: b.height, rot: b.facingDeg })),
          }));
        }
        if (cast || setBoxes) await settle();
        if (shotId && usePrevious) {
          writeScene(projectId, scene.id, (sl) => {
            const next = { ...(sl.shots || {}) };
            delete next[shotId];
            return { ...sl, shots: next };
          });
        } else if (shotId && (characters || camera)) {
          p = projectOf(projectId);
          const sc = sceneOf(p, scene.id);
          const eff = layoutFor(p, sc, shotId);
          const byName = (n) => eff.cast.find((c) => c.name.toLowerCase() === String(n || '').trim().toLowerCase()) || fail('NOT_FOUND', `"${n}" is not in this scene's layout cast (${eff.cast.map((c) => c.name).join(', ')}). Add them with cast first.`);
          const chars = structuredClone(eff.chars);
          for (const c of characters || []) {
            const who = byName(c.name);
            const st = chars[who.id];
            chars[who.id] = normalizeChar({
              x: c.x ?? st.x,
              z: c.z ?? st.z,
              rot: c.facingDeg ?? st.rot,
              head: c.headTurnDeg ?? st.head,
              pose: c.pose ?? st.pose,
              off: c.present == null ? st.off : !c.present,
            });
          }
          let cam = { ...eff.camera };
          if (camera) {
            const aimed = camera.aimAt ? chars[byName(camera.aimAt).id] : null;
            cam = normalizeCamera({
              tx: aimed ? aimed.x : camera.targetX ?? cam.tx,
              tz: aimed ? aimed.z : camera.targetZ ?? cam.tz,
              ty: camera.targetHeight ?? (aimed ? Math.max(0.3, (POSE_TOP[aimed.pose] || 1.8) - 0.25) : cam.ty),
              yaw: camera.yawDeg ?? cam.yaw,
              pitch: camera.elevationDeg ?? cam.pitch,
              dist: camera.distanceM ?? cam.dist,
              lens: camera.lensMm ?? cam.lens,
            });
          }
          writeScene(projectId, scene.id, (sl) => ({ ...sl, shots: { ...(sl.shots || {}), [shotId]: { chars, camera: cam } } }));
          await saveViews(projectId, scene.id, [shotId]);
        }
        await settle();
        p = projectOf(projectId);
        return { ...layoutView(p, sceneOf(p, scene.id), shotId || null), note: 'Prompts already written do not change; recreate the prompts of the shots whose layout changed.' };
      },
    },
  ];
}
