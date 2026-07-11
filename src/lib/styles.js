// Global, reusable "style library". Three independent categories:
//   script — rules for writing the script text (stages 1–4)
//   image  — visual rules for image prompts, cover art and in-app image generation
//   video  — cinematic rules for video prompts
// Each style is { id, name, instructions }. Projects reference a style per
// category by id (empty id = neutral / no extra rules).
const STYLES_KEY = 'storyreel.styles.v1';
export const STYLE_CATEGORIES = ['script', 'image', 'video'];

function sid() {
  return 'st_' + Math.random().toString(36).slice(2, 10);
}

export function newStyle() {
  return { id: sid(), name: '', instructions: '' };
}

function seedDefaults() {
  return {
    script: [
      { id: sid(), name: 'Literary', instructions: 'Write the script text in a literary, prose-rich style: vivid evocative language, a strong genre voice, subtext over on-the-nose dialogue, and texture in the action lines.' },
      { id: sid(), name: 'Punchy commercial', instructions: 'Write in a tight advertising voice: a clear hook in the first seconds, one memorable idea, short punchy beats, and an implicit call to action. No wasted words.' },
      { id: sid(), name: 'Documentary', instructions: 'Write in a grounded, observational documentary style: naturalistic dialogue, concrete real-world detail, understated emotion, no theatricality.' },
    ],
    image: [
      { id: sid(), name: 'Cinematic realism', instructions: 'Photorealistic cinematic look: 35mm anamorphic, natural motivated lighting, shallow depth of field, filmic color grade, realistic skin and textures.' },
      { id: sid(), name: 'Film noir', instructions: 'High-contrast black-and-white film noir: hard chiaroscuro lighting, deep shadows, venetian-blind light shafts, rain-slick streets, moody atmosphere.' },
      { id: sid(), name: 'Anime', instructions: 'Modern cel-shaded anime illustration: clean linework, expressive faces, vibrant flat colour with soft gradients, dramatic key light, detailed painted backgrounds.' },
      { id: sid(), name: 'Watercolor', instructions: 'Soft hand-painted watercolour illustration: visible paper texture, bleeding pigments, gentle washes, loose edges, a muted organic palette.' },
    ],
    video: [
      { id: sid(), name: 'Handheld documentary', instructions: 'Naturalistic handheld camera: subtle breathing movement, quick reframes, imperfect follow focus, vérité energy — motivated and unshowy.' },
      { id: sid(), name: 'Epic cinematic', instructions: 'Sweeping cinematic motion: slow dollies, cranes and orbits, deliberate push-ins on emotional beats, smooth stabilised moves, grand scale.' },
      { id: sid(), name: 'Static minimalism', instructions: 'Locked-off static compositions or very slow pushes; stillness and negative space — let the action move within a fixed frame.' },
    ],
  };
}

export function loadStyles() {
  try {
    const raw = localStorage.getItem(STYLES_KEY);
    if (raw == null) {
      const d = seedDefaults();
      localStorage.setItem(STYLES_KEY, JSON.stringify(d));
      return d;
    }
    const p = JSON.parse(raw) || {};
    return { script: p.script || [], image: p.image || [], video: p.video || [] };
  } catch {
    return { script: [], image: [], video: [] };
  }
}

export function saveStyles(styles) {
  try {
    localStorage.setItem(STYLES_KEY, JSON.stringify(styles));
  } catch (e) {
    console.error('saveStyles failed', e);
  }
}

export function resolveStyleText(styles, category, id) {
  if (!id) return '';
  const s = (styles?.[category] || []).find((x) => x.id === id);
  return s ? (s.instructions || '') : '';
}

// One-time conversion of pre-1.4.0 per-project prompts (systemPrompt /
// imageTemplate / videoTemplate) into library styles. Dedupes by instruction
// text so re-imports don't pile up duplicates. Returns updated copies.
export function absorbLegacyStyles(projects, styles) {
  let changed = false;
  const lib = {
    script: [...(styles.script || [])],
    image: [...(styles.image || [])],
    video: [...(styles.video || [])],
  };
  const map = [
    ['systemPrompt', 'script', 'scriptStyleId'],
    ['imageTemplate', 'image', 'imageStyleId'],
    ['videoTemplate', 'video', 'videoStyleId'],
  ];
  const nextProjects = projects.map((p) => {
    let np = p;
    for (const [legacyKey, cat, idKey] of map) {
      if (legacyKey in np) {
        const val = (np[legacyKey] || '').trim();
        if (val) {
          let existing = lib[cat].find((s) => (s.instructions || '').trim() === val);
          if (!existing) {
            existing = { id: sid(), name: `${(p.title || 'Imported').slice(0, 24)} — imported`, instructions: val };
            lib[cat].push(existing);
          }
          np = { ...np, [idKey]: existing.id };
        }
        np = { ...np };
        delete np[legacyKey];
        changed = true;
      }
    }
    return np;
  });
  return { projects: nextProjects, styles: lib, changed };
}
