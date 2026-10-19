// Graphic novel data. A graphic novel is a short-drama series project
// (Short Drama 2 story pipeline, 9:16) with format 'novel': Stage 5 builds a
// vertical feed of comic SCREENS instead of a video.
//
// project.novel = { screens: { [shotId]: Screen } }
//   Screen = { layout: 'stack2' | 'stack3' | 'heroTop' | 'heroBottom',
//              panels: [Panel], planned: bool }
//   Panel  = { id, framing, characters: [name], prompt, caption,
//              bubbles: [{ id, speaker, text, tail: 'auto'|'left'|'right'|'none', x?, y? }] }
// project.panelImages = { [panelId]: dataURL } — media (lib/projectFiles.js)
import { LAYOUT_IDS, layoutOf } from './layout.js';

export const isNovel = (p) => p?.format === 'novel';

const rid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;

export function newPanel(patch = {}) {
  return { id: rid('pn'), framing: '', characters: [], prompt: '', caption: '', bubbles: [], ...patch };
}
export function newBubble(patch = {}) {
  return { id: rid('bb'), speaker: '', text: '', tail: 'auto', ...patch };
}

// "NAME: line", "NAME (tone): line", several lines separated by newlines or " / "
export function parseDialogue(dialogue) {
  return String(dialogue || '')
    .split(/\n+|\s+\/\s+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]{1,40}?)(?:\s*\([^)]*\))?\s*:\s*(.+)$/);
      return m ? { speaker: m[1].trim(), text: m[2].trim().replace(/^["«“]|["»”]$/g, '') } : { speaker: '', text: l };
    });
}

// The screen of a shot with exactly as many panels as its layout holds
// (missing panels are created empty; extra ones are kept but hidden, so
// switching layouts back and forth loses nothing).
export function screenOf(project, shot) {
  const s = project?.novel?.screens?.[shot?.id];
  if (s && LAYOUT_IDS.includes(s.layout)) return s;
  // never planned: two tiers — the shot's action, its dialogue across both panels
  const lines = parseDialogue(shot?.dialogue);
  const half = Math.ceil(lines.length / 2);
  return {
    layout: 'stack2',
    planned: false,
    panels: [
      newPanel({ id: `${shot?.id}_p1`, prompt: shot?.action || '', framing: shot?.shotType || '', bubbles: lines.slice(0, half).map((l, k) => newBubble({ id: `${shot?.id}_p1_b${k}`, ...l })) }),
      newPanel({ id: `${shot?.id}_p2`, prompt: '', bubbles: lines.slice(half).map((l, k) => newBubble({ id: `${shot?.id}_p2_b${k}`, ...l })) }),
    ],
  };
}

export const visiblePanels = (screen) => {
  const n = layoutOf(screen.layout).panels;
  const out = (screen.panels || []).slice(0, n);
  while (out.length < n) out.push(newPanel({ id: `${screen.panels?.[0]?.id || 'pn'}_x${out.length}` }));
  return out;
};

export function normalizeNovel(raw) {
  const screens = {};
  for (const [id, s] of Object.entries(raw?.screens || {})) {
    if (!s || typeof s !== 'object') continue;
    screens[id] = {
      layout: LAYOUT_IDS.includes(s.layout) ? s.layout : 'stack2',
      planned: !!s.planned,
      panels: (Array.isArray(s.panels) ? s.panels : []).map((p) => ({
        id: String(p?.id || rid('pn')),
        framing: String(p?.framing || ''),
        characters: Array.isArray(p?.characters) ? p.characters.map(String) : [],
        prompt: String(p?.prompt || ''),
        caption: String(p?.caption || ''),
        bubbles: (Array.isArray(p?.bubbles) ? p.bubbles : []).map((b) => ({
          id: String(b?.id || rid('bb')),
          speaker: String(b?.speaker || ''),
          text: String(b?.text || ''),
          tail: ['auto', 'left', 'right', 'none'].includes(b?.tail) ? b.tail : 'auto',
          ...(Number.isFinite(b?.x) && Number.isFinite(b?.y) ? { x: b.x, y: b.y } : {}),
        })),
      })),
    };
  }
  return { screens };
}

// Every screen of the project in feed order: [{ scene, shot, screen, sceneIndex, shotIndex }]
export function feedOf(project) {
  const out = [];
  (project?.outline || []).forEach((scene, si) => {
    (project.sceneDetails?.[scene.id]?.shots || []).forEach((shot, k) => {
      out.push({ scene, shot, screen: screenOf(project, shot), sceneIndex: si, shotIndex: k });
    });
  });
  return out;
}
