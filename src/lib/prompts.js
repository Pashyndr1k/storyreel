import { dataURLToImageBlock } from './images.js';
import { aspectDescription } from './aspect.js';
import { buildRandomization } from './randomization.js';
import { densityRange, buildShotPayload } from './dynamics.js';

const LANG_NAMES = { en: 'English', ru: 'Russian', uk: 'Ukrainian' };

// Target duration per script type. Shots stay 2–10 seconds regardless of type.
const DURATIONS = {
  short: { min: 10, max: 30 },
  medium: { min: 60, max: 240 },
  long: { min: 300, max: 600 },
};
export const durationOf = (project) => DURATIONS[project?.scriptType] || DURATIONS.medium;

function withPhotos(photos, text) {
  return photos?.length
    ? [...photos.map(dataURLToImageBlock), { type: 'text', text }]
    : text;
}

function system(lang, custom) {
  const langName = LANG_NAMES[lang] || 'English';
  const base = `You are an award-winning screenwriter and director who specializes in short-form video: commercials, branded content and short films up to 10 minutes long. You think in concrete visual images, understand pacing, and write economically.

Rules:
- Respond with VALID JSON ONLY. No markdown, no code fences, no commentary outside the JSON.
- Follow the exact JSON schema given in the task.
- Write ALL creative content (titles, pitches, synopsis, character descriptions, dialogue, action descriptions, notes) in ${langName}, regardless of the language of the user's input.
- Character names must ALWAYS be written in English using Latin letters (transliterate if needed) — never in Cyrillic or any non-Latin script — so they stay consistent inside the English image and video prompts.
- The "image_prompt" and "video_prompt" fields must ALWAYS be written entirely in English — never in any other language.`;
  const extra = (custom || '').trim();
  return extra
    ? `${base}\n\nAdditional project-specific instructions (follow these, but never break the rules above):\n${extra}`
    : base;
}

function characterBlock(project) {
  const chars = project.storyline?.characters || [];
  return chars
    .map((c) => `- ${c.name} (${c.role}): ${c.description}`)
    .join('\n');
}

// Hard realizability rules for Stage-1 ideas: every pitched direction must be
// producible with AI video generation (discrete single-camera shots only).
const STAGE1_PRODUCTION_CONSTRAINTS = `PRODUCTION CONSTRAINTS (AI video generation limits — every pitched idea MUST be realizable within them):
- Do NOT propose sequences designed as a single continuous take ("oner", long unbroken tracking shots). Stories must break into discrete, cuttable shots.
- Do NOT propose split-screen, picture-in-picture, multi-panel or any layout showing more than one video frame at once.
- No single shot may run longer than 15 seconds — ideally 10 seconds or less. Plan action in short beats that cut well.
- Every shot is exactly one video frame captured by one camera — no composites, no simultaneous viewpoints, no in-shot montages.`;

// Default Stage-1 plot-generation persona, used when no randomization method
// supplies its own directorial persona.
const STAGE1_DEFAULT_PERSONA =
  "You are a fiercely original, award-winning indie film director and screenwriting partner. Your goal is to take the user's brief idea and pitch four distinct, compelling narrative directions optimized for a short film or commercial. Reject the first three ideas that come to mind. Avoid predictable twists, moral lessons, and neat resolutions.";

export function stage1Prompt(project, lang, scriptStyle, randomizationMethods) {
  const d = durationOf(project);
  // Plot Randomization Engine: composes extra system directives from the selection.
  const { systemAppend, overridesPersona, applied } = buildRandomization(randomizationMethods);
  const persona = overridesPersona ? '' : `\n\n${STAGE1_DEFAULT_PERSONA}`;
  return {
    // The concrete random picks, so the UI can annotate the generated ideas.
    applied,
    system: system(lang, scriptStyle) + `\n\n${STAGE1_PRODUCTION_CONSTRAINTS}` + persona + systemAppend,
    maxTokens: 2500,
    user: `Brief plot description for a short video (target length: ${d.min}–${d.max} seconds):

"""
${project.logline}
"""

Generate exactly 4 distinct directions for improving and developing this plot. Make them genuinely different from each other (different angle, tone, structure or twist) — not four variations of one idea. Each must stay faithful to the core of the original but make it stronger: clearer conflict, a more distinctive hook, a more satisfying ending.

JSON schema:
{"ideas":[{"title":"catchy working title","pitch":"the improved plot in 3-6 sentences","why_it_works":"1-2 sentences on why this version is stronger than the original"}]}`,
  };
}

export function stage2Prompt(project, lang, scriptStyle) {
  return {
    system: system(lang, scriptStyle),
    maxTokens: 3500,
    user: `Original plot description:
"""
${project.logline}
"""

Approved plot direction:
"""
${project.approvedPlot}
"""

Create the final storyline for this short video (target length: ${durationOf(project).min}–${durationOf(project).max} seconds).

JSON schema:
{"title":"a strong final title","genres":["2-3 short genre tags, e.g. drama, comedy, thriller"],"synopsis":"a complete story summary of 150-300 words with a clear beginning, middle and end","characters":[{"name":"character name","role":"protagonist / antagonist / supporting","description":"2-4 sentences: age, physical appearance (specific enough to keep the character visually consistent across AI image generation), personality, motivation"}]}`,
  };
}

export function stage3Prompt(project, lang, scriptStyle) {
  return {
    system: system(lang, scriptStyle),
    maxTokens: 4500,
    user: `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Synopsis:
"""
${project.storyline?.synopsis || ''}
"""

Characters:
${characterBlock(project)}

Create a scene-by-scene outline for this short video. The full video must run between ${durationOf(project).min} and ${durationOf(project).max} seconds in total — choose a number of scenes appropriate for that length (a 10–30 second ad may need only 2–4 scenes; a 5–10 minute film may need 6–14). Each scene must be a single continuous location and moment.

Alongside the outline, create the ACTION DYNAMICS PLAN — the film's pacing schedule. Derive it from the synopsis's emotional arc and the script style: where the story breathes, where it accelerates, where dialogue crowds in and where silence carries the weight. Rules for the plan:
- Divide the full runtime into 2–6 sequential "rhythm_blocks". Each block covers one or more consecutive scenes (list their numbers in "scene_numbers"; every scene belongs to exactly one block).
- "timestamp_start" and "intended_duration_sec" must be consistent with the scene durations they cover.
- "kinetic_energy_level" (1–10): how much physical motion is on screen (1 = static contemplation, 10 = hyper-kinetic chaos).
- "dialogue_volume" (1–10): how dense speech and sound are (1 = silence, 10 = rapid overlapping dialogue).
- "shot_density": "low" (long 5–10s shots), "medium" (3.5–6s), "high" (2.5–4s) or "hyper_kinetic" (2–3s) — how fast the editing should cut inside this block.
- "required_camera_momentum": a short snake_case camera behavior contract, e.g. "slow_creeping", "steady_tracking", "locked_off_stillness", "erratic_handheld", "sweeping_orbital".
- "global_pacing_curve": one of "flat", "accelerating", "decelerating", "wave", "front_loaded" — the overall shape of energy over time.
- The plan must MEAN something: contrast blocks against each other; a climax block should read differently from an opening block.

JSON schema:
{"scenes":[{"number":1,"title":"short scene title","summary":"2-3 sentences describing exactly what happens in the scene","duration_sec":20}],"dynamics_plan":{"genre_baseline":"snake_case dominant genre","global_pacing_curve":"accelerating","rhythm_blocks":[{"block_id":"blk_01","timestamp_start":0,"intended_duration_sec":15,"scene_numbers":[1,2],"kinetic_energy_level":2,"dialogue_volume":1,"shot_density":"low","required_camera_momentum":"slow_creeping"}]}}`,
  };
}

export function stage4Prompt(project, scene, lang, scriptStyle, block) {
  const outlineList = project.outline
    .map((s, i) => `${i + 1}. ${s.title} — ${s.summary} (~${s.duration}s)`)
    .join('\n');
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Match the locations, lighting and mood in your shot descriptions to these photos.`
    : '';
  // Action Dynamics Plan: the scene's rhythm block mathematically constrains
  // shot lengths and dictates motion/dialogue density and camera behavior.
  const range = block ? densityRange(block) : { min: 2, max: 10 };
  const dynNote = block
    ? `\n\nACTION DYNAMICS (this scene belongs to rhythm block "${block.block_id}" — these constraints are mandatory):
- Kinetic energy ${block.kinetic_energy_level}/10: ${block.kinetic_energy_level >= 6 ? 'stage visible physical motion in almost every shot; actions overlap and interrupt' : 'keep physical action restrained and deliberate; let stillness carry tension'}.
- Dialogue volume ${block.dialogue_volume}/10: ${block.dialogue_volume >= 6 ? 'dialogue-dense — most shots carry spoken lines, quick exchanges' : 'sparse speech — prefer silence, single lines, ambient sound'}.
- Shot density "${block.shot_density}": every shot MUST last between ${range.min} and ${range.max} seconds.
- Camera momentum contract: "${block.required_camera_momentum.replace(/_/g, ' ')}" — reflect it in shot types and notes.`
    : '';
  return {
    system: system(lang, scriptStyle),
    maxTokens: 5000,
    user: withPhotos(scene.photos, `Title: ${project.title}

Synopsis:
"""
${project.storyline?.synopsis || ''}
"""

Characters:
${characterBlock(project)}

Full scene outline:
${outlineList}

Now break down SCENE ${scene.number}: "${scene.title}" (${scene.summary}) into individual camera shots.

Requirements:
- Each shot lasts between ${range.min} and ${range.max} seconds.
- Shot durations must add up to roughly the scene's target duration (${scene.duration} seconds).
- "action" must describe precisely what the characters do and what the camera sees — concrete and filmable, no abstractions.
- "dialogue" contains the spoken lines prefixed by the speaker's name, or an empty string if the shot has no dialogue.
- "location" is the specific place plus time of day / lighting condition.

JSON schema:
{"shots":[{"duration_sec":4,"shot_type":"wide / medium / close-up / POV / tracking / etc.","location":"specific location, time of day","action":"what happens and what the camera sees","dialogue":"NAME: line — or empty string","notes":"mood, lighting, sound or continuity note — may be empty"}]}` + dynNote + envNote),
  };
}

function stage5ShotList(shots) {
  return shots.map((s, i) => ({
    shot: i + 1,
    duration_sec: s.duration,
    shot_type: s.shotType,
    location: s.location,
    action: s.action,
    dialogue: s.dialogue,
    notes: s.notes,
  }));
}

// Continuity rules for the image-prompt writer, mirroring the Video Motion
// instruction's CRITICAL RULE 3: consecutive first frames inside one scene must
// chain — each frame freezes the momentum carried over from the previous
// shot's end, never a reset to a neutral pose.
const FRAME_CONTINUITY_SYSTEM = `

FRAME CONTINUITY (STATE TRACKING): The shots of a scene form one continuous, real-time flow, and every first frame you describe seeds an image-to-video clip. Each shot's first frame must carry over the physical momentum, velocity and posture established at the END of the previous shot in the list:
- The Inertia Law: if a character was walking, running, falling or mid-gesture at the end of the previous shot, this shot's first frame MUST catch them still in that motion — frozen mid-stride, mid-turn, mid-reach — never reset to a neutral standing pose between shots.
- Match on action: place them as the direct continuation of the previous shot's end state — same position in space, same direction of travel, same posture, same held props.
- Motion-freeze vocabulary: anchor the frozen instant with phrases like "frozen mid-stride", "caught mid-turn", "hand still raised", "coat still swinging from the turn".
- Break the carried momentum ONLY when the shot's action explicitly stops it (they halt, sit down, or the moment jumps in time).
- For the FIRST shot of the scene, derive the entry state from its own action: if the action implies arriving or moving, the character enters the frame already in motion.`;

// Stage 5 runs as TWO separate calls per scene: image prompts (first frames,
// full static detail) and video prompts (motion only, via the Video Motion
// instruction below) — one call could never satisfy both rule sets at once.
export function stage5Prompt(project, scene, shots, lang, imageStyle) {
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Ground the image prompts in what these photos show: architecture, interior details, colors, lighting and atmosphere.`
    : '';
  const img = (imageStyle || '').trim();
  const ratio = project.aspectRatio || '16:9';
  const aspectNote = `\n\nASPECT RATIO — every "image_prompt" MUST explicitly state the framing as ${aspectDescription(ratio)} (${ratio}), and compose for that frame. The scene must FILL the whole frame edge to edge (100% of the canvas) — never describe or imply black bars, letterboxing, borders or empty margins at the edges.`;
  const styleNote = img ? `\n\nVISUAL STYLE — bake this into EVERY "image_prompt": ${img}` : '';
  return {
    system: system(lang) + FRAME_CONTINUITY_SYSTEM,
    maxTokens: 6000,
    user: withPhotos(scene.photos, `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Characters (repeat their key physical details in EVERY prompt where they appear, so the generated images stay visually consistent):
${characterBlock(project)}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}

Shots of this scene:
${JSON.stringify(stage5ShotList(shots), null, 2)}

For EVERY shot above, write one "image_prompt" — a detailed English prompt for the Nano Banana image generation model to create the FIRST FRAME of the shot.

FIRST FRAME TIMING — this is the most important rule. Each shot's "action" field describes everything that happens ACROSS the shot's full duration. The first frame is the state of the scene at second zero, BEFORE that action has started to unfold. Do NOT depict the midpoint, the climax or the result of the action. Freeze the INITIAL state: where each character is, their pose, gesture and expression at the instant the shot begins. If the action ends somewhere else than it starts, show where it STARTS. Example: for the action "Anna crosses the room and picks up the phone", the first frame shows Anna at her starting position at the far side of the room, the phone still lying untouched — not Anna halfway across the room and not Anna holding the phone. That instant is still governed by your FRAME CONTINUITY rules: if the previous shot ended with Anna already walking, she is frozen mid-stride at that starting position, not standing neutrally.

In each prompt describe: that initial-state subject staging, each visible character with their consistent physical details, the environment, lighting, camera angle and lens (e.g. 35mm, shallow depth of field), composition, and an overall cinematic style. Write it as one dense paragraph, no lists.

JSON schema:
{"prompts":[{"shot":1,"image_prompt":"..."}]}

Return exactly one entry per shot, in order.` + aspectNote + styleNote + envNote),
  };
}

// Default directorial style substituted into {{VIDEO_STYLE_INJECTION}} when the
// project has no video style selected (or the user clears it).
export const DEFAULT_VIDEO_MOTION_STYLE =
  'Naturalistic cinematic motion: smooth, motivated camera movement (subtle push-ins, gentle pans, stable handheld only when the action calls for it), grounded physical acting with realistic weight and restrained gestures, organic beats of stillness where the emotion requires them, and quiet natural ambience.';

// Video Motion Prompt System Instruction (verbatim). {{VIDEO_STYLE_INJECTION}}
// receives the selected video style's instructions (or DEFAULT_VIDEO_MOTION_STYLE);
// {{PREVIOUS_SHOT_MOMENTUM}} receives the continuity source description — all
// shots of a scene are written in one call, so each shot chains to the one
// directly above it in the list.
const VIDEO_MOTION_SYSTEM = `You are an expert AI cinematic director writing image-to-video motion prompts for the LTX-2 model. The model receives an exact starting frame — your prompt tells it only WHAT HAPPENS NEXT. Write like a cinematographer describing a shot, not like a poet describing a feeling.

CRITICAL RULE 1 (THE FRAME ALREADY EXISTS): Never describe static visual elements — no character descriptions (no appearance, age, wardrobe, hair, features), no lighting, no environment, no color or scene-setting. The starting frame provides all of that; repeating it makes the model morph, hallucinate, or drift. Refer to people ONLY by neutral visual handles ("the woman", "the taller man", "the soldier on the left") — never by name and never with appearance detail. Describe only the transition from stillness to motion.

CRITICAL RULE 2 (DIRECTORIAL STYLE): Express the following camera physics, motion texture and pacing throughout the prompt: "{{VIDEO_STYLE_INJECTION}}". Translate it into concrete on-screen motion — never quote style words as abstract labels.

CRITICAL RULE 3 (CONTINUITY & STATE TRACKING): This shot is part of a continuous, real-time scene. Strictly maintain the physical momentum, velocity, and posture established in the previous shot: "{{PREVIOUS_SHOT_MOMENTUM}}".
- The Inertia Law: if a character is walking, running, or falling in the previous shot, they MUST continue doing so in this shot unless the script explicitly stops them.
- "Match on Action": open the motion by carrying over the established movement (e.g., "Continuing her brisk walk...", "Still sprinting...").
- Never reset characters to a neutral standing pose between cuts unless commanded.

STRUCTURE — write ONE flowing paragraph, in present tense, in this order:
1. MAIN ACTION first: a single opening sentence stating the primary action of the shot. This anchors the generation before anything else competes for attention.
2. MOTION DETAIL: unfold the action chronologically, in the exact order it appears on screen, using progressive language ("begins", "then", "as"). Be literal and physical — describe weight shifts, gestures, head turns, posture; never internal states ("nervous") — show them through the body ("her fingers drum against her thigh").
3. CAMERA: one primary camera behavior, described relative to the subject in plain cinematographic language ("the camera pushes in slowly", "handheld tracking from behind", "static frame"). It may evolve once across the shot, never two behaviors at the same time.
4. AUDIO last: one short sentence of ambient sound and effects that belong to the action ("Audio: wind over the field, distant thunder, boots on gravel."). No speech — these shots carry no dialogue.

HARD CONSTRAINTS:
- Match density to length: about one main action per 2–3 seconds of video. Short shots get ONE action; only long shots earn two or three, in sequence. But do not underwrite a long shot — a starved prompt makes the model rush or drift.
- Under 150 words. Every word must be renderable — a movement, a direction, a material, a sound.
- No numbers: no timestamps, no seconds, no framerates, no angles, no counts. Use natural beats instead ("a long pause", "after a beat").
- No conflicting signals: one subject focus, one speed (never fast action AND slow motion), one camera logic.
- Never mention readable text, signs or logos; avoid chaotic multi-object physics (throws, juggling, shattering).

Example output (assuming a 'Dramatic Film' style injection):
"The woman rises from the trench floor and takes two slow steps toward the parapet, her weight heavy against the wind. Continuing the turn begun as she stands, she lifts her chin, and her gaze settles on the smoke line at the horizon; a long pregnant pause holds while her hand closes around the strap across her chest. The camera pushes in slowly from behind her shoulder, keeping her centered as the movement ends. Audio: low wind, distant artillery rumble, cloth flapping softly."`;

// All shots of a scene are written in one request, so the "previous shot" for
// continuity is the preceding entry in the same list — the model chains its
// own outputs. The first shot of the scene derives its entry momentum from its
// own action description.
const MOMENTUM_SOURCE =
  "the ending motion state of the immediately preceding shot in the provided shot list, as established by that shot's action and your own previous video_prompt; for the FIRST shot of the scene, derive the entry momentum from its own action description (if the action implies the character is already moving, they enter the shot mid-motion)";

export function stage5VideoPrompt(project, scene, shots, videoStyle, block) {
  const injection = (videoStyle || '').trim() || DEFAULT_VIDEO_MOTION_STYLE;
  // Action Dynamics Plan: attach each shot's dynamics payload so the written
  // prompts directly cite their assigned kinetic/dialogue/camera parameters.
  // Durations and trim mechanics stay OUT of the payload text — the video
  // model must never see "generate exactly N seconds" or editing explanations.
  const shotList = stage5ShotList(shots).map((s, i) => {
    const payload = buildShotPayload(shots[i], block || null);
    return {
      ...s,
      ...(payload.applied_dynamics ? { applied_dynamics: payload.applied_dynamics } : {}),
      ...(payload.prompt_injection_string ? { generation_directive: payload.prompt_injection_string } : {}),
    };
  });
  const dynNote = block
    ? `\n- This scene's rhythm block is "${block.block_id}" (kinetic energy ${block.kinetic_energy_level}/10, camera momentum "${block.required_camera_momentum.replace(/_/g, ' ')}"). EXPRESS these dynamics through the described motion itself — the intensity and speed of physical action matching the kinetic energy, and camera behavior honoring the momentum contract — without ever quoting the numbers or labels in the prompt text.`
    : '';
  return {
    system:
      VIDEO_MOTION_SYSTEM.replace('{{VIDEO_STYLE_INJECTION}}', injection).replace(
        '{{PREVIOUS_SHOT_MOMENTUM}}',
        block
          ? `${MOMENTUM_SOURCE}. The whole scene additionally carries the rhythm block's camera momentum contract: "${block.required_camera_momentum.replace(/_/g, ' ')}"`
          : MOMENTUM_SOURCE
      ) +
      `\n\nResponse format:
- Respond with VALID JSON ONLY. No markdown, no code fences, no commentary outside the JSON.
- Every "video_prompt" must be written entirely in English; character names always in Latin letters.`,
    maxTokens: 6000,
    user: `Scene ${scene.number}: "${scene.title}" — ${scene.summary}

Shots of this scene (each has an exact duration in seconds — map the motion, dialogue and pauses chronologically within it):
${JSON.stringify(shotList, null, 2)}

For EVERY shot above, write one "video_prompt" motion prompt following your system instruction. The starting frame of each shot already exists — describe only how it changes over the shot's duration. Write the prompts in order, carrying each shot's ending momentum into the next per CRITICAL RULE 3.

Additional rules:
- DIALOGUE SHOTS ARE THE EXCEPTION — this rule OVERRIDES all rules below it. When a shot's "dialogue" is non-empty, its video is generated by a sound+image model that derives the emotion, lip sync, pacing and detail from the shot's voice audio and first frame, so its "video_prompt" must be CONCISE: one or two short sentences that only name the subject's core action (including that they are speaking) and the camera movement, using a neutral handle ("the woman", "the old man") — never a name, never appearance detail. Format: "Core Actions: <subject does what, speaking>. The camera <movement>." No dynamics citations, no generation_directive text, no long visual detail for these shots.
- When a shot has a "generation_directive", TRANSLATE its energy level and camera-momentum contract into concrete on-screen motion and camera language woven through the prompt — never paste the directive text itself; every sentence must describe something the camera physically sees.
- Let the shot's core action land in the middle of the clip — never at the very first or very last second.
- NEVER state the clip's total duration in seconds inside a "video_prompt", and never mention trimming, padding, final cuts or any editing mechanics — the video model must only see the motion itself.
- FINAL CHECK per prompt: no character descriptions or names, no static scene description, chronological order, one camera logic, ambient audio sentence at the end.${dynNote}

JSON schema:
{"prompts":[{"shot":1,"video_prompt":"..."}]}

Return exactly one entry per shot, in order.`,
  };
}

// Stage 5 audio prompts: one per shot, written for an EXTERNAL audio-generation
// model. Each prompt maps the shot's sound chronologically — every spoken line
// verbatim with precise in-shot timing and delivery directions, plus pauses and
// essential ambience/effects. Stage 6's voice-over script window aggregates
// these across the whole film.
export function stage5AudioPrompt(project, scene, shots, block) {
  const chars = (project.storyline?.characters || [])
    .map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}: ${c.description || ''}`)
    .join('\n');
  const shotList = shots.map((s, i) => ({
    shot: i + 1,
    duration_sec: s.duration,
    action: s.action,
    dialogue: s.dialogue,
    notes: s.notes,
  }));
  const rhythmNote = block
    ? `\nThis scene's dialogue rhythm target: dialogue volume ${block.dialogue_volume}/10 — pace the lines and pauses accordingly.`
    : '';
  return {
    system: `You are a dialogue director and sound designer preparing per-shot audio prompts for an external AI audio-generation model.

Rules:
- Respond with VALID JSON ONLY. No markdown, no code fences, no commentary outside the JSON.
- Every "audio_prompt" is written in English, EXCEPT the characters' spoken lines, which are kept VERBATIM in their original language inside double quotes.
- MANDATORY: for every shot whose "dialogue" field is non-empty, the "audio_prompt" MUST reproduce each spoken line WORD FOR WORD (verbatim, in its original language) inside double quotes. Never omit, shorten, paraphrase, translate or merely summarise a spoken line — the exact words must appear.
- Map each shot's audio chronologically with precise timings inside the shot (start–end in seconds, e.g. 0.4s–2.1s): every spoken line (speaker name, the exact line, delivery/tone), meaningful pauses, and essential ambient sound or effects.
- Voice directions must be concrete: approximate age, gender, energy, emotional tone, pacing.
- Timings must fit within the shot's duration and follow the action's chronology.
- A shot with no dialogue still gets an "audio_prompt" describing its ambience and effects with timings.
- Character names always in Latin letters.`,
    maxTokens: 5000,
    user: `Characters:
${chars || '—'}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}${rhythmNote}

Shots of this scene:
${JSON.stringify(shotList, null, 2)}

Write one "audio_prompt" per shot.

JSON schema:
{"prompts":[{"shot":1,"audio_prompt":"0.0s–1.2s: ..."}]}

Return exactly one entry per shot, in order.`,
  };
}

// Stage 6 "Smart cut": Claude acts as a film editor re-cutting the assembled
// timeline per a plain-language instruction ("more dynamic", "slow down
// scene 2"). It may change shot durations and the transitions between shots;
// the total runtime is free to change. Shots whose voice audio is already
// generated are duration-locked (their speech is timed to the shot), and
// shots whose new duration would exceed the generated material are reported
// for regeneration instead of silently degrading.
export function stage6SmartCutPrompt(project, rows, instruction, allowedTransitions, lang) {
  return {
    system: `You are a professional film editor re-cutting an assembled timeline. You adjust PACING and RHYTHM by changing per-shot durations and the transitions between shots.

Editing rules:
- Durations are seconds between 2 and 10, at most one decimal. Shorter shots and harder cuts read faster and more dynamic; longer shots and softer transitions read calmer. Vary rhythm — do not set every shot to the same length.
- Respect each shot's "material_sec" (the generated footage available): a duration may exceed it only when the pacing truly demands it — then ALSO list that shot in "regenerate" with the seconds needed, so the user can regenerate longer footage.
- NEVER change the duration of shots marked "voice_locked": their speech is timed to the shot. You may still change their transitions.
- "transition" must be one of: ${allowedTransitions.join(', ')}, or "auto" (let the dynamics matrix decide). Hard cuts (smash_cut, match_action_cut) accelerate; dissolves and dips slow down and breathe.
- Follow the user's SCOPE: if they name specific scenes or shots, change ONLY those; otherwise treat the whole film. The total runtime may change freely.
- Only include shots you actually change. Keep the edit purposeful — a rhythm, not noise.
- "notes": 1-3 short sentences (${lang === 'ru' ? 'in Russian' : lang === 'uk' ? 'in Ukrainian' : 'in English'}) explaining the editorial intent of your cut.

Respond with VALID JSON ONLY. No markdown, no commentary.`,
    maxTokens: 4000,
    user: `Film: "${project.title}"

Timeline (in order):
${JSON.stringify(rows, null, 2)}

User instruction:
"""
${instruction}
"""

JSON schema:
{"shots":[{"shot":3,"duration":4.5,"transition":"smash_cut"}],"regenerate":[{"shot":5,"needed_sec":7,"reason":"..."}],"notes":"..."}`,
  };
}

// "Tweak this": rewrite an existing generation prompt per a plain-language
// adjustment ("make it more cinematic and moody") without the user touching
// the technical jargon. Everything unrelated must survive verbatim.
export function tweakPromptSpec(kind, currentPrompt, instruction) {
  const what =
    kind === 'video'
      ? 'video MOTION prompt for an image-to-video model'
      : 'image generation prompt (Nano Banana / Flux)';
  return {
    system: `You are a senior prompt engineer for AI ${kind === 'video' ? 'video' : 'image'} generation. You revise existing production prompts surgically.

Rules:
- Respond with VALID JSON ONLY. No markdown, no commentary.
- The rewritten prompt stays entirely in English; character names stay in Latin letters.
- Apply the user's adjustment CONSISTENTLY across the whole prompt (lighting, mood, color, lens language — wherever it logically reaches), translating their plain words into proper technical prompt vocabulary.
- Preserve everything the adjustment does not touch: subjects, composition, aspect-ratio statements, verbatim directives, camera/momentum contracts, timing beats and structure.
- Keep roughly the same length and format as the original.`,
    maxTokens: 3000,
    user: `Current ${what}:
"""
${currentPrompt}
"""

User adjustment (plain language):
"""
${instruction}
"""

Rewrite the prompt with the adjustment applied.

JSON schema:
{"prompt":"..."}`,
  };
}

// Stage 5 voice generation: Claude acts as a voice director preparing the
// input for the local OmniVoice TTS workflow (TTS Audio Suite in ComfyUI).
// OmniVoice designs the voice reference-free from a tag instruction (gender,
// age, pitch, style, accent — matched to the speaking character), and the
// speech is delivered as SRT subtitle blocks whose timestamps the engine hits
// natively — so line placement inside the shot is frame-accurate and can be
// synced to the action's beats. Emotions come from the SCENE CONTEXT first;
// the Action Dynamics block is the fallback when the context is ambiguous.
const OMNIVOICE_DESIGN_MENU = `Voice-design tags (pick ONE value per slot; join the chosen values with ", " IN THIS ORDER into "voice_instruct"):
- gender: "male" | "female"
- age: "child" | "teenager" | "young adult" | "middle-aged" | "elderly"
- pitch: "very low pitch" | "low pitch" | "moderate pitch" | "high pitch" | "very high pitch"
- style (OPTIONAL — include only when the scene demands it): "whisper"
- accent (OPTIONAL — only when it fits the character or setting): "american accent" | "british accent" | "australian accent" | "canadian accent" | "indian accent" | "chinese accent" | "korean accent" | "japanese accent" | "portuguese accent" | "russian accent"
Example: "female, young adult, moderate pitch, british accent"`;

const OMNIVOICE_NONVERBAL = `Non-verbal tags allowed INLINE in the subtitle text (angle brackets, exactly these): <laughter> <sigh> <confirmation-en> <question-en> <question-ah> <question-oh> <question-ei> <question-yi> <surprise-ah> <surprise-oh> <surprise-wa> <surprise-yo> <dissatisfaction-hnn>. Use at most one or two, and only where the emotion truly calls for it.`;

// Real cloned-voice library (voices_examples with reference transcripts):
// cloning one of these gives a far more stable, natural character voice than
// tag design alone. Keep tag/file strings in sync with VOICE_LIBRARY in
// comfy.js.
const OMNIVOICE_LIBRARY_MENU = `Voice LIBRARY (real voices the engine can CLONE — preferred over pure design):
- file "voices_examples/Clint_Eastwood CC3 (enhanced2).wav", tag [Clint_Eastwood CC3 (enhanced2)] — elderly male, dry, gravelly, weathered
- file "voices_examples/David_Attenborough CC3.wav", tag [David_Attenborough CC3] — elderly male, refined, gentle, documentary narrator
- file "voices_examples/Morgan_Freeman CC3.wav", tag [Morgan_Freeman CC3] — mature male, deep, warm, calm authority
- file "voices_examples/Sophie_Anderson CC3.wav", tag [Sophie_Anderson CC3] — adult female, warm, expressive
- file "voices_examples/female/female_01.wav", tag [female_01] — adult female, neutral, clear
- file "voices_examples/female/female_02.wav", tag [female_02] — young female, bright, energetic
- file "voices_examples/male/male_01.wav", tag [male_01] — adult male, neutral, even
- file "voices_examples/male/male_02.wav", tag [male_02] — adult male, deeper, firm`;

export function stage5VoicePrompt(project, scene, shot, block, lang) {
  const chars = (project.storyline?.characters || [])
    .map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}: ${c.description || ''}`)
    .join('\n');
  const shots = project.sceneDetails[scene.id]?.shots || [];
  const idx = shots.findIndex((s) => s.id === shot.id);
  const neighbor = (s) => (s ? `action: ${s.action}${s.dialogue ? ` | dialogue: ${s.dialogue}` : ''}` : '—');
  const dynNote = block
    ? `\nAction Dynamics block (FALLBACK emotion source when the scene context is ambiguous): kinetic energy ${block.kinetic_energy_level}/10, dialogue volume ${block.dialogue_volume}/10, camera momentum "${block.required_camera_momentum.replace(/_/g, ' ')}". High energy → brisk delivery, lines packed closer; low energy → restraint, longer silences between lines.`
    : '';
  return {
    system: `You are a film voice director preparing the input for OmniVoice TTS (TTS Audio Suite running in ComfyUI). Your output drives a real text-to-speech engine: every word in the SRT text WILL BE SPOKEN ALOUD, and every timestamp WILL BE HIT — the engine natively targets each subtitle's duration.

"narrator_voice" — CAST the speaking character from the voice library:
${OMNIVOICE_LIBRARY_MENU}
Pick the library voice whose gender, age and character best match the SPEAKING character's description and personality. CONSISTENCY IS CRITICAL: the same character must get the SAME library voice in every shot of the film — derive the choice from the character, never from the shot. Use "none" only when no library voice fits at all (then the design tags below fully define the voice).
If SEVERAL characters speak in the shot: set "narrator_voice" to the dominant speaker's voice, and prefix each SRT block spoken by ANOTHER character with that character's voice tag from the menu (e.g. "[male_01] Line…") — tagged blocks switch to that cloned voice, untagged blocks use the narrator.

"voice_instruct" — design tags that refine the voice (with a cloned narrator they act as light guidance; with "none" they fully define the voice):
${OMNIVOICE_DESIGN_MENU}
Derive gender and age from the character's description; derive pitch and style from their personality and the scene's emotional state (e.g. a hardened commander → low pitch; a frightened child → high pitch; an intimate or secretive moment → add "whisper").

"srt_text" — the speech, as VALID SRT:
- Numbered blocks: index line, then "HH:MM:SS,mmm --> HH:MM:SS,mmm", then the text line(s), separated by blank lines.
- ALL timestamps must fit inside the shot's duration. Start the first line no earlier than 00:00:00,300 and end the last one at least 0.2s before the shot ends.
- TIME EACH LINE TO THE SHOT'S EVENTS: read the action description and place every line at the exact moment it should be heard (a line answered after a beat starts later; words spoken mid-movement sit where the movement happens). Give each block a realistic duration for its word count — roughly 2.5 words per second; never cram.
- Silence between blocks IS the pause — shape the rhythm with the gaps, do not write pause markers.
- Include ONLY words the characters actually speak, verbatim from the script's dialogue, in its original language — never scene descriptions or stage directions.
- ${OMNIVOICE_NONVERBAL}
- Square brackets [] are RESERVED for the library voice tags shown above — use them ONLY as a block's leading speaker tag in multi-speaker shots, with the exact tag strings from the menu. Never invent other bracketed tags (no [CharacterName], no [pause] markers).
- Shape intonation with punctuation: ellipses … for hesitation, exclamation marks for energy, commas for breath, question marks for the natural rise.

Respond with VALID JSON ONLY. No markdown, no commentary.`,
    maxTokens: 2000,
    user: `Characters:
${chars || '—'}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}${dynNote}

Previous shot: ${neighbor(shots[idx - 1])}
THIS SHOT (duration ${shot.duration}s): action: ${shot.action}
Dialogue to speak (verbatim source): ${shot.dialogue}
Next shot: ${neighbor(shots[idx + 1])}

Write the OmniVoice input for THIS shot's dialogue. All SRT timestamps must stay inside 0–${shot.duration} seconds, timed to the action's beats.

JSON schema:
{"srt_text":"1\\n00:00:00,400 --> 00:00:02,600\\nLine…\\n\\n2\\n…","narrator_voice":"voices_examples/female/female_01.wav","voice_instruct":"female, young adult, moderate pitch"}`,
  };
}

// Stage 5 voice generation, Gemini TTS variant: Claude writes ONE controllable
// TTS prompt following Google's official prompting guide — an Audio Profile /
// Scene / Director's Notes header (layered style adjectives, a specific
// regional accent when it fits, explicit pacing) followed by the transcript
// with inline English audio tags — and CASTS 1-2 prebuilt Gemini voices.
// Keep the voice menu in sync with GEMINI_VOICES in gemini.js.
const GEMINI_VOICE_MENU = `Prebuilt Gemini voices (name — gender, documented style):
Zephyr — female, bright · Puck — male, upbeat · Charon — male, informative · Kore — female, firm · Fenrir — male, excitable · Leda — female, youthful · Orus — male, firm · Aoede — female, breezy · Callirrhoe — female, easy-going · Autonoe — female, bright · Enceladus — male, breathy · Iapetus — male, clear · Umbriel — male, easy-going · Algieba — male, smooth · Despina — female, smooth · Erinome — female, clear · Algenib — male, gravelly · Rasalgethi — male, informative · Laomedeia — female, upbeat · Achernar — female, soft · Alnilam — male, firm · Schedar — male, even · Gacrux — female, mature · Pulcherrima — female, forward · Achird — male, friendly · Zubenelgenubi — male, casual · Vindemiatrix — female, gentle · Sadachbia — male, lively · Sadaltager — male, knowledgeable · Sulafat — female, warm`;

export function stage5GeminiVoicePrompt(project, scene, shot, block, lang) {
  const chars = (project.storyline?.characters || [])
    .map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}: ${c.description || ''}`)
    .join('\n');
  const shots = project.sceneDetails[scene.id]?.shots || [];
  const idx = shots.findIndex((s) => s.id === shot.id);
  const neighbor = (s) => (s ? `action: ${s.action}${s.dialogue ? ` | dialogue: ${s.dialogue}` : ''}` : '—');
  const dynNote = block
    ? `\nAction Dynamics block (FALLBACK emotion source when the scene context is ambiguous): kinetic energy ${block.kinetic_energy_level}/10, dialogue volume ${block.dialogue_volume}/10, camera momentum "${block.required_camera_momentum.replace(/_/g, ' ')}". High energy → brisk delivery; low energy → restraint, unhurried pauses.`
    : '';
  return {
    system: `You are a film voice director preparing the input for Gemini TTS (a controllable text-to-speech model). Your output drives a real TTS engine: the transcript WILL BE SPOKEN ALOUD exactly as written, and the model follows your directorial framing.

"speakers" — CAST 1 or 2 voices (never more) for the characters who speak:
${GEMINI_VOICE_MENU}
Match each speaking character's gender, age and personality to a voice's gender and style. CONSISTENCY IS CRITICAL: the same character must get the SAME voice in every shot of the film — derive the choice from the character, never from the shot. "speaker" is the character's name in Latin letters.

"tts_prompt" — ONE coherent prompt, structured per the Gemini TTS prompting guide:
1. A short header before the transcript, in English:
   - Audio Profile: who is speaking — name, role, archetype (one line per speaker).
   - Scene: the physical space and emotional atmosphere in one or two lines.
   - Director's Notes: layered, DESCRIPTIVE style direction (e.g. "quiet steel under exhaustion, a vocal smile breaking through" — richer adjectives beat generic ones); a SPECIFIC regional accent only when the character or setting truly calls for it; explicit pacing that must fit the whole performance inside about the shot's duration (budget the words — roughly 2.5 words per second, plus the pauses you direct).
2. Then "Transcript:" followed by the speech:
   - Every spoken line VERBATIM from the script's dialogue, in its ORIGINAL language — never translate, shorten or paraphrase.
   - With TWO speakers, format each turn as "Name: line" using exactly the names from "speakers".
   - Shape delivery with inline audio tags in square brackets — ALWAYS IN ENGLISH regardless of the transcript language: emotions ([amazed], [tired], [sarcastic], [determined]…), non-verbal sounds ([sighs], [gasp], [laughs], [cough]…), intensity ([whispers], [shouting]), tempo ([very fast], [very slow]), and pauses ([short pause], [long pause]) placed where the scene's rhythm breathes.
   - Use tags purposefully (a few well-placed tags, not on every word), and keep punctuation doing the intonation work: ellipses for hesitation, exclamation for energy, question marks for the natural rise.
3. Keep the WHOLE prompt coherent: who speaks, what is said and how it is directed must agree with the scene's emotion. Emotions come from the SCENE CONTEXT first; the dynamics block is the fallback.

Respond with VALID JSON ONLY. No markdown, no commentary.`,
    maxTokens: 2000,
    user: `Characters:
${chars || '—'}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}${dynNote}

Previous shot: ${neighbor(shots[idx - 1])}
THIS SHOT (duration ${shot.duration}s): action: ${shot.action}
Dialogue to speak (verbatim source): ${shot.dialogue}
Next shot: ${neighbor(shots[idx + 1])}

Write the Gemini TTS input for THIS shot's dialogue. The performance must fit ~${shot.duration} seconds.

JSON schema:
{"tts_prompt":"Audio Profile: …\\nScene: …\\nDirector's Notes: …\\nTranscript:\\n[tag] Line…","speakers":[{"speaker":"Anna","voice":"Kore"}]}`,
  };
}

// FLF (first→last frame): looks at the shot's generated FIRST frame plus the
// shot's plot description and writes an image-EDIT prompt that turns that frame
// into the shot's FINAL frame (the end state of the action). Also reports which
// characters must appear in the final frame but are missing from the first one,
// so the caller can attach their reference photos. Returns
// { image_prompt, characters_to_add: ["Name", ...] }.
export function finalFramePrompt(project, scene, shot, firstFrame, lang) {
  const chars = project.storyline?.characters || [];
  const charList = chars.length ? characterBlock(project) : '(none defined)';
  return {
    system: system(lang),
    maxTokens: 1500,
    user: withPhotos([firstFrame], `Attached is the generated FIRST frame of a shot (the scene's state at the moment the shot begins).

Title: ${project.title}
Scene: "${scene.title}" — ${scene.summary}

Shot (duration ${shot.duration}s, ${shot.shotType || 'unspecified framing'}):
- Location: ${shot.location || '—'}
- Action across the shot: ${shot.action || '—'}
- Dialogue: ${shot.dialogue || '—'}
- Notes: ${shot.notes || '—'}

Characters in this project:
${charList}

Write ONE image-editing prompt (for the Nano Banana image generation model) that transforms the attached first frame into the shot's FINAL frame — the state of the scene at the END of the action, at the last second of the shot.

Requirements for the "image_prompt":
- English only, one dense paragraph, no lists.
- Phrase it as an EDIT of the attached image: state explicitly that the location, environment, architecture, lighting, color palette, camera angle and framing must stay EXACTLY the same as in the provided first frame — only the subjects change.
- Describe precisely where each visible character has ended up and what pose, gesture and expression they hold at the action's end (and any props that moved).
- Every character visible in the final frame must keep the exact same face, hair, body and wardrobe as in the first frame or in their attached reference photo.

Also fill "characters_to_add": the names (exactly as written in the character list above) of characters who SHOULD be visible in the final frame but are NOT visible in the attached first frame — their reference photos will be attached for the generation. Use an empty array if everyone needed is already in the first frame.

JSON schema:
{"image_prompt":"...","characters_to_add":["Name"]}`),
  };
}

// Asks Claude to pick the key visual from the synopsis and write an English
// image prompt for the project cover (poster). Returns { image_prompt }.
export function coverPromptSpec(project, lang, imageStyle) {
  const styleReq = (imageStyle || '').trim()
    ? `\n- Render it in this visual style: ${imageStyle.trim()}`
    : '';
  return {
    system: system(lang),
    maxTokens: 900,
    user: `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Synopsis:
"""
${project.storyline?.synopsis || ''}
"""

Characters:
${characterBlock(project)}

Identify the SINGLE most striking key event or key visual moment in this synopsis — the one image that best captures the whole film as a poster. Then write ONE detailed image-generation prompt for that image.

Requirements:
- The prompt MUST be in English only.
- Compose it as a 16:9 widescreen cinematic key frame / cover image, no text or lettering in the image.
- Describe the subject and action, setting, lighting, mood, color palette and cinematic style; include the key characters' consistent physical details if they appear.${styleReq}
- One dense paragraph, no lists.

JSON schema:
{"image_prompt":"..."}`,
  };
}

// Targeted-edit agent: applies one specific change (rename, time of day, location…)
// consistently across every stage without regenerating anything else.
export function smartEditPrompt(project, instruction, lang) {
  const content = {
    title: project.title,
    logline: project.logline,
    approvedPlot: project.approvedPlot,
    synopsis: project.storyline?.synopsis || '',
    characters: (project.storyline?.characters || []).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      description: c.description,
    })),
    scenes: project.outline.map((s) => ({ id: s.id, title: s.title, summary: s.summary })),
    shots: project.outline.flatMap((s) =>
      (project.sceneDetails[s.id]?.shots || []).map((sh) => ({
        id: sh.id,
        scene: s.title,
        shotType: sh.shotType,
        location: sh.location,
        action: sh.action,
        dialogue: sh.dialogue,
        notes: sh.notes,
      }))
    ),
    prompts: Object.entries(project.shotPrompts || {}).map(([id, p]) => ({
      id,
      imagePrompt: p.imagePrompt,
      videoPrompt: p.videoPrompt,
    })),
  };

  // The smart-edit agent is intentionally NOT governed by project styles — it
  // uses the base system prompt (and the caller forces the standard Sonnet 5 model).
  return {
    system: system(lang),
    maxTokens: 8000,
    user: `You are performing a TARGETED find-and-adapt edit on an existing short-video script. Do NOT rewrite, improve or regenerate anything beyond what the requested change strictly requires.

Current script content (JSON):
${JSON.stringify(content)}

Requested change:
"""
${instruction}
"""

Apply ONLY this change, but apply it CONSISTENTLY everywhere it logically appears: title, logline, approved plot, synopsis, character entries, scene titles/summaries, shot fields (location, action, dialogue, notes) and image/video prompts. Examples: renaming a character must update every mention including dialogue speaker names and prompts; changing time of day must update locations, lighting descriptions and prompts; changing a location must update settings and environment descriptions.

Rules:
- Preserve each field's existing language and style; change only what the request requires.
- "imagePrompt" and "videoPrompt" must remain entirely in English; character names always in Latin letters.
- Return ONLY the fields and entries that actually change. Omit everything unchanged. For array entries include the entry "id" and only the changed fields.

JSON schema:
{"title":"...","logline":"...","approvedPlot":"...","synopsis":"...","characters":[{"id":"...","name":"...","role":"...","description":"..."}],"scenes":[{"id":"...","title":"...","summary":"..."}],"shots":[{"id":"...","shotType":"...","location":"...","action":"...","dialogue":"...","notes":"..."}],"prompts":[{"id":"...","imagePrompt":"...","videoPrompt":"..."}]}

Every top-level key is optional — include a key only if something under it changed.`,
  };
}

export function extractCharacterPrompt(character, lang) {
  const existing = (character.description || '').trim();
  const text = `Look carefully at the attached reference photo(s) of the character "${character.name || 'the character'}".

Current character description:
"""
${existing || '(empty)'}
"""

Rewrite this description, updating ONLY what the photos show about physical appearance: facial features (face shape, eyes, skin tone, distinctive marks), hairstyle (color, length, style) and apparent age. Every trait unrelated to those — personality, habits, motivations, role, backstory, clothing style and any other characteristics — must be preserved exactly as written. If the current description is empty, write a new 2–4 sentence description covering only the face, hair and apparent age. Be specific and concrete so generated images stay consistent.

JSON schema:
{"description":"the full updated description"}`;
  return {
    system: system(lang),
    maxTokens: 1500,
    user: withPhotos(character.photos || [], text),
  };
}

// ---- style assistant --------------------------------------------------------
// Turns a plain-language wish ("moody 70s thriller", "как в рекламе духов")
// into a library style for one of the three categories. Each category feeds a
// different engine, so the rules below mirror how the style text is actually
// used: script styles are appended to the writing instructions (stages 1–4),
// image styles are pasted into the image prompt, video styles are substituted
// into {{VIDEO_STYLE_INJECTION}} of the LTX motion system prompt.
const STYLE_RULES = {
  script: `SCRIPT STYLE — appended to the screenwriting instructions for stages 1–4 (ideas, synopsis, scene outline, shot breakdown).
- Write 2–4 imperative sentences addressed to the writer: "Write as…", "Focus on…", "Keep dialogue…".
- Cover the narrative voice, what the dialogue does, where the tension lives, and what to avoid.
- Finish with a "Shot dynamics:" clause naming pacing and camera behaviour (e.g. "Shot dynamics: slow pacing, lingering close-ups, static lock-offs").
- Never name a specific project, character or plot — the style must fit any story.`,
  image: `IMAGE STYLE — pasted into every image-generation prompt (Flux / Nano Banana), so it must read as prompt vocabulary, not prose.
- Write ONE comma-separated line of visual and technical descriptors: medium or film stock, lens and depth of field, lighting, colour grading, texture/grain, and an era or director reference when it sharpens the look.
- Finish with "Avoid: " followed by comma-separated negatives that would break the look.
- Describe only the LOOK. No subjects, no characters, no story, no camera movement.`,
  video: `VIDEO STYLE — substituted into the LTX-2 motion prompt, which describes only how a still frame comes to life.
- Write 2–4 present-tense sentences in this order: camera behaviour, subject motion texture, pacing and beats, ambient sound.
- The starting frame already carries appearance, lighting, colour and environment — never describe any of them, and never describe a character.
- No numbers of any kind: no seconds, no framerates, no shot counts.
- No speech, dialogue or lip-sync direction.`,
};

export function styleAssistantPrompt(category, idea, lang, current, refinement) {
  const langName = LANG_NAMES[lang] || 'English';
  const rules = STYLE_RULES[category] || STYLE_RULES.script;
  const refining = !!(current && refinement);
  return {
    system: `You are a film-craft specialist who writes reusable STYLE PRESETS for an AI short-film studio. You translate a director's rough wish into a precise, reusable style that works across any project.

Rules:
- Respond with VALID JSON ONLY. No markdown, no commentary.
- "instructions" must be written entirely in English — it is fed to generation engines that expect English.
- "name" (2–4 words) and "rationale" (one sentence) are written in ${langName}.
- The style must be reusable: never mention a specific plot, character, brand or project.
- Obey the category rules exactly; they describe where the text is injected.

${rules}`,
    maxTokens: 1200,
    user: refining
      ? `Current style:
name: ${current.name}
instructions: """
${current.instructions}
"""

The director asks for this adjustment:
"""
${refinement}
"""

Revise the style with the adjustment applied, keeping everything it does not touch and staying inside the category rules.

JSON schema:
{"name":"...","instructions":"...","rationale":"..."}`
      : `The director describes the style they want (their words, any language):
"""
${idea}
"""

Design one style preset that delivers it. Be specific and opinionated — a preset that could have come from a real production bible, not a generic description.

JSON schema:
{"name":"...","instructions":"...","rationale":"..."}`,
  };
}

// ---- MiniMax H3 video prompting --------------------------------------------
// H3 is an omni model: picture and 32kHz stereo audio (dialogue, effects,
// score) come out of ONE forward pass. The open weights ship without the
// H3-Context-IR module that normally rewrites a casual prompt into the
// model's training format, so we write that format ourselves — the
// three-field schema from MiniMax's VIDEO_PROMPT_WRITING_GUIDE. A prompt that
// only describes pictures leaves half the model idle, which is why the audio
// fields are mandatory here (unlike the LTX engines, where audio is a
// separate TTS pass).
const H3_CAMERA = `Camera vocabulary (motion type, then OPTIONAL amplitude and speed, written as natural English inside the sentence — never stacked as labels):
- motion: Zoom In/Out · Push In/Pull Out · Pan Left/Right · Truck Left/Right · Tilt Up/Down · Pedestal Up/Down · Arc Shot · Tracking Shot · Static Shot · Shake Slightly/Strongly · POV · Roll Clockwise/Counterclockwise
- amplitude (only when it matters): "with small amplitude" | "with large amplitude"
- speed (only when it matters): "at slow speed" | "at fast speed"
Example: "The camera pushes in with small amplitude at slow speed toward the folded letter in her hands."`;

const H3_SYSTEM = `You write prompts for MiniMax H3, an omni-modal video model that generates picture AND stereo audio in a single pass.

Respond with VALID JSON ONLY. No markdown, no commentary.

Produce exactly three fields, in MiniMax's training format:

1. "integrated_multimodal_description" — the main body, along the timeline.
   - Open [Shot 1] with the overall style and initial composition ("Live-action, cinematic, a medium-wide shot frames…"). Styles: Cinematic, live-action, 2D-animated, 3D CG, claymation, watercolor, vintage film.
   - [Shot 1] carries NO timestamp. Later shots (only if the beat genuinely needs a new viewpoint) use "[Shot 2] At 00:03.500, the camera cuts to…" with strictly increasing times inside the duration. A cut must introduce NEW information (subject, space, state, viewpoint, time); if only the distance or angle changes, move the camera instead.
   - ${H3_CAMERA}
   - Speakers get stable IDs: (S1), (S2); simultaneous speakers (S1,S2). Establish identity on first appearance (type, age, gender, on/off-screen, pitch, timbre, rate, accent). Identity, action and delivery go OUTSIDE the tag; INSIDE goes only the language tag and the verbatim words: The woman (S1) says: <d>[English] Text here.</d>
   - Voiceover uses the exact phrase "says in an off-screen voiceover", and immediately after the </d> states that the character's lips remain closed.
   - On-screen text goes in double quotes, verbatim, untranslated.
   - Describe diegetic sound (sounds the characters can hear) here, synchronized to the action.

2. "overall_soundscape" — 1–4 sentences, one paragraph: ambience, physical action sounds, non-verbal human sounds across the whole video (wind, traffic, footsteps, fabric, impacts, breathing). Never repeat dialogue here. No music of any kind here. "N/A" only for deliberate total silence.

3. "non_diegetic_music" — always exactly "N/A". StoryReel scores its films in the edit with a separate music generator, so the video model must produce NO music of its own: no score, no soundtrack, no musical stingers, no humming or singing ambience — only character speech and sound effects, and those belong to the fields above.

Hard rules:
- Everything in English except the verbatim contents of <d>…</d> and on-screen text, which keep their original language.
- Structured long, not verbose long: spend length on timeline, camera and audio, never on stacked adjectives.
- Do not invent dialogue that the shot does not have. If the shot is silent, say so through the soundscape instead.
- Describe only what is seeable or hearable.`;

// First-frame / first+last-frame alignment header. H3 wants this as the first
// line, followed by a blank line, whenever reference frames are attached.
export function h3AlignmentHeader({ hasFirst, hasLast, seconds }) {
  const s = (Number(seconds) || 4).toFixed(2);
  if (hasFirst && hasLast) {
    return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${s}-second mark of the target video.`;
  }
  if (hasFirst) {
    return 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  }
  return '';
}

// Assemble the final prompt string handed to the H3 node.
// The three fields live in ONE editable text block (what Stage 5 shows). Only
// the mechanical alignment header is added at run time — it depends on which
// frames are actually attached and on the real snapped duration, so it is
// never stored, and a stale header inside the body is stripped first.
export function h3ComposePrompt(body, { hasFirst = true, hasLast = false, seconds = 4 } = {}) {
  const clean = String(body || '')
    .replace(/^\s*(For the target video,|How the reference pictures align)[^\n]*\n+/i, '')
    .trim();
  const head = h3AlignmentHeader({ hasFirst, hasLast, seconds });
  return head ? `${head}\n\n${clean}` : clean;
}

// Rewrite a scene's shots into H3 three-field prompts. Mirrors stage5VideoPrompt
// (same scene context and continuity chain) but targets the H3 schema and asks
// for the sound design the model can actually render.
export function stage5H3VideoPrompt(project, scene, shots, videoStyle, block, seconds) {
  const chars = characterBlock(project);
  const styleNote = (videoStyle || DEFAULT_VIDEO_MOTION_STYLE).trim();
  const dyn = block
    ? `\nAction dynamics for this scene — kinetic energy ${block.kinetic_energy_level}/10, dialogue volume ${block.dialogue_volume}/10, camera momentum "${String(block.required_camera_momentum).replace(/_/g, ' ')}". Express these through concrete motion and sound, never by quoting the numbers.`
    : '';
  const takes = project.shotGroups || {};
  const takeFor = (id) => Object.values(takes).find((g) => (g.shotIds || []).includes(id));
  const stamp = (sec) => {
    const v = Math.max(0, Number(sec) || 0);
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(Math.floor(v % 60)).padStart(2, '0')}.${String(Math.round((v % 1) * 1000)).padStart(3, '0')}`;
  };
  // Reference list for a shot (H3 reference mode) — shared by plain shots and
  // take leads, so refs survive grouping.
  const refBlockOf = (id) => {
    const refs = (project.shotRefs || {})[id] || null;
    if (!refs) return '';
    const lines = [
      ...(refs.images || []).map((r, k) => `  <Picture ${k + 1}> = ${r.label || 'reference image'}${r.board ? ' [STORYBOARD FRAME]' : ''}`),
      ...(refs.videos || []).map((r, k) => `  <Video ${k + 1}> = ${r.label || 'reference video'}`),
      ...(refs.audios || []).map((r, k) => `  <Audio ${k + 1}> = ${r.label || 'reference audio'}`),
    ].join('\n');
    return lines ? `\n  REFERENCE MODE — attached media:\n${lines}` : '';
  };
  const shotLine = (s) => {
    const line = (s.dialogue || '').trim();
    const native = (project.shotVoiceSources || {})[s.id] === 'native';
    const spk = ((project.shotSpeakerNotes || {})[s.id] || '').trim();
    const dialogue = !line
      ? '(no speech)'
      : native
        ? `[NATIVE VOICE] "${line}"${spk ? ` (speaker: ${spk})` : ''}`
        : `[VOICE ADDED IN POST] "${line}"`;
    return `action: ${s.action || '(none)'}; dialogue: ${dialogue}`;
  };
  const list = shots
    .map((s, i) => {
      // Take members fold into their lead's GROUP TAKE entry.
      const take = takeFor(s.id);
      if (take && take.shotIds[0] !== s.id) return null;
      if (take) {
        const members = take.shotIds
          .map((id) => shots.find((x) => x.id === id))
          .filter(Boolean);
        const total = members.reduce((a, x) => a + (Number(x.duration) || 0), 0);
        let at = 0;
        const inner = members
          .map((m, k) => {
            const head = k === 0 ? `[Shot 1]` : `[Shot ${k + 1}] At ${stamp(at)}`;
            const row = `  ${head} (${Number(m.duration) || 4}s${m.shotType ? `, ${m.shotType}` : ''}): ${shotLine(m)}`;
            at += Number(m.duration) || 0;
            return row;
          })
          .join('\n');
        return `Shot ${i + 1} (id ${s.id}) — GROUP TAKE: ${members.length} shots in ONE ${total}s generation with H3-timed internal cuts:
${inner}
  location: ${s.location || scene.title || ''}${refBlockOf(s.id)}`;
      }
      const dur = Number(s.duration || 4);
      const line = (s.dialogue || '').trim();
      // Voice source decides whether H3 generates the speech (native) or the
      // line is laid on later from a TTS/recorded take (post) — the prompt
      // must never let H3 speak a post-voiced line.
      const native = (project.shotVoiceSources || {})[s.id] === 'native';
      const spk = ((project.shotSpeakerNotes || {})[s.id] || '').trim();
      const dialogue = !line
        ? '(none — this shot has no speech)'
        : native
          ? `[NATIVE VOICE] "${line}"${spk ? `\n  speaker: ${spk}` : ''}`
          : `[VOICE ADDED IN POST] "${line}"`;
      return `Shot ${i + 1} (id ${s.id}, ${dur}s${s.shotType ? `, ${s.shotType}` : ''}):
  action: ${s.action || '(none)'}
  dialogue: ${dialogue}
  location: ${s.location || scene.title || ''}${refBlockOf(s.id)}`;
    })
    .filter(Boolean)
    .join('\n');
  return {
    system: H3_SYSTEM,
    maxTokens: 6000,
    user: `FILM: ${project.title}
SCENE ${project.outline.indexOf(scene) + 1}: ${scene.title} — ${scene.summary}
${chars ? `CHARACTERS:\n${chars}\n` : ''}
DIRECTORIAL STYLE to express as concrete motion and sound: "${styleNote}"${dyn}

Each shot below already has a generated FIRST FRAME that will be attached to the model, so the frame carries the appearance, wardrobe, lighting and set — do NOT re-describe them. Refer to people by neutral visual handles ("the woman", "the taller man"), never by name.

${list}

For EACH shot write the three H3 fields describing only that shot's own duration. Shots marked REFERENCE MODE are rendered by H3's reference checkpoint: open their integrated_multimodal_description with subject definitions binding each reference to a role (“<Subject 1> is the woman from <Picture 1>”), state retention explicitly (“Use <Picture 1> exactly as it is” / “retain the voice of <Audio 1>”), then describe the shot; every attached reference must be mentioned by its label. References tagged [STORYBOARD FRAME] use MiniMax's official storyboard declaration — “<Picture N> is a storyboard reference for [Shot K], defining its viewpoint, subject placement, and shot order” — bound to the shot the frame belongs to (its scene/shot number is in the label). GROUP TAKE entries are ONE multi-shot generation: write ONE video_prompt for the whole take — open with [Shot 1] (no timestamp), start every later segment with [Shot N] At MM:SS.mmm exactly matching the listed times, put <scenetrans> at each internal cut, keep continuity across the cuts — and return it under the take's shot number only; folded shots get NO entry of their own. Dialogue handling: where a line is marked [NATIVE VOICE], put it verbatim inside <d>[Language] …</d> with a speaker ID and an established voice identity (honor the speaker notes) — H3 speaks it natively. Where a line is marked [VOICE ADDED IN POST], the character visibly delivers it — mouth and body act the words — but NO speech may appear in any audio field: no <d> tags for that shot, the soundscape stays ambience and effects, the voice track is laid on in editing.

Return one entry per shot, in order, numbered from 1. "video_prompt" holds the three fields as ONE text block written exactly like this, blank line between fields:

integrated_multimodal_description: [Shot 1] …

overall_soundscape: …

non_diegetic_music: …

Do NOT add an alignment header — the app prepends it.

JSON schema:
{"prompts":[{"shot":1,"video_prompt":"integrated_multimodal_description: …\n\noverall_soundscape: …\n\nnon_diegetic_music: …"}]}`,
  };
}
