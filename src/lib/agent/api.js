// The agent API: the tools an AI agent (Claude Code through the bundled MCP
// server, or anything that can POST JSON) uses to operate StoryReel.
//
// Every tool is one entry in TOOLS — name, description, JSON-schema input and
// a handler. The Electron main process serves them over a local HTTP endpoint
// (electron/agentServer.cjs) and forwards each call to callAgent() here; the
// handlers drive the app through the actions its mounted parts registered
// (lib/agent/registry.js), so the agent runs exactly the code the buttons run.
//
// Guard rails live here, not in the agent's prompt:
//   - attempts are counted per target and the 5th is refused (ATTEMPT_LIMIT),
//     flagging the target automatically;
//   - one call at a time (BUSY);
//   - no tool returns or accepts API keys.
import GUIDE from '../../../agent/AGENT_GUIDE.md?raw';
import { agentScope, waitScope, inAgentCall, takeAgentAlerts } from './registry.js';
import { still, contactSheet, videoFrame, audioReport } from './evidence.js';
import { newProject, uid } from '../storage.js';
import { generateJSON, textKeyError } from '../claude.js';
import { smartEditPrompt, voiceSourceFor } from '../prompts.js';
import { computeSmartPatch } from '../../components/SmartEditModal.jsx';
import { shotCastRefs } from '../castRefs.js';
import { locationsOf, shotLocationRefs } from '../sceneLocations.js';
import { describeShot } from '../spatial/describe.js';
import { sceneLayout, layoutEnabled } from '../spatial/layout.js';
import { CAMERA_LEVELS, ACTION_LEVELS, cameraOf, actionOf } from '../shotDynamics.js';
import { blockForScene } from '../dynamics.js';
import { transcribeAudio } from '../gemini.js';
import { SHORT_DRAMA_STYLE_ID, isSeriesMaster } from '../series.js';
import { MAX_CHARACTER_REFS } from '../config.js';

export const MAX_ATTEMPTS = 4;
export const FLAG_KINDS = ['likeness', 'continuity', 'environment', 'audio', 'artifact', 'style', 'script', 'other'];

class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new AgentError(code, message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(160); // let React commit the state an action just set

// ---------------------------------------------------------------- app access
const app = () => agentScope('app') || fail('APP_NOT_READY', 'StoryReel has not finished loading.');
const projectOf = (id) => app().projects.find((p) => p.id === id) || fail('NOT_FOUND', `No project with id "${id}".`);
const patchProject = (id, patch) => app().updateProject(id, patch);

function findShot(project, shotId) {
  for (const scene of project.outline) {
    const shots = project.sceneDetails[scene.id]?.shots || [];
    const i = shots.findIndex((s) => s.id === shotId);
    if (i >= 0) return { scene, shots, shot: shots[i], index: i };
  }
  return fail('NOT_FOUND', `No shot with id "${shotId}" in this project.`);
}
const sceneOf = (project, sceneId) => project.outline.find((s) => s.id === sceneId) || fail('NOT_FOUND', `No scene with id "${sceneId}".`);

// Open the project at a stage and return that stage's action scope.
async function openStage(id, stage) {
  projectOf(id);
  app().openProject(id);
  const ps = await waitScope('project', (s) => s.id === id);
  if (!ps) fail('UI', 'The project did not open.');
  patchProject(id, (p) => ({ stage: Math.max(p.stage || 1, stage) }));
  if (ps.view !== stage) ps.setView(stage);
  const name = stage === 5 ? 'assembly' : `stage${stage}`;
  const scope = await waitScope(name, (s) => s.projectId === id);
  if (!scope) fail('UI', `Stage ${stage} did not open.`);
  return scope;
}
// The Stage 5 workbench focused on a scene (and optionally a shot).
async function openBench(id, sceneId, shotId = null) {
  const assembly = await openStage(id, 5);
  assembly.select(sceneId, shotId);
  const bench = await waitScope('bench', (s) => s.projectId === id && s.sceneId === sceneId && (shotId ? s.focusShotId === shotId : !s.focusShotId));
  if (!bench) fail('UI', 'The shot workbench did not open on that scene.');
  return bench;
}

// ------------------------------------------------------- attempts and flags
const attemptKey = (target) =>
  target.shotId ? `shot:${target.shotId}:${target.kind}` : target.sceneId ? `scene:${target.sceneId}:${target.kind}` : `stage:${target.stage}`;

function addFlag(id, flag) {
  const entry = { id: `flag_${uid()}`, createdAt: Date.now(), resolved: false, by: 'agent', note: '', attempts: 0, ...flag };
  patchProject(id, (p) => ({ agentFlags: [...(p.agentFlags || []), entry] }));
  return entry;
}

// Count an attempt; the one after MAX_ATTEMPTS is refused and flagged.
function countAttempt(id, target, what) {
  const key = attemptKey(target);
  const p = projectOf(id);
  const used = (p.agentAttempts || {})[key] || 0;
  if (used >= MAX_ATTEMPTS) {
    const open = (p.agentFlags || []).some((f) => !f.resolved && f.attemptKey === key);
    if (!open) {
      addFlag(id, {
        target,
        attemptKey: key,
        kind: 'other',
        issue: `${what}: not acceptable after ${MAX_ATTEMPTS} attempts.`,
        attempts: used,
        auto: true,
      });
    }
    fail('ATTEMPT_LIMIT', `${what} has already been attempted ${used} times (limit ${MAX_ATTEMPTS}). It is flagged; move on to the next task.`);
  }
  patchProject(id, (q) => ({ agentAttempts: { ...(q.agentAttempts || {}), [key]: used + 1 } }));
  return used + 1;
}

// --------------------------------------------------------------- snapshots
const has = (map, id) => !!(map || {})[id];

function shotView(project, scene, shot, i, withPrompts) {
  const block = blockForScene(project.dynamicsPlan, project.outline.indexOf(scene) + 1);
  const pr = project.shotPrompts[shot.id] || {};
  return {
    id: shot.id,
    number: i + 1,
    durationSec: Number(shot.duration) || 0,
    shotType: shot.shotType || '',
    location: shot.location || '',
    action: shot.action || '',
    dialogue: shot.dialogue || '',
    notes: shot.notes || '',
    has: {
      imagePrompt: !!(pr.imagePrompt || '').trim(),
      videoPrompt: !!(pr.videoPrompt || '').trim(),
      image: has(project.shotImages, shot.id),
      finalFrame: has(project.shotFinalImages, shot.id),
      video: has(project.shotVideos, shot.id),
      voice: has(project.shotAudios, shot.id),
    },
    imageVersions: ((project.shotImageHistory || {})[shot.id] || []).length,
    camera: CAMERA_LEVELS[cameraOf(project, shot, block)],
    dynamics: ACTION_LEVELS[actionOf(project, shot, block)],
    voiceSource: (shot.dialogue || '').trim() ? voiceSourceFor(project, shot.id) : null,
    ...(withPrompts ? { imagePrompt: pr.imagePrompt || '', videoPrompt: pr.videoPrompt || '', voicePrompt: pr.voicePrompt || '' } : {}),
  };
}

function projectView(project, { prompts = false } = {}) {
  const styles = app().styles;
  const styleName = (cat, sid) => (styles?.[cat] || []).find((s) => s.id === sid)?.name || '';
  return {
    id: project.id,
    title: project.title,
    genres: project.genres,
    stage: project.stage,
    scriptType: project.scriptType,
    ...(project.scriptType === 'series' ? { episodeCount: project.episodeCount, episodeSeconds: project.episodeSeconds, seriesMaster: isSeriesMaster(project) } : {}),
    aspectRatio: project.aspectRatio,
    styles: {
      script: { id: project.scriptStyleId, name: styleName('script', project.scriptStyleId) },
      image: { id: project.imageStyleId, name: styleName('image', project.imageStyleId) },
      video: { id: project.videoStyleId, name: styleName('video', project.videoStyleId) },
    },
    logline: project.logline || '',
    ideas: (project.ideas || []).map((x, i) => ({ index: i, title: x.title, pitch: x.pitch, selected: x.id === project.selectedIdeaId })),
    approvedPlot: project.approvedPlot || '',
    synopsis: project.storyline?.synopsis || '',
    characters: (project.storyline?.characters || []).map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description, referencePhotos: (c.photos || []).length })),
    groups: (project.storyline?.groups || []).map((g) => ({ name: g.name, members: (g.memberIds || []).map((mid) => project.storyline.characters.find((c) => c.id === mid)?.name).filter(Boolean) })),
    pacingPlan: project.dynamicsPlan
      ? project.dynamicsPlan.rhythm_blocks.map((b) => ({ scenes: b.scene_numbers, energy: b.kinetic_energy_level, dialogue: b.dialogue_volume, cutting: b.shot_density, camera: b.required_camera_momentum }))
      : null,
    scenes: project.outline.map((scene, n) => ({
      id: scene.id,
      number: n + 1,
      ...(scene.episode ? { episode: scene.episode } : {}),
      title: scene.title,
      summary: scene.summary,
      plannedSec: Number(scene.duration) || 0,
      locations: locationsOf(scene).map((l) => ({ name: l.name, referencePhotos: (l.photos || []).length })),
      shots: (project.sceneDetails[scene.id]?.shots || []).map((s, i) => shotView(project, scene, s, i, prompts)),
    })),
    flags: (project.agentFlags || []).filter((f) => !f.resolved),
    attempts: project.agentAttempts || {},
  };
}

// ------------------------------------------------------------------- tools
const str = (description) => ({ type: 'string', description });
const PROJECT = { projectId: str('Project id (from storyreel_list_projects).') };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

async function runStage({ projectId, stage, sceneId }) {
  const n = Number(stage);
  if (![1, 2, 3, 4].includes(n)) fail('BAD_INPUT', 'stage must be 1, 2, 3 or 4.');
  const keyErr = textKeyError(app().settings);
  if (keyErr) fail('NO_KEY', 'The text model API key is not set in StoryReel Settings.');
  const before = projectOf(projectId);
  const target = n === 4 && sceneId ? { sceneId, kind: 'shots' } : { stage: n };
  const attempt = countAttempt(projectId, target, n === 4 && sceneId ? 'The shot breakdown of this scene' : `Stage ${n}`);
  const scope = await openStage(projectId, n);
  if (n === 4) {
    if (!before.outline.length) fail('NOT_READY', 'Stage 3 has no scene outline yet.');
    if (sceneId) await scope.generateScene(sceneOf(before, sceneId).id);
    else await scope.generateAll();
  } else {
    if (n === 1 && !(before.logline || '').trim()) fail('NOT_READY', 'The project has no plot description (logline).');
    if (n === 2 && !(before.approvedPlot || '').trim()) fail('NOT_READY', 'No approved plot yet — pick an idea or set approvedPlot first.');
    if (n === 3 && !(before.storyline?.synopsis || '').trim()) fail('NOT_READY', 'Stage 2 has no storyline yet.');
    await scope.generate();
  }
  await settle();
  const err = agentScope(n === 5 ? 'assembly' : `stage${n}`)?.error;
  if (err) fail('GENERATION_FAILED', String(err));
  return { attempt, project: projectView(projectOf(projectId)) };
}

async function createPrompts({ projectId, sceneId, shotId, kind }) {
  const keyErr = textKeyError(app().settings);
  if (keyErr) fail('NO_KEY', 'The text model API key is not set in StoryReel Settings.');
  const project = projectOf(projectId);
  if (shotId) {
    if (!['image', 'video'].includes(kind)) fail('BAD_INPUT', 'kind must be "image" or "video" when shotId is given.');
    const { scene, shot } = findShot(project, shotId);
    const attempt = countAttempt(projectId, { shotId, kind: `${kind}Prompt` }, `The ${kind} prompt of this shot`);
    const bench = await openBench(projectId, scene.id, shotId);
    await bench.regenPrompt(shot, kind);
    await settle();
    const b = agentScope('bench');
    if (b?.imgErr?.id === shotId) fail('GENERATION_FAILED', String(b.imgErr.msg));
    const pr = projectOf(projectId).shotPrompts[shotId] || {};
    return { attempt, prompt: kind === 'image' ? pr.imagePrompt : pr.videoPrompt };
  }
  const scene = sceneOf(project, sceneId || fail('BAD_INPUT', 'Give sceneId (all prompts of a scene) or shotId + kind.'));
  if (!(project.sceneDetails[scene.id]?.shots || []).length) fail('NOT_READY', 'This scene has no shots yet (Stage 4).');
  const attempt = countAttempt(projectId, { sceneId: scene.id, kind: 'prompts' }, 'The prompts of this scene');
  const bench = await openBench(projectId, scene.id);
  await bench.createPrompts();
  await settle();
  const err = agentScope('bench')?.error;
  if (err) fail('GENERATION_FAILED', String(err));
  const fresh = projectOf(projectId);
  return { attempt, shots: (fresh.sceneDetails[scene.id]?.shots || []).map((s, i) => shotView(fresh, scene, s, i, true)) };
}

const MEDIA = {
  image: { map: 'shotImages', label: 'The first frame of this shot', run: (b, shot) => b.genImage(shot) },
  final_frame: { map: 'shotFinalImages', label: 'The final frame of this shot', run: (b, shot) => b.genFinalFrame(shot) },
  video: { map: 'shotVideos', label: 'The video of this shot', run: (b, shot, i) => b.genVideo(shot, i) },
  voice: { map: 'shotAudios', label: 'The voice of this shot', run: (b, shot, i) => b.genVoice(shot, i) },
};

async function createMedia({ projectId, shotId, kind }) {
  const spec = MEDIA[kind] || fail('BAD_INPUT', `kind must be one of: ${Object.keys(MEDIA).join(', ')}.`);
  const project = projectOf(projectId);
  const { scene, shot, index } = findShot(project, shotId);
  const pr = project.shotPrompts[shotId] || {};
  if (kind === 'image' && !(pr.imagePrompt || '').trim()) fail('NOT_READY', 'This shot has no image prompt yet.');
  if (kind === 'video' && !(pr.videoPrompt || '').trim()) fail('NOT_READY', 'This shot has no video prompt yet.');
  if ((kind === 'video' || kind === 'final_frame') && !has(project.shotImages, shotId)) fail('NOT_READY', 'Create and approve the first frame before this.');
  if (kind === 'voice' && !(shot.dialogue || '').trim()) fail('NOT_READY', 'This shot has no dialogue.');
  const attempt = countAttempt(projectId, { shotId, kind }, spec.label);
  const bench = await openBench(projectId, scene.id, shotId);
  await spec.run(bench, shot, index);
  await settle();
  // Each generator clears the workbench error when it starts and sets it when
  // it fails, so an error on this shot (or an alert, or no media) means failure.
  // The result itself is not compared with the previous one: a regeneration
  // may legitimately return an identical file.
  const b = agentScope('bench');
  const after = (projectOf(projectId)[spec.map] || {})[shotId] || null;
  const alerts = takeAgentAlerts().join(' ');
  if (b?.imgErr?.id === shotId) fail('GENERATION_FAILED', String(b.imgErr.msg));
  if (alerts) fail('GENERATION_FAILED', alerts);
  if (!after) fail('GENERATION_FAILED', 'Nothing was produced.');
  return { attempt, attemptsLeft: MAX_ATTEMPTS - attempt, created: kind, next: 'Call storyreel_review_shot to verify the result before going on.' };
}

async function reviewShot({ projectId, shotId, frames = 6, transcript = false }) {
  const project = projectOf(projectId);
  const { scene, shots, shot, index } = findShot(project, shotId);
  const images = [];
  const push = async (label, src) => {
    const img = await still(src);
    if (img) images.push({ label, dataURL: img });
  };
  const library = app().library || [];

  for (const c of shotCastRefs(project, shot, MAX_CHARACTER_REFS)) {
    await push(`REFERENCE — character "${c.name}"${c.group ? ` (member of "${c.group}")` : ''}: the person in the shot must look like this`, c.photo);
  }
  for (const g of shotLocationRefs(project, scene, shot.id)) {
    for (const [k, ph] of g.photos.slice(0, 2).entries()) await push(`REFERENCE — location "${g.name || scene.title}" (${k + 1})`, ph);
  }
  for (const aid of (project.shotAssets || {})[shot.id] || []) {
    const a = library.find((e) => e.id === aid && e.kind === 'asset');
    if (a?.photos?.[0]) await push(`REFERENCE — asset "${a.name}"`, a.photos[0]);
  }

  // what came just before this shot
  let prev = index > 0 ? shots[index - 1] : null;
  let prevWhere = 'previous shot of this scene';
  if (!prev) {
    const si = project.outline.indexOf(scene);
    const prevScene = si > 0 ? project.outline[si - 1] : null;
    const prevShots = prevScene ? project.sceneDetails[prevScene.id]?.shots || [] : [];
    prev = prevShots[prevShots.length - 1] || null;
    prevWhere = 'last shot of the previous scene';
  }
  if (prev) {
    const pv = (project.shotVideos || {})[prev.id];
    if (pv) {
      try {
        images.push({ label: `PREVIOUS — last video frame of the ${prevWhere} (action: ${prev.action})`, dataURL: await videoFrame(pv, 'last') });
      } catch {
        /* undecodable: fall through to its first frame */
      }
    }
    if (!images.some((x) => x.label.startsWith('PREVIOUS'))) await push(`PREVIOUS — first frame of the ${prevWhere} (action: ${prev.action})`, (project.shotImages || {})[prev.id]);
  }

  const first = (project.shotImages || {})[shot.id];
  const fin = (project.shotFinalImages || {})[shot.id];
  const video = (project.shotVideos || {})[shot.id];
  const voice = (project.shotAudios || {})[shot.id];
  // the layout's camera view: the composition the shot was planned with
  await push('INTENDED COMPOSITION — camera view of the 3D layout (block figures stand in for the characters; compare positions and facing, not looks)', layoutEnabled(project) ? sceneLayout(project, scene.id)?.shots?.[shot.id]?.view : null);
  await push('THIS SHOT — first frame', first);
  await push('THIS SHOT — final frame', fin);

  const slot = Number(shot.duration) || 0;
  const checks = { slotSec: slot, firstFrame: !!first, finalFrame: !!fin };
  if (video) {
    try {
      const sheet = await contactSheet(video, frames);
      images.push({ label: `THIS SHOT — video contact sheet: ${sheet.times.length} frames in order, numbered, with timestamps`, dataURL: sheet.image });
      checks.video = { durationSec: sheet.duration, width: sheet.width, height: sheet.height, shortBy: sheet.duration < slot - 0.25 ? Math.round((slot - sheet.duration) * 100) / 100 : 0 };
    } catch (e) {
      checks.video = { error: String(e.message || e) };
    }
    checks.videoSound = await audioReport(video);
  } else checks.video = null;
  if (voice) {
    const rep = await audioReport(voice);
    checks.voice = { ...rep, voiceOverrunsShot: rep.present && rep.duration > slot + 0.05 ? Math.round((rep.duration - slot) * 100) / 100 : 0 };
  } else checks.voice = null;

  if (transcript && (shot.dialogue || '').trim()) {
    const src = voice || (checks.videoSound?.present && !checks.videoSound.silent ? video : null);
    if (src) {
      try {
        const blob = await (await fetch(src)).blob();
        checks.transcript = { heard: await transcribeAudio(app().settings, blob), from: voice ? 'voice clip' : 'video sound' };
      } catch (e) {
        checks.transcript = { error: String(e.message || e) };
      }
    }
  }

  const pr = project.shotPrompts[shot.id] || {};
  return {
    shot: shotView(project, scene, shot, index, true),
    scene: { id: scene.id, title: scene.title, summary: scene.summary },
    expected: {
      action: shot.action,
      dialogue: shot.dialogue || null,
      voiceSource: (shot.dialogue || '').trim() ? voiceSourceFor(project, shot.id) : null,
      imagePrompt: pr.imagePrompt || '',
      videoPrompt: pr.videoPrompt || '',
      spatialLayout: describeShot(project, scene, shot.id) || null,
    },
    checks,
    attempts: Object.fromEntries(Object.entries(project.agentAttempts || {}).filter(([k]) => k.startsWith(`shot:${shot.id}:`))),
    openFlags: (project.agentFlags || []).filter((f) => !f.resolved && f.target?.shotId === shot.id),
    images,
  };
}

export const TOOLS = [
  {
    name: 'storyreel_guide',
    description: 'Read this first. The operating guide for StoryReel: the pipeline, the checks to run at every stage, how to fix failures, the four-attempt rule and the flag system.',
    inputSchema: schema({}),
    run: async () => ({ guide: GUIDE }),
  },
  {
    name: 'storyreel_status',
    description: 'What the app is doing now: version, the open project and stage, which generation services are configured (no keys are returned).',
    inputSchema: schema({}),
    run: async () => {
      const a = app();
      const s = a.settings;
      const ps = agentScope('project');
      return {
        version: a.version,
        openProject: ps ? { id: ps.id, stage: ps.view } : null,
        services: {
          text: (s.textService || 'claude') === 'gemini' ? 'gemini' : `claude (${s.model})`,
          textKeySet: !textKeyError(s),
          image: s.imageService === 'comfy' ? 'comfyui' : 'gemini',
          geminiKeySet: !!s.geminiKey,
          videoEngine: s.videoEngine,
          klingKeySet: !!s.klingKey,
        },
        contentPolicyActive: !!s.policyId,
        maxAttempts: MAX_ATTEMPTS,
      };
    },
  },
  {
    name: 'storyreel_list_projects',
    description: 'List the projects (not archived) with their stage and number of open flags.',
    inputSchema: schema({}),
    run: async () => ({
      projects: app()
        .projects.filter((p) => !p.archived)
        .map((p) => ({ id: p.id, title: p.title, stage: p.stage, scriptType: p.scriptType, scenes: p.outline.length, openFlags: (p.agentFlags || []).filter((f) => !f.resolved).length, updatedAt: p.updatedAt })),
    }),
  },
  {
    name: 'storyreel_create_project',
    description: 'Create a new project from an idea. scriptType: "short" (10–30 s), "medium" (1–4 min), "long" (5–10 min) or "series" (vertical short drama; give episodeCount). Returns the project id.',
    inputSchema: schema(
      {
        title: str('Working title.'),
        logline: str('The idea / brief plot description, in the language the film should be written in.'),
        scriptType: { type: 'string', enum: ['short', 'medium', 'long', 'series'] },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
        episodeCount: { type: 'integer', minimum: 1, maximum: 200 },
      },
      ['logline']
    ),
    run: async ({ title, logline, scriptType = 'medium', aspectRatio, episodeCount }) => {
      if (!(logline || '').trim()) fail('BAD_INPUT', 'logline is required.');
      const series = scriptType === 'series';
      const p = newProject({ title, logline: logline.trim(), scriptType, aspectRatio: aspectRatio || (series ? '9:16' : '16:9'), episodeCount, scriptStyleId: series ? SHORT_DRAMA_STYLE_ID : '' });
      app().addProjects([p]);
      await settle();
      return { projectId: p.id, next: 'storyreel_run_stage with stage 1.' };
    },
  },
  {
    name: 'storyreel_get_project',
    description: 'The whole project as text: plot, characters (with the number of reference photos), scenes, shots, what media each shot has, camera/dynamics settings, open flags and attempt counts. Set prompts=true to include each shot\'s image, video and voice prompts.',
    inputSchema: schema({ ...PROJECT, prompts: { type: 'boolean' } }, ['projectId']),
    run: async ({ projectId, prompts }) => projectView(projectOf(projectId), { prompts: !!prompts }),
  },
  {
    name: 'storyreel_update_project',
    description: 'Change project settings: title, genres, logline, approvedPlot, aspectRatio, and the three styles (scriptStyleId, imageStyleId, videoStyleId — ids from storyreel_list_styles, "" for none). Use it to choose the visual and video style that fit the story.',
    inputSchema: schema(
      {
        ...PROJECT,
        title: { type: 'string' },
        genres: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        logline: { type: 'string' },
        approvedPlot: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
        scriptStyleId: { type: 'string' },
        imageStyleId: { type: 'string' },
        videoStyleId: { type: 'string' },
      },
      ['projectId']
    ),
    run: async ({ projectId, ...patch }) => {
      projectOf(projectId);
      const styles = app().styles;
      for (const [key, cat] of [['scriptStyleId', 'script'], ['imageStyleId', 'image'], ['videoStyleId', 'video']]) {
        if (patch[key] && !(styles[cat] || []).some((s) => s.id === patch[key])) fail('BAD_INPUT', `${key}: no ${cat} style with id "${patch[key]}".`);
      }
      if (patch.genres) patch.genres = patch.genres.slice(0, 3);
      patchProject(projectId, patch);
      await settle();
      return { updated: Object.keys(patch) };
    },
  },
  {
    name: 'storyreel_list_styles',
    description: 'The style library: script styles (how the text is written), image styles (the look of every frame) and video styles (camera and motion character). Returns id, name and the style text.',
    inputSchema: schema({ category: { type: 'string', enum: ['script', 'image', 'video'] } }),
    run: async ({ category }) => {
      const styles = app().styles;
      const cats = category ? [category] : ['script', 'image', 'video'];
      return Object.fromEntries(cats.map((c) => [c, (styles[c] || []).map((s) => ({ id: s.id, name: s.name, text: s.instructions }))]));
    },
  },
  {
    name: 'storyreel_run_stage',
    description: 'Run a text stage with the app\'s own generator. 1 = four plot directions (then storyreel_pick_idea); 2 = storyline and characters (WARNING: replaces the cast and their reference photos); 3 = scene outline (for a series master: the series plan); 4 = shot breakdown, for one scene (sceneId) or every scene. Counts as an attempt. Returns the updated project.',
    inputSchema: schema({ ...PROJECT, stage: { type: 'integer', enum: [1, 2, 3, 4] }, sceneId: str('Stage 4 only: limit to this scene.') }, ['projectId', 'stage']),
    run: runStage,
  },
  {
    name: 'storyreel_pick_idea',
    description: 'Stage 1: choose one of the generated directions (index from storyreel_get_project → ideas) as the approved plot.',
    inputSchema: schema({ ...PROJECT, index: { type: 'integer', minimum: 0 } }, ['projectId', 'index']),
    run: async ({ projectId, index }) => {
      const p = projectOf(projectId);
      const idea = (p.ideas || [])[index] || fail('NOT_FOUND', `No idea at index ${index}.`);
      patchProject(projectId, (q) => ({ selectedIdeaId: idea.id, approvedPlot: idea.pitch, title: q.title === 'Untitled project' && idea.title ? idea.title : q.title }));
      await settle();
      return { approvedPlot: idea.pitch };
    },
  },
  {
    name: 'storyreel_edit_script',
    description: 'Edit the text of one scene (title, summary, durationSec) or one shot (durationSec 2–10, shotType, location, action, dialogue, notes) directly. For a change that must be applied consistently everywhere, use storyreel_smart_edit instead.',
    inputSchema: schema(
      {
        ...PROJECT,
        sceneId: { type: 'string' },
        shotId: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        durationSec: { type: 'number' },
        shotType: { type: 'string' },
        location: { type: 'string' },
        action: { type: 'string' },
        dialogue: { type: 'string' },
        notes: { type: 'string' },
      },
      ['projectId']
    ),
    run: async ({ projectId, sceneId, shotId, durationSec, ...f }) => {
      const p = projectOf(projectId);
      if (shotId) {
        const { scene } = findShot(p, shotId);
        const patch = {};
        for (const k of ['shotType', 'location', 'action', 'dialogue', 'notes']) if (typeof f[k] === 'string') patch[k] = f[k];
        if (durationSec != null) patch.duration = Math.max(2, Math.min(10, Math.round(Number(durationSec) * 2) / 2));
        patchProject(projectId, (q) => ({
          sceneDetails: { ...q.sceneDetails, [scene.id]: { ...q.sceneDetails[scene.id], shots: q.sceneDetails[scene.id].shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) } },
        }));
        await settle();
        return { updated: Object.keys(patch), note: 'Prompts and media already made for this shot are not changed; recreate them if the edit affects them.' };
      }
      const scene = sceneOf(p, sceneId || fail('BAD_INPUT', 'Give sceneId or shotId.'));
      const patch = {};
      if (typeof f.title === 'string') patch.title = f.title;
      if (typeof f.summary === 'string') patch.summary = f.summary;
      if (durationSec != null) patch.duration = Math.max(2, Math.round(Number(durationSec)));
      patchProject(projectId, (q) => ({ outline: q.outline.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)) }));
      await settle();
      return { updated: Object.keys(patch) };
    },
  },
  {
    name: 'storyreel_smart_edit',
    description: 'The app\'s smart edit: one plain-language instruction applied consistently across the whole project text — plot, synopsis, characters, scenes, shots and prompts (e.g. "rename Anna to Maria", "move the story to winter", "make the ending hopeful"). Does not touch images or videos. Counts as an attempt.',
    inputSchema: schema({ ...PROJECT, instruction: str('What to change, in plain language.') }, ['projectId', 'instruction']),
    run: async ({ projectId, instruction }) => {
      const a = app();
      if (textKeyError(a.settings)) fail('NO_KEY', 'The text model API key is not set in StoryReel Settings.');
      const p = projectOf(projectId);
      const attempt = countAttempt(projectId, { stage: 'smart_edit' }, 'Smart edit');
      const data = await generateJSON(a.settings, smartEditPrompt(p, String(instruction).trim(), a.lang));
      const { patch, count } = computeSmartPatch(projectOf(projectId), data);
      if (count > 0) patchProject(projectId, patch);
      await settle();
      return { attempt, fieldsChanged: count };
    },
  },
  {
    name: 'storyreel_create_prompts',
    description: 'Stage 5: write the image and video prompts. With sceneId — for every shot of the scene; with shotId and kind ("image" or "video") — rewrite that one prompt (uses the shot\'s current camera/dynamics settings). Counts as an attempt.',
    inputSchema: schema({ ...PROJECT, sceneId: { type: 'string' }, shotId: { type: 'string' }, kind: { type: 'string', enum: ['image', 'video'] } }, ['projectId']),
    run: createPrompts,
  },
  {
    name: 'storyreel_set_prompt',
    description: 'Stage 5: replace a shot\'s prompt with your own text (kind: "image", "video" or "voice"). Free — does not count as an attempt; the media made from it does.',
    inputSchema: schema({ ...PROJECT, shotId: { type: 'string' }, kind: { type: 'string', enum: ['image', 'video', 'voice'] }, text: { type: 'string' } }, ['projectId', 'shotId', 'kind', 'text']),
    run: async ({ projectId, shotId, kind, text }) => {
      findShot(projectOf(projectId), shotId);
      const key = { image: 'imagePrompt', video: 'videoPrompt', voice: 'voicePrompt' }[kind] || fail('BAD_INPUT', 'kind must be image, video or voice.');
      patchProject(projectId, (q) => ({ shotPrompts: { ...q.shotPrompts, [shotId]: { ...(q.shotPrompts[shotId] || {}), [key]: String(text) } } }));
      await settle();
      return { set: key };
    },
  },
  {
    name: 'storyreel_set_dynamics',
    description: `Stage 5: set a shot's camera (${CAMERA_LEVELS.join(', ')}) and/or dynamics (${ACTION_LEVELS.join(', ')}; how much everyone in frame moves). Pass "auto" to return to the value derived from the scene. Recreate the video prompt afterwards.`,
    inputSchema: schema({ ...PROJECT, shotId: { type: 'string' }, camera: { type: 'string', enum: [...CAMERA_LEVELS, 'auto'] }, dynamics: { type: 'string', enum: [...ACTION_LEVELS, 'auto'] } }, ['projectId', 'shotId']),
    run: async ({ projectId, shotId, camera, dynamics }) => {
      findShot(projectOf(projectId), shotId);
      const set = (map, levels, v) => {
        const next = { ...(map || {}) };
        if (v === 'auto') delete next[shotId];
        else next[shotId] = levels.indexOf(v);
        return next;
      };
      patchProject(projectId, (q) => ({
        ...(camera ? { shotCamera: set(q.shotCamera, CAMERA_LEVELS, camera) } : {}),
        ...(dynamics ? { shotAction: set(q.shotAction, ACTION_LEVELS, dynamics) } : {}),
      }));
      await settle();
      return { camera: camera || 'unchanged', dynamics: dynamics || 'unchanged', next: 'storyreel_create_prompts with shotId and kind "video".' };
    },
  },
  {
    name: 'storyreel_create_media',
    description: 'Stage 5: generate one piece of media for a shot — "image" (first frame), "final_frame", "video" (needs the first frame; can take many minutes) or "voice" (TTS for the shot\'s dialogue). Counts as an attempt; after four the target is flagged and further calls are refused. Verify the result with storyreel_review_shot.',
    inputSchema: schema({ ...PROJECT, shotId: { type: 'string' }, kind: { type: 'string', enum: Object.keys(MEDIA) } }, ['projectId', 'shotId', 'kind']),
    run: createMedia,
  },
  {
    name: 'storyreel_review_shot',
    description: 'Evidence for verifying a shot. Returns measured checks (video length vs the shot slot, sound cut off at the end, voice longer than the shot) and IMAGES to look at: reference photos of the characters named in the shot, location and asset references, the previous shot\'s last frame, this shot\'s first/final frame, and a numbered contact sheet of video frames. Judge likeness, continuity, environment and artifacts from the images. transcript=true also transcribes the speech (uses the Gemini key).',
    inputSchema: schema({ ...PROJECT, shotId: { type: 'string' }, frames: { type: 'integer', minimum: 2, maximum: 12 }, transcript: { type: 'boolean' } }, ['projectId', 'shotId']),
    run: reviewShot,
  },
  {
    name: 'storyreel_flag',
    description: `Record a problem for the human: something you could not fix or want them to see. Give exactly one of shotId, sceneId or stage. kind: ${FLAG_KINDS.join(', ')}.`,
    inputSchema: schema(
      { ...PROJECT, shotId: { type: 'string' }, sceneId: { type: 'string' }, stage: { type: 'integer', minimum: 1, maximum: 5 }, kind: { type: 'string', enum: FLAG_KINDS }, issue: str('What is wrong, concretely.'), note: str('What you tried.') },
      ['projectId', 'kind', 'issue']
    ),
    run: async ({ projectId, shotId, sceneId, stage, kind, issue, note }) => {
      const p = projectOf(projectId);
      if (!FLAG_KINDS.includes(kind)) fail('BAD_INPUT', `kind must be one of: ${FLAG_KINDS.join(', ')}.`);
      let target;
      if (shotId) target = { shotId, sceneId: findShot(p, shotId).scene.id };
      else if (sceneId) target = { sceneId: sceneOf(p, sceneId).id };
      else if (stage) target = { stage };
      else fail('BAD_INPUT', 'Give shotId, sceneId or stage.');
      const flag = addFlag(projectId, { target, kind, issue: String(issue), note: String(note || '') });
      await settle();
      return { flagId: flag.id };
    },
  },
  {
    name: 'storyreel_list_flags',
    description: 'The project\'s open flags (set resolved=true to include resolved ones) and the attempt counters.',
    inputSchema: schema({ ...PROJECT, resolved: { type: 'boolean' } }, ['projectId']),
    run: async ({ projectId, resolved }) => {
      const p = projectOf(projectId);
      return { flags: (p.agentFlags || []).filter((f) => resolved || !f.resolved), attempts: p.agentAttempts || {}, maxAttempts: MAX_ATTEMPTS };
    },
  },
  {
    name: 'storyreel_render',
    description: 'Stage 5: render the assembled timeline to a video file in the project output folder. Only when every shot has a video or an open flag.',
    inputSchema: schema({ ...PROJECT, force: { type: 'boolean', description: 'Render even though some shots have neither a video nor a flag.' } }, ['projectId']),
    run: async ({ projectId, force }) => {
      const p = projectOf(projectId);
      const missing = p.outline.flatMap((sc) => (p.sceneDetails[sc.id]?.shots || []).filter((s) => !has(p.shotVideos, s.id) && !(p.agentFlags || []).some((f) => !f.resolved && f.target?.shotId === s.id)).map((s) => s.id));
      if (missing.length && !force) fail('NOT_READY', `${missing.length} shot(s) have neither a video nor a flag: ${missing.slice(0, 8).join(', ')}.`);
      const assembly = await openStage(projectId, 5);
      if (!assembly.canRender) fail('NOT_READY', 'Rendering to a file needs the desktop app.');
      const res = await assembly.render();
      await settle();
      return { result: agentScope('assembly')?.lastToast || res || 'done' };
    },
  },
];

let running = null;

// Entry point: { ok: true, result } or { ok: false, error: { code, message } }.
export async function callAgent(method, params = {}) {
  const tool = TOOLS.find((t) => t.name === method);
  if (!tool) return { ok: false, error: { code: 'UNKNOWN_TOOL', message: `No tool named "${method}".` } };
  const readOnly = ['storyreel_guide', 'storyreel_status', 'storyreel_list_projects', 'storyreel_get_project', 'storyreel_list_styles', 'storyreel_list_flags'].includes(method);
  if (running && !readOnly) return { ok: false, error: { code: 'BUSY', message: `StoryReel is still running "${running}". Wait for it to finish.` } };
  if (!readOnly) running = method;
  try {
    const result = await inAgentCall(() => tool.run(params || {}));
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: { code: e.code || 'ERROR', message: e.message || String(e) } };
  } finally {
    if (!readOnly) running = null;
  }
}

export const toolList = () => TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
