import { dataURLToImageBlock } from './images.js';

const LANG_NAMES = { en: 'English', ru: 'Russian', uk: 'Ukrainian' };

function withPhotos(photos, text) {
  return photos?.length
    ? [...photos.map(dataURLToImageBlock), { type: 'text', text }]
    : text;
}

function system(lang, custom) {
  const langName = LANG_NAMES[lang] || 'English';
  const base = `You are an award-winning screenwriter and director who specializes in short-form video: commercials, branded content and short films up to 5 minutes long. You think in concrete visual images, understand pacing, and write economically.

Rules:
- Respond with VALID JSON ONLY. No markdown, no code fences, no commentary outside the JSON.
- Follow the exact JSON schema given in the task.
- Write ALL creative content (titles, pitches, synopsis, character descriptions, dialogue, action descriptions, notes) in ${langName}, regardless of the language of the user's input.
- The only exception: "image_prompt" and "video_prompt" fields must ALWAYS be written in English — never in any other language.`;
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

export function stage1Prompt(project, lang) {
  return {
    system: system(lang, project.systemPrompt),
    maxTokens: 2500,
    user: `Brief plot description for a short video (target length: up to 5 minutes):

"""
${project.logline}
"""

Generate exactly 4 distinct directions for improving and developing this plot. Make them genuinely different from each other (different angle, tone, structure or twist) — not four variations of one idea. Each must stay faithful to the core of the original but make it stronger: clearer conflict, a more distinctive hook, a more satisfying ending.

JSON schema:
{"ideas":[{"title":"catchy working title","pitch":"the improved plot in 3-6 sentences","why_it_works":"1-2 sentences on why this version is stronger than the original"}]}`,
  };
}

export function stage2Prompt(project, lang) {
  return {
    system: system(lang, project.systemPrompt),
    maxTokens: 3500,
    user: `Original plot description:
"""
${project.logline}
"""

Approved plot direction:
"""
${project.approvedPlot}
"""

Create the final storyline for this short video (up to 5 minutes).

JSON schema:
{"title":"a strong final title","genres":["2-3 short genre tags, e.g. drama, comedy, thriller"],"synopsis":"a complete story summary of 150-300 words with a clear beginning, middle and end","characters":[{"name":"character name","role":"protagonist / antagonist / supporting","description":"2-4 sentences: age, physical appearance (specific enough to keep the character visually consistent across AI image generation), personality, motivation"}]}`,
  };
}

export function stage3Prompt(project, lang) {
  return {
    system: system(lang, project.systemPrompt),
    maxTokens: 3000,
    user: `Title: ${project.title}
Genres: ${project.genres.join(', ')}

Synopsis:
"""
${project.storyline?.synopsis || ''}
"""

Characters:
${characterBlock(project)}

Create a scene-by-scene outline for this short video. The full video must run at most 300 seconds (5 minutes) in total; commercials are typically much shorter — infer the right total length from the material. Use between 3 and 10 scenes. Each scene must be a single continuous location and moment.

JSON schema:
{"scenes":[{"number":1,"title":"short scene title","summary":"2-3 sentences describing exactly what happens in the scene","duration_sec":20}]}`,
  };
}

export function stage4Prompt(project, scene, lang) {
  const outlineList = project.outline
    .map((s, i) => `${i + 1}. ${s.title} — ${s.summary} (~${s.duration}s)`)
    .join('\n');
  const envNote = scene.photos?.length
    ? `\n\nAttached are reference photos of this scene's environment. Match the locations, lighting and mood in your shot descriptions to these photos.`
    : '';
  return {
    system: system(lang, project.systemPrompt),
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

export function stage5Prompt(project, scene, shots, lang) {
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
  const imgTpl = (project.imageTemplate || '').trim();
  const vidTpl = (project.videoTemplate || '').trim();
  const tplNote =
    imgTpl || vidTpl
      ? '\n\nFollow these prompt templates for this project. Adapt each shot to the template while keeping the required content; the template defines style, structure and any fixed wording, but every prompt must still be in English.' +
        (imgTpl ? `\n\nIMAGE PROMPT TEMPLATE:\n${imgTpl}` : '') +
        (vidTpl ? `\n\nVIDEO PROMPT TEMPLATE:\n${vidTpl}` : '')
      : '';
  return {
    system: system(lang, project.systemPrompt),
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

Return exactly one entry per shot, in order.` + tplNote + envNote),
  };
}

// Asks Claude to pick the key visual from the synopsis and write an English
// image prompt for the project cover (poster). Returns { image_prompt }.
export function coverPromptSpec(project, lang) {
  return {
    system: system(lang, project.systemPrompt),
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
- Describe the subject and action, setting, lighting, mood, color palette and cinematic style; include the key characters' consistent physical details if they appear.
- One dense paragraph, no lists.

JSON schema:
{"image_prompt":"..."}`,
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
