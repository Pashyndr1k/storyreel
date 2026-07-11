// Global, reusable "style library". Three independent categories:
//   script — rules for writing the script text (stages 1–4)
//   image  — visual rules for image prompts, cover art and in-app image generation
//   video  — cinematic rules for video prompts
// Each style is { id, name, instructions, builtin? }. Projects reference a style
// per category by id (empty id = neutral / no extra rules).
//
// Durability across versions: the store is a versioned envelope
//   { version, styles: { script, image, video } }
// so future format changes migrate old data forward instead of dropping it.
// Custom styles are only ever seeded on first run and are never overwritten by
// defaults on later launches. They are also included in Settings → Backup.
const STYLES_KEY = 'storyreel.styles.v1';
const STYLES_BACKUP_KEY = 'storyreel.styles.corrupt'; // last unreadable value, for recovery
export const STYLES_VERSION = 1;
export const STYLE_CATEGORIES = ['script', 'image', 'video'];

function sid() {
  return 'st_' + Math.random().toString(36).slice(2, 10);
}

export function newStyle() {
  return { id: sid(), name: '', instructions: '' };
}

// Built-in defaults use stable ids so future versions can add new built-ins
// idempotently (by id) without clobbering or duplicating a user's library.
function seedDefaults() {
  return {
    script: [
      { id: 'bi.script.literary', builtin: true, name: 'Literary', instructions: 'Write the script text in a literary, prose-rich style: vivid evocative language, a strong genre voice, subtext over on-the-nose dialogue, and texture in the action lines.' },
      { id: 'bi.script.commercial', builtin: true, name: 'Punchy commercial', instructions: 'Write in a tight advertising voice: a clear hook in the first seconds, one memorable idea, short punchy beats, and an implicit call to action. No wasted words.' },
      { id: 'bi.script.documentary', builtin: true, name: 'Documentary', instructions: 'Write in a grounded, observational documentary style: naturalistic dialogue, concrete real-world detail, understated emotion, no theatricality.' },
    ],
    image: [
      { id: 'bi.image.realism', builtin: true, name: 'Cinematic realism', instructions: 'Photorealistic cinematic look: 35mm anamorphic, natural motivated lighting, shallow depth of field, filmic color grade, realistic skin and textures.' },
      { id: 'bi.image.noir', builtin: true, name: 'Film noir', instructions: 'High-contrast black-and-white film noir: hard chiaroscuro lighting, deep shadows, venetian-blind light shafts, rain-slick streets, moody atmosphere.' },
      { id: 'bi.image.anime', builtin: true, name: 'Anime', instructions: 'Modern cel-shaded anime illustration: clean linework, expressive faces, vibrant flat colour with soft gradients, dramatic key light, detailed painted backgrounds.' },
      { id: 'bi.image.watercolor', builtin: true, name: 'Watercolor', instructions: 'Soft hand-painted watercolour illustration: visible paper texture, bleeding pigments, gentle washes, loose edges, a muted organic palette.' },
    ],
    video: [
      { id: 'bi.video.handheld', builtin: true, name: 'Handheld documentary', instructions: 'Naturalistic handheld camera: subtle breathing movement, quick reframes, imperfect follow focus, vérité energy — motivated and unshowy.' },
      { id: 'bi.video.epic', builtin: true, name: 'Epic cinematic', instructions: 'Sweeping cinematic motion: slow dollies, cranes and orbits, deliberate push-ins on emotional beats, smooth stabilised moves, grand scale.' },
      { id: 'bi.video.static', builtin: true, name: 'Static minimalism', instructions: 'Locked-off static compositions or very slow pushes; stillness and negative space — let the action move within a fixed frame.' },
    ],
  };
}

function normalize(styles) {
  const out = {};
  for (const c of STYLE_CATEGORIES) out[c] = Array.isArray(styles?.[c]) ? styles[c] : [];
  return out;
}

// Apply sequential migrations from `fromVersion` up to STYLES_VERSION. New cases
// are added here as the schema evolves; existing user styles pass through intact.
function migrate(fromVersion, styles) {
  let s = normalize(styles);
  // (no migrations yet — v1 is current)
  return s;
}

function persist(styles) {
  localStorage.setItem(STYLES_KEY, JSON.stringify({ version: STYLES_VERSION, styles: normalize(styles) }));
}

export function loadStyles() {
  let raw;
  try {
    raw = localStorage.getItem(STYLES_KEY);
  } catch {
    return seedDefaults();
  }
  if (raw == null) {
    const d = seedDefaults();
    try {
      persist(d);
    } catch {
      /* seeding is best-effort */
    }
    return d;
  }
  try {
    const parsed = JSON.parse(raw);
    // Versioned envelope, or the pre-envelope { script, image, video } shape.
    const version = typeof parsed?.version === 'number' ? parsed.version : 1;
    const stored = parsed?.styles ? parsed.styles : parsed;
    return migrate(version, stored);
  } catch (e) {
    // Don't destroy an unreadable value — stash it so it can be recovered, and
    // fall back to defaults in memory (App skips the initial save, so the stashed
    // data isn't overwritten unless the user actively edits the library).
    console.error('loadStyles: unreadable style data, backed up for recovery', e);
    try {
      localStorage.setItem(STYLES_BACKUP_KEY, raw);
    } catch {
      /* ignore */
    }
    return seedDefaults();
  }
}

export function saveStyles(styles) {
  try {
    persist(styles);
  } catch (e) {
    console.error('saveStyles failed', e);
  }
}

export function resolveStyleText(styles, category, id) {
  if (!id) return '';
  const s = (styles?.[category] || []).find((x) => x.id === id);
  return s ? (s.instructions || '') : '';
}

// Union two libraries by style id (incoming wins on conflict). Used when
// importing a backup so a user's existing custom styles are never lost.
export function mergeStyles(base, incoming) {
  const out = {};
  for (const c of STYLE_CATEGORIES) {
    const map = new Map((base?.[c] || []).map((s) => [s.id, s]));
    for (const s of incoming?.[c] || []) if (s && s.id) map.set(s.id, s);
    out[c] = [...map.values()];
  }
  return out;
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
