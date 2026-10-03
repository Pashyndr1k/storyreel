// Per-shot dynamics controls of the video prompt (Stage 5, Video tab):
//   camera — six positions, from a locked-off frame to a shaky running camera;
//   action — three positions: how much everyone in the frame moves.
// The user's choice is stored in project.shotCamera[shotId] /
// project.shotAction[shotId]; an unset shot uses a default derived from the
// shot's own text and the scene's rhythm block (Action Dynamics Plan). The
// video prompt builders turn the positions into binding directives, and the
// positions a prompt was written with are remembered in
// project.shotPromptDyn[shotId] so the UI can tell when a prompt is stale.

export const CAMERA_LEVELS = ['static', 'handheld', 'dolly', 'crane', 'drone', 'shaky'];
export const ACTION_LEVELS = ['calm', 'active', 'intense'];

const CAMERA = [
  {
    directive: 'Locked-off static camera on a tripod: the frame does not move at all; every bit of motion comes from the subjects.',
    h3: 'Static Shot.',
    kling: 'static locked-off shot',
  },
  {
    directive: 'Handheld camera held by an operator who stands in one place: the frame stays on the subject with slight natural sway and small reframes; the camera does not travel.',
    h3: 'A stationary viewpoint that Shakes Slightly, with small-amplitude Pan or Tilt reframes following the subject.',
    kling: 'handheld camera, the operator stands still, slight natural sway',
  },
  {
    directive: 'Smooth dolly / tracking move: the camera glides steadily as if on a track — pushing in, pulling out or travelling alongside the subject — with no shake.',
    h3: 'Push In, Pull Out, Truck or Tracking Shot, smooth and continuous, no shake.',
    kling: 'the camera smoothly pushes in, pulls back or tracks alongside',
  },
  {
    directive: 'Dynamic crane shot: the camera sweeps through the space on a crane arm, rising or descending while it arcs or pushes, with a large fluid change of height and angle.',
    h3: 'Pedestal Up or Down with large amplitude, combined with a Tilt and an Arc Shot in one continuous sweep.',
    kling: 'crane up or crane down while orbiting, one large sweeping move',
  },
  {
    directive: 'Dynamic FPV drone shot: the camera flies fast through the space in one continuous flight, banking and rolling into its turns, diving past or chasing the subject.',
    h3: 'A fast Tracking Shot or POV flight with large amplitude at fast speed, with Roll Clockwise/Counterclockwise into the turns and Tilt changes — one unbroken flight path.',
    kling: 'fast FPV drone flight, banking turns, one continuous move',
  },
  {
    directive: 'Shaky handheld camera running with the action: the operator moves fast behind or beside the subject, the frame shakes strongly and reframes hurriedly.',
    h3: 'A Tracking Shot at fast speed that Shakes Strongly, with hurried Pan reframes.',
    kling: 'handheld follow at a run, strong camera shake',
  },
];

const ACTION = [
  'CALM — the main character performs one restrained, deliberate action, described precisely. Everyone else present is nearly still: only small natural life (breathing, a glance, a shift of weight).',
  'ACTIVE — the main character moves through a clear sequence of physical actions, described step by step (body, hands, head, gaze, where they move in the frame). Every other person in frame has a visible activity of their own: secondary characters react and do something specific, extras go about concrete business in the background.',
  'INTENSE — everything in the frame is in motion. The main character acts fast and with the whole body through several consecutive beats; secondary characters act and react energetically at the same time; extras move with purpose (hurry, turn, gesture, crowd in, scatter); the environment answers the action (objects knocked or dragged, fabric, doors, dust, wind).',
];

const has = (text, re) => re.test(text);

// Default camera position from what the shot says, then the scene's rhythm block.
export function defaultCamera(shot, block) {
  const text = `${shot?.shotType || ''} ${shot?.action || ''} ${shot?.notes || ''}`.toLowerCase();
  if (has(text, /\b(fpv|drone|aerial|fly[- ]?through)\b|дрон|с воздуха|з повітря/)) return 4;
  if (has(text, /\b(crane|jib|boom (up|down)|sweeping)\b|кран/)) return 3;
  if (has(text, /\b(shaky|chase[sd]?|chasing|sprint\w*|running|flee\w*)\b|погон|бежит|бегут|біжить|тряс/)) return 5;
  if (has(text, /\bhand-?held\b|с рук|з рук|ручн/)) return 1;
  if (has(text, /\b(dolly|tracking|push(es)?[- ]in|pull(s)?[- ](out|back)|follows?)\b|наезд|отъезд|трекинг|проезд|наїзд/)) return 2;
  if (has(text, /\b(static|locked[- ]off|tripod)\b|статич/)) return 0;
  const m = String(block?.required_camera_momentum || '').toLowerCase();
  if (/locked|static|still/.test(m)) return 0;
  if (/erratic|frantic|shak/.test(m)) return 5;
  if (/handheld/.test(m)) return 1;
  if (/fpv|drone|fly/.test(m)) return 4;
  if (/orbit|sweep|crane|soar/.test(m)) return 3;
  if (/track|creep|dolly|push|glid|steady/.test(m)) return 2;
  const e = Number(block?.kinetic_energy_level) || 0;
  if (!e) return 2;
  return e <= 2 ? 0 : e <= 4 ? 1 : e <= 6 ? 2 : e <= 8 ? 3 : 5;
}

export function defaultAction(shot, block) {
  const text = `${shot?.action || ''} ${shot?.notes || ''}`.toLowerCase();
  if (has(text, /\b(fight\w*|chase[sd]?|chasing|sprint\w*|explo\w*|crash\w*|panic\w*|riot\w*|brawl\w*)\b|драк|погон|взрыв|вибух|паник|панік/)) return 2;
  // a shot that is itself still stays calm whatever the scene's energy
  if (has(text, /\b(sits?|seated|reads?|waits?|sleeps?|stares?|listens?|motionless|stands still)\b|сидит|читает|ждёт|ждет|слушает|неподвижн|сидить|читає|чекає|слухає|нерухом/)) return 0;
  const e = Number(block?.kinetic_energy_level) || 0;
  if (!e) return 1;
  return e <= 3 ? 0 : e <= 7 ? 1 : 2;
}

const clampIdx = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : null);

export function cameraOf(project, shot, block) {
  const set = clampIdx((project.shotCamera || {})[shot.id], CAMERA_LEVELS.length);
  return set ?? defaultCamera(shot, block);
}
export function actionOf(project, shot, block) {
  const set = clampIdx((project.shotAction || {})[shot.id], ACTION_LEVELS.length);
  return set ?? defaultAction(shot, block);
}

// The two binding directives for one shot, worded for the target video model
// ('minimax' | 'kling' | 'ltx').
export function dynamicsFor(project, shot, block, engine) {
  const c = cameraOf(project, shot, block);
  const a = actionOf(project, shot, block);
  const cam = CAMERA[c];
  const vocab = engine === 'minimax' ? ` In H3 camera vocabulary: ${cam.h3}` : engine === 'kling' ? ` In Kling camera language: "${cam.kling}".` : '';
  return { camera: c, action: a, camera_setting: `${cam.directive}${vocab}`, action_setting: ACTION[a] };
}

// Instruction paragraph shared by the three video prompt builders.
export const DYNAMICS_RULE = `SHOT DYNAMICS — every shot carries two settings chosen by the director; both are BINDING and are expressed in the prompt as concrete on-screen behaviour (never quoted as labels):
- CAMERA: use exactly this camera behaviour for the shot, for its whole length. It overrides the camera-variety rule and any camera suggested by the style or the scene's momentum.
- ACTION: this is how alive the frame must be. Describe the main character's movement first and in the most detail, then give every other visible person — secondary characters and background extras — the amount of specific, physical activity the setting asks for. Never leave people standing as scenery unless the setting is calm.`;

// Has the stored video prompt been written with the shot's current settings?
export function dynamicsStale(project, shot, block) {
  if (!(project.shotPrompts?.[shot.id]?.videoPrompt || '').trim()) return false;
  const rec = (project.shotPromptDyn || {})[shot.id];
  if (!rec) return (project.shotCamera || {})[shot.id] != null || (project.shotAction || {})[shot.id] != null;
  return rec.camera !== cameraOf(project, shot, block) || rec.action !== actionOf(project, shot, block);
}
