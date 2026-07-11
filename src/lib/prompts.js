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

export function stage5Prompt(project, scene, shots, lang, imageStyle, videoStyle) {
  const shotList = shots.map((s, i) => ({
    shot: i + 1,
    duration_sec: s.duration,
    shot_type: s.shotType,
    location: s.location,
    action: s.action,
    dialogue: s.dialogue,
    notes: s.notes,
  }));
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Ground the image prompts in what these photos show: architecture, interior details, colors, lighting and atmosphere.`
    : '';
  const img = (imageStyle || '').trim();
  const vid = (videoStyle || '').trim();
  const ratio = project.aspectRatio || '16:9';
  const aspectNote = `\n\nASPECT RATIO — every "image_prompt" and every "video_prompt" MUST explicitly state the framing as ${aspectDescription(ratio)} (${ratio}), and compose for that frame.`;
  const styleNote =
    (img ? `\n\nVISUAL STYLE — bake this into EVERY "image_prompt": ${img}` : '') +
    (vid ? `\n\nCINEMATIC STYLE — bake this into EVERY "video_prompt": ${vid}` : '');
  return {
    system: system(lang),
    maxTokens: 8000,
    user: withPhotos(scene.photos, `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Characters (repeat their key physical details in EVERY prompt where they appear, so the generated images stay visually consistent):
${characterBlock(project)}

Scene ${scene.number}: "${scene.title}" — ${scene.summary}

Shots of this scene:
${JSON.stringify(shotList, null, 2)}

For EVERY shot above, write two prompts:

1) "image_prompt" — a detailed English prompt for the Nano Banana image generation model to create the FIRST FRAME of the shot. Describe: the subject and action frozen at the shot's opening moment, each visible character with their consistent physical details, the environment, lighting, camera angle and lens (e.g. 35mm, shallow depth of field), composition, and an overall cinematic style. Write it as one dense paragraph, no lists.

2) "video_prompt" — a detailed English prompt for an image-to-video model that animates that image for the shot's duration. Describe: what moves and how, character actions and expressions, camera movement (static / pan / dolly / handheld...), pacing, and atmosphere or sound cues. Assume the generated image is the starting frame.

JSON schema:
{"prompts":[{"shot":1,"image_prompt":"...","video_prompt":"..."}]}

Return exactly one entry per shot, in order.` + aspectNote + styleNote + envNote),
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
  const text = `Look carefully at the attached reference photo(s) of the character "${character.name || 'the character'}".

Write a detailed visual description (3–5 sentences) that can be used to generate consistent AI images of this character: apparent age, face shape and features, hair (color, length, style), eyes, build, skin tone, clothing style, and any distinctive features. Be specific and concrete — no vague words like "attractive" or "ordinary".

JSON schema:
{"description":"..."}`;
  return {
    system: system(lang),
    maxTokens: 1500,
    user: withPhotos(character.photos || [], text),
  };
}
