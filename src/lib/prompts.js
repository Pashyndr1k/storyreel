import { dataURLToImageBlock } from './images.js';
import { aspectDescription } from './aspect.js';
import { buildRandomization } from './randomization.js';

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
    system: system(lang, scriptStyle) + persona + systemAppend,
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
    maxTokens: 3000,
    user: `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Synopsis:
"""
${project.storyline?.synopsis || ''}
"""

Characters:
${characterBlock(project)}

Create a scene-by-scene outline for this short video. The full video must run between ${durationOf(project).min} and ${durationOf(project).max} seconds in total — choose a number of scenes appropriate for that length (a 10–30 second ad may need only 2–4 scenes; a 5–10 minute film may need 6–14). Each scene must be a single continuous location and moment.

JSON schema:
{"scenes":[{"number":1,"title":"short scene title","summary":"2-3 sentences describing exactly what happens in the scene","duration_sec":20}]}`,
  };
}

export function stage4Prompt(project, scene, lang, scriptStyle) {
  const outlineList = project.outline
    .map((s, i) => `${i + 1}. ${s.title} — ${s.summary} (~${s.duration}s)`)
    .join('\n');
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Match the locations, lighting and mood in your shot descriptions to these photos.`
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
- Each shot lasts between 2 and 10 seconds.
- Shot durations must add up to roughly the scene's target duration (${scene.duration} seconds).
- "action" must describe precisely what the characters do and what the camera sees — concrete and filmable, no abstractions.
- "dialogue" contains the spoken lines prefixed by the speaker's name, or an empty string if the shot has no dialogue.
- "location" is the specific place plus time of day / lighting condition.

JSON schema:
{"shots":[{"duration_sec":4,"shot_type":"wide / medium / close-up / POV / tracking / etc.","location":"specific location, time of day","action":"what happens and what the camera sees","dialogue":"NAME: line — or empty string","notes":"mood, lighting, sound or continuity note — may be empty"}]}` + envNote),
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

// Stage 5 runs as TWO separate calls per scene: image prompts (first frames,
// full static detail) and video prompts (motion only, via the Video Motion
// instruction below) — one call could never satisfy both rule sets at once.
export function stage5Prompt(project, scene, shots, lang, imageStyle) {
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Ground the image prompts in what these photos show: architecture, interior details, colors, lighting and atmosphere.`
    : '';
  const img = (imageStyle || '').trim();
  const ratio = project.aspectRatio || '16:9';
  const aspectNote = `\n\nASPECT RATIO — every "image_prompt" MUST explicitly state the framing as ${aspectDescription(ratio)} (${ratio}), and compose for that frame.`;
  const styleNote = img ? `\n\nVISUAL STYLE — bake this into EVERY "image_prompt": ${img}` : '';
  return {
    system: system(lang),
    maxTokens: 6000,
    user: withPhotos(scene.photos, `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Characters (repeat their key physical details in EVERY prompt where they appear, so the generated images stay visually consistent):
${characterBlock(project)}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}

Shots of this scene:
${JSON.stringify(stage5ShotList(shots), null, 2)}

For EVERY shot above, write one "image_prompt" — a detailed English prompt for the Nano Banana image generation model to create the FIRST FRAME of the shot.

FIRST FRAME TIMING — this is the most important rule. Each shot's "action" field describes everything that happens ACROSS the shot's full duration. The first frame is the state of the scene at second zero, BEFORE that action has started to unfold. Do NOT depict the midpoint, the climax or the result of the action. Freeze the INITIAL state: where each character is, their pose, gesture and expression at the instant the shot begins — at most the very first hint of the described movement. If the action ends somewhere else than it starts, show where it STARTS. Example: for the action "Anna crosses the room and picks up the phone", the first frame shows Anna at her starting position at the far side of the room, the phone still lying untouched — not Anna mid-stride and not Anna holding the phone. Use the previous shot's end state as a cue for what this shot's opening state naturally looks like.

In each prompt describe: that initial-state subject staging, each visible character with their consistent physical details, the environment, lighting, camera angle and lens (e.g. 35mm, shallow depth of field), composition, and an overall cinematic style. Write it as one dense paragraph, no lists.

JSON schema:
{"prompts":[{"shot":1,"image_prompt":"..."}]}

Return exactly one entry per shot, in order.` + aspectNote + styleNote + envNote),
  };
}

// Default directorial style substituted into {{VIDEO_STYLE_INJECTION}} when the
// project has no video style selected (or the user clears it).
export const DEFAULT_VIDEO_MOTION_STYLE =
  'Naturalistic cinematic motion: smooth, motivated camera movement (subtle push-ins, gentle pans, stable handheld only when the action calls for it), grounded physical acting with realistic weight and restrained gestures, conversational speech delivered at a natural pace, and organic pauses where the emotional beat requires them.';

// Video Motion Prompt System Instruction (verbatim). {{VIDEO_STYLE_INJECTION}}
// receives the selected video style's instructions (or DEFAULT_VIDEO_MOTION_STYLE);
// {{PREVIOUS_SHOT_MOMENTUM}} receives the continuity source description — all
// shots of a scene are written in one call, so each shot chains to the one
// directly above it in the list.
const VIDEO_MOTION_SYSTEM = `You are an expert AI cinematic director translating a scene outline into precise image-to-video motion prompts.

CRITICAL RULE 1 (STATIC AVOIDANCE): The video generation model will be provided with an exact starting frame. DO NOT describe any static visual elements. Never describe character appearances, wardrobe, lighting, or the background environment. Repeating static details causes the video model to morph, hallucinate, or lose character consistency.

CRITICAL RULE 2 (DIRECTORIAL STYLE): You must strictly apply the following camera physics, actor kinetics, and speech dynamics to the scene: "{{VIDEO_STYLE_INJECTION}}". Use this to dictate the exact framerate, camera stability, physical acting style, and pause durations.

CRITICAL RULE 3 (CONTINUITY & STATE TRACKING): This shot is part of a continuous, real-time scene. You must strictly maintain the physical momentum, velocity, and posture established in the previous shot: "{{PREVIOUS_SHOT_MOMENTUM}}".
- The Inertia Law: If a character is walking, running, or falling in the previous shot, they MUST continue doing so in this shot unless the script explicitly dictates they stop.
- "Match on Action": Start the new motion prompt by explicitly establishing the carried-over motion (e.g., "Continuing their brisk walk...", "Still sprinting...").
- Do not let characters return to a "neutral standing pose" between cuts unless commanded.

Your ONLY job is to describe how the static frame changes over time: camera trajectory, character motion, dialogue pacing, and sound.

When writing the motion prompt, strictly follow these constraints:
1. Camera Dynamics: Define the exact camera movement first, directly applying the camera behavior from the injected style.
2. Actor Kinetics: Describe character movement, physical weight, and gestures strictly matching the acting style specified (e.g., naturalistic, theatrical, jerky, frenetic). Anchor the start of the shot with the Continuity Vocabulary — continuous gerunds that carry over the established motion (e.g., "Walking into frame", "Continuing to turn", "Still holding the glass").
3. Chronological Timing & Pauses: Map actions sequentially across the shot. You MUST apply the specific pause dynamics from the style injection (e.g., deadpan 2-second pauses, fast-paced zero pauses, lingering uncomfortable holds).
4. Audio & Speech Delivery: Include spoken phrases and sound effects, formatting the dialogue delivery exactly as the style dictates (e.g., stumbling, projected, rapid-fire, breathless).

Output the prompt using the following strict syntax, ensuring it is highly concise:

[Camera Dynamics] + [Actor Kinetics & Chronological Action] + [Speech Delivery, Pauses & Audio]

Example Output (assuming a 'Dramatic Film' style injection):
"Smooth lateral dolly track keeping pace, 24fps motion blur. Continuing their brisk walk down the corridor, the character maintains a heavy, purposeful stride, jaw tight, never breaking pace. At 0:02, still walking, they glance sideways and deliver in a measured, low voice: 'I never forgot,' followed by a 2-second pause carried on unbroken footsteps. Audio: rhythmic footfalls on concrete, low ambient room tone."`;

// All shots of a scene are written in one request, so the "previous shot" for
// continuity is the preceding entry in the same list — the model chains its
// own outputs. The first shot of the scene derives its entry momentum from its
// own action description.
const MOMENTUM_SOURCE =
  "the ending motion state of the immediately preceding shot in the provided shot list, as established by that shot's action and your own previous video_prompt; for the FIRST shot of the scene, derive the entry momentum from its own action description (if the action implies the character is already moving, they enter the shot mid-motion)";

export function stage5VideoPrompt(project, scene, shots, videoStyle) {
  const injection = (videoStyle || '').trim() || DEFAULT_VIDEO_MOTION_STYLE;
  return {
    system:
      VIDEO_MOTION_SYSTEM.replace('{{VIDEO_STYLE_INJECTION}}', injection).replace(
        '{{PREVIOUS_SHOT_MOMENTUM}}',
        MOMENTUM_SOURCE
      ) +
      `\n\nResponse format:
- Respond with VALID JSON ONLY. No markdown, no code fences, no commentary outside the JSON.
- Every "video_prompt" must be written entirely in English; character names always in Latin letters.`,
    maxTokens: 6000,
    user: `Scene ${scene.number}: "${scene.title}" — ${scene.summary}

Shots of this scene (each has an exact duration in seconds — map the motion, dialogue and pauses chronologically within it):
${JSON.stringify(stage5ShotList(shots), null, 2)}

For EVERY shot above, write one "video_prompt" motion prompt following your system instruction. The starting frame of each shot already exists — describe only how it changes over the shot's duration. Write the prompts in order, carrying each shot's ending momentum into the next per CRITICAL RULE 3.

JSON schema:
{"prompts":[{"shot":1,"video_prompt":"..."}]}

Return exactly one entry per shot, in order.`,
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
