// The composition planner: one text-model call turns a scene's shots into
// comic screens — a layout template per screen, and per panel its framing,
// the characters in it, an English image prompt, the caption line and the
// speech balloons (the script's own lines, in the project's language).
import { LAYOUTS, LAYOUT_GUIDE, layoutOf, screenPanels, nearestRatio } from './layout.js';
import { COMPOSITION_RULES } from './rules.js';
import { newPanel, newBubble, parseDialogue, screenOf } from './model.js';
import { locationsOf } from '../sceneLocations.js';

const LANG_NAMES = { en: 'English', ru: 'Russian', uk: 'Ukrainian' };

const layoutText = () =>
  LAYOUTS.map((l) => {
    const boxes = screenPanels(l.id).map((b, i) => `panel ${i + 1} ${b.w}×${b.h} (${b.w > b.h * 1.15 ? 'wide' : b.h > b.w * 1.15 ? 'tall' : 'square'})`).join(', ');
    return `- "${l.id}" (${l.panels} panels: ${boxes}): ${LAYOUT_GUIDE[l.id]}`;
  }).join('\n');

// shots: the shots to plan (the whole scene, or one screen); the rest of the
// scene is given as context so continuity holds.
export function novelPlanSpec(project, scene, shots, lang) {
  const langName = LANG_NAMES[lang] || 'English';
  const all = project.sceneDetails?.[scene.id]?.shots || [];
  const cast = (project.storyline?.characters || []).map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ''}: ${String(c.description || '').slice(0, 220)}`).join('\n');
  const places = locationsOf(scene).map((l) => l.name).filter(Boolean).join('; ');
  const sceneIdx = project.outline.findIndex((s) => s.id === scene.id);
  const list = all
    .map((s, i) => {
      const planned = shots.some((x) => x.id === s.id);
      return `SHOT ${i + 1}${planned ? '' : ' (context only — do not plan)'}
  framing: ${s.shotType || ''}
  location: ${s.location || ''}
  action: ${s.action || ''}
  dialogue: ${s.dialogue || '(none)'}
  notes: ${s.notes || ''}`;
    })
    .join('\n');
  return {
    system: `You are a graphic novel artist and letterer who breaks film scripts into vertical comic screens (webtoon format, 9:16, read by scrolling). You plan panel layouts and compositions with the craft of a professional comic artist. Respond with VALID JSON only.

${COMPOSITION_RULES}

LAYOUT TEMPLATES (one per screen; the screen is 1080×1920, every panel has a caption line under it):
${layoutText()}
Choose the template from the shot's beats: how many moments it has, which one is the big one, and whether it ends on a reveal. Vary templates across a scene; do not use the same one for every screen.

TEXT:
- "bubbles": the shot's dialogue, VERBATIM and in order, split across the panels where it is spoken; never invent, drop or reorder lines. One line longer than about 20 words is split into two consecutive balloons of the same speaker. At most two balloons per panel. "speaker" is the character's name exactly as in the cast list.
- "caption": the line under the panel — a short narration, time/place note, inner thought, sound or scene description (at most 14 words), or "" when the panel needs none. Never repeat a balloon's words in the caption. Write captions and balloons in ${langName}.
- "image_prompt": in ENGLISH. Describe only the picture of this ONE panel: the framing and angle, who is where in the frame (left / right / foreground / background), poses, expressions, gestures, the place and light, and where the clear space for balloons is. Refer to people by their names from the cast list. No dialogue, no text, no balloons in the picture.
- "framing": shot size and angle in a few words (e.g. "wide establishing, high angle", "close-up, eye level").
- "characters": the names of the cast members visible in the panel.`,
    maxTokens: 9000,
    user: `FILM: ${project.title}
SCENE ${sceneIdx + 1}: ${scene.title} — ${scene.summary || ''}
${places ? `PLACES: ${places}\n` : ''}
CAST:
${cast || '(none)'}

${list}

Plan a comic screen for every shot not marked "context only". Return them in order.

JSON schema:
{"screens":[{"shot":1,"layout":"heroTop","panels":[{"framing":"wide establishing, eye level","characters":["Name"],"image_prompt":"...","caption":"...","bubbles":[{"speaker":"Name","text":"..."}]}]}]}`,
  };
}

// The planner's answer → { [shotId]: Screen }. Panel ids are kept where the
// shot already had panels, so drawn images stay with their panel.
export function screensFromPlan(project, scene, shots, data) {
  const all = project.sceneDetails?.[scene.id]?.shots || [];
  const out = {};
  for (const s of data?.screens || []) {
    const shot = all[(Number(s.shot) || 0) - 1];
    if (!shot || !shots.some((x) => x.id === shot.id)) continue;
    const layout = layoutOf(s.layout).id;
    const n = layoutOf(layout).panels;
    const prev = screenOf(project, shot).panels || [];
    const panels = (Array.isArray(s.panels) ? s.panels : []).slice(0, n).map((p, i) =>
      newPanel({
        id: prev[i]?.id || `${shot.id}_p${i + 1}`,
        framing: String(p.framing || ''),
        characters: Array.isArray(p.characters) ? p.characters.map(String) : [],
        prompt: String(p.image_prompt || p.prompt || ''),
        caption: String(p.caption || ''),
        bubbles: (Array.isArray(p.bubbles) ? p.bubbles : [])
          .filter((b) => String(b?.text || '').trim())
          .slice(0, 3)
          .map((b) => newBubble({ speaker: String(b.speaker || ''), text: String(b.text).trim() })),
      })
    );
    while (panels.length < n) panels.push(newPanel({ id: prev[panels.length]?.id || `${shot.id}_p${panels.length + 1}` }));
    out[shot.id] = { layout, planned: true, panels };
  }
  return out;
}

// Did the plan keep the script's words? (a soft check shown to the user)
export function lostLines(shot, screen) {
  const said = (screen.panels || []).flatMap((p) => p.bubbles || []).map((b) => b.text).join(' ').toLowerCase();
  return parseDialogue(shot.dialogue).filter((l) => {
    const words = l.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return words.length && words.filter((w) => said.includes(w.replace(/[^\p{L}\p{N}]/gu, ''))).length < words.length / 2;
  });
}

export const panelRatio = (layout, i) => {
  const b = screenPanels(layout)[i];
  return b ? nearestRatio(b.w, b.h) : '1:1';
};
