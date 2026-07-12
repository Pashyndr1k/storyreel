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
import videoMotionPresets from '../data/video_motion_presets.json';

const STYLES_KEY = 'storyreel.styles.v1';
const STYLES_BACKUP_KEY = 'storyreel.styles.corrupt'; // last unreadable value, for recovery
export const STYLES_VERSION = 3;
export const STYLE_CATEGORIES = ['script', 'image', 'video'];

// v2 built-ins, imported from text_styles.pdf (script) and visual styles.pdf
// (image). Added idempotently by id during migration so existing libraries gain
// them without touching the user's custom styles.
const BUILTINS_V2 = {
  script: [
    { id: 'bi2.script.commercial_spot', builtin: true, name: 'Short Commercial (Ad Spot)', instructions: 'Write as a fast-paced ad spot. Prioritize visual hooks in the first 3 seconds. Use punchy, persuasive voiceover or minimal dialogue. End with a clear call-to-action or logo reveal. Shot dynamics: rapid editing (1–2 sec shots), dynamic camera moves, high visual density.' },
    { id: 'bi2.script.comedy_skit', builtin: true, name: 'Short Comedy Skit', instructions: 'Format as a digital comedy sketch. Focus on conversational timing, awkward pauses, and escalating absurdity. Keep dialogue sharp and punchy. Include specific physical comedy cues. Shot dynamics: medium shots for dialogue, heavy use of quick reaction shots and zoom-ins for comedic effect.' },
    { id: 'bi2.script.animated_film', builtin: true, name: 'Short Animated Film', instructions: 'Write for 3D/2D animation. Lean heavily on "show, don\'t tell." Describe exaggerated physical reactions and imaginative environments. Keep dialogue minimal; let visual gags drive the story. Shot dynamics: fluid, continuous camera movements; longer takes (4–6 sec) to establish complex environments.' },
    { id: 'bi2.script.indie_drama', builtin: true, name: 'Short Drama (Indie)', instructions: 'Write as an indie dramatic short. Focus on internal conflict, unspoken tension, and subtext. Describe character micro-expressions. Dialogue should feel naturalistic and sparse. Shot dynamics: slow pacing (5–8 sec shots), lingering close-ups, shallow depth of field, static camera lock-offs.' },
    { id: 'bi2.script.thriller', builtin: true, name: 'Intense Cinematic Thriller', instructions: 'Format as a suspense thriller. Build tension through withheld information and sensory details. Focus on character breathing, footsteps, and hidden threats. Keep action descriptions visceral. Shot dynamics: rhythmic editing that accelerates; intercutting between extreme close-ups and wide isolation shots.' },
    { id: 'bi2.script.anime_action', builtin: true, name: 'Anime (Shonen/Action)', instructions: 'Write as a stylized anime storyboard. Emphasize inner monologues, dramatic pauses, and explosive action. Name specific dynamic poses. Elevate emotional stakes to maximum intensity. Shot dynamics: extreme close-ups on eyes, rapid speed-line action cuts (1 sec), sweeping rotational camera moves.' },
    { id: 'bi2.script.mockumentary', builtin: true, name: 'Mockumentary / Verité', instructions: 'Format as a mockumentary. Include breaking the fourth wall, talking-head interviews, and chaotic background events. Characters should interrupt each other and acknowledge the camera. Shot dynamics: shaky-cam handheld tracking, snap-zooms to reactions, whip pans between speaking characters.' },
    { id: 'bi2.script.visual_poem', builtin: true, name: 'Visual Poem / Arthouse', instructions: 'Write as an experimental visual poem. Disconnect literal action from the voiceover. Focus on associative imagery, elemental motifs (water, fire, shadow), and rhythmic pacing. Shot dynamics: non-linear editing, dreamlike slow-motion takes, experimental juxtaposition of unrelated imagery.' },
  ],
  image: [
    { id: 'bi2.image.panavision_70s', builtin: true, name: '1970s Panavision', instructions: 'shot on 35mm film, Panavision anamorphic lens, warm golden halation, slight organic film grain, desaturated vintage colors. Avoid: digital noise reduction, pristine, 8k, modern, hyper-detailed, clean digital artifacts.' },
    { id: 'bi2.image.cyberpunk_neon', builtin: true, name: 'Cyberpunk Neon', instructions: 'cinematic neo-noir, high contrast chiaroscuro lighting, heavy neon reflections on wet surfaces, 50mm f/1.8, cool blue and magenta grading. Avoid: daylight, flat lighting, natural sunlight, pastel, soft focus, sunny, cheerful.' },
    { id: 'bi2.image.doc_handheld', builtin: true, name: 'Documentary Handheld', instructions: 'documentary style, handheld camera movement, natural ambient lighting, 16mm film stock, unpolished realism, deep depth of field. Avoid: studio lighting, perfect composition, posed, high fashion, cinematic 3-point lighting.' },
    { id: 'bi2.image.clean_corporate', builtin: true, name: 'Clean Corporate Modern', instructions: 'high-key lighting, soft diffused shadows, minimalist composition, pristine depth of field, 85mm lens f/2.8, hyper-crisp 8k resolution, neutral color balance. Avoid: film grain, dirt, grit, chromatic aberration, vignette, vintage, messy, dark.' },
    { id: 'bi2.image.gothic_fantasy', builtin: true, name: 'Gothic / Dark Fantasy', instructions: 'low-key dramatic lighting, deep shadows, desaturated cool tones, ethereal atmosphere, heavy volumetric fog, 24mm wide angle. Avoid: bright, cheerful, high-key lighting, saturated, neon, daytime, sunny, warm tones.' },
    { id: 'bi2.image.french_new_wave', builtin: true, name: 'French New Wave', instructions: 'black and white 35mm film, high contrast Kodak Tri-X, handheld 35mm lens, naturalistic window light, intimate composition, vintage indie film. Avoid: color, modern lighting, high budget, artificial lighting, saturated, hyper-polished.' },
    { id: 'bi2.image.imax_epic', builtin: true, name: 'IMAX Epic Sci-Fi', instructions: 'IMAX 70mm film, sweeping anamorphic framing, atmospheric haze, razor-sharp details, teal and orange cinematic color grading, directed by Denis Villeneuve. Avoid: low resolution, grainy, claustrophobic framing, flat lighting, amateur video, vintage.' },
    { id: 'bi2.image.sun_nostalgia', builtin: true, name: 'Sun-Drenched Nostalgia', instructions: 'golden hour lighting, warm pastel color palette, soft focus vintage lens, dreamy bokeh, Kodak Portra 400 film stock, romantic nostalgic atmosphere. Avoid: dark, moody, high contrast, harsh shadows, cold blue tones, cyberpunk, grim.' },
    { id: 'bi2.image.fashion_editorial', builtin: true, name: 'High-Fashion Editorial', instructions: 'studio fashion lighting, harsh directional strobe, deep contrast, vibrant stylized color grading, 100mm macro lens, ultra-detailed skin textures. Avoid: candid, unposed, natural ambient lighting, messy, amateur, low resolution, soft focus.' },
    { id: 'bi2.image.surreal_pop', builtin: true, name: 'Surreal Pop', instructions: 'extreme symmetrical framing, flat space composition, meticulously curated pastel color palette, soft natural lighting, wide-angle lens, Wes Anderson style. Avoid: handheld movement, gritty, dark noir, messy composition, realistic stark lighting, asymmetrical.' },
    { id: 'bi2.image.pixar_3d', builtin: true, name: 'Pixar 3D Magic', instructions: '3D animation, Disney Pixar style, soft subsurface scattering skin, expressive stylized features, rich saturated colors, cinematic clay-shader lighting. Avoid: photorealistic, real human, live action, gritty, high-contrast, edge-lighting, rough textures, messy sketching.' },
    { id: 'bi2.image.retro_90s_anime', builtin: true, name: 'Retro 90s Anime', instructions: '90s anime style, vintage hand-drawn cel animation, retro aesthetic, distinct line art, flat colors, soft film grain, nostalgic colors, Studio Ghibli aesthetic. Avoid: 3D render, CGI, digital painting, modern glossy shading, vector art, photorealism, depth of field.' },
    { id: 'bi2.image.modern_anime', builtin: true, name: 'Modern Cinematic Anime', instructions: 'modern anime style, stunning cinematic lighting, hyper-detailed sky and environment, lens flares, vibrant color grading, intricate linework, breathtaking composition (Makoto Shinkai / CoMix Wave style). Avoid: retro anime, old cel animation, 3D, pixelated, rough sketch, monotone, minimal detail.' },
    { id: 'bi2.image.claymation', builtin: true, name: 'Claymation / Stop-Motion', instructions: 'claymation style, stop-motion animation, visible thumbprint textures, tactile modeling clay surfaces, slightly uneven sculpting, mini studio lighting. Avoid: smooth 3D render, pristine CGI, photorealistic human, fluid digital movement, vector, flat illustration.' },
    { id: 'bi2.image.vintage_comic', builtin: true, name: 'Vintage Comic Book', instructions: 'vintage comic book illustration, hand-inked linework, classic ben-day dots, halftone shading, retro color printing, distressed paper texture, dynamic framing. Avoid: 3D, smooth gradient shading, photo, CGI, high-end digital painting, clean vector line art.' },
    { id: 'bi2.image.spiderverse', builtin: true, name: 'Stylized "Spider-Verse" 3D', instructions: 'stylized 3D animation, comic book overlay, chromatic aberration, halftone textures, hand-painted textures, dynamic screen-tones, stylized motion blur. Avoid: standard 3D render, generic CGI, photorealism, flat 2D, smooth shading, boring composition.' },
    { id: 'bi2.image.whimsical_watercolor', builtin: true, name: 'Whimsical Watercolor', instructions: 'whimsical watercolor animation, soft bleeding ink edges, visible textured paper grain, pastel color palette, hand-drawn sketch overlay, charming indie style. Avoid: sharp lines, clean vectors, 3D render, neon, high contrast, dark noir, photorealistic.' },
    { id: 'bi2.image.pixel_art', builtin: true, name: 'Chunky Retro Pixel Art', instructions: 'high-quality pixel art style, isometric view, vibrant 32-bit color palette, crisp grid placement, retro video game aesthetic, clean pixel clusters. Avoid: smooth curves, anti-aliasing, 3D render, gradient shading, photographic blur, blurry lines.' },
    { id: 'bi2.image.mecha_anime', builtin: true, name: 'Cyberpunk Mecha Anime', instructions: 'cyberpunk mecha anime, hand-drawn machinery, intricate mechanical details, harsh neon sparks, smoke and debris, dark moody industrial tones, grit (80s/90s OVA style). Avoid: cute anime, chibi, clean 3D render, friendly cartoon, bright pastel, corporate minimalism.' },
    { id: 'bi2.image.gothic_stopmotion', builtin: true, name: 'Gothic Stop-Motion', instructions: 'dark gothic stop-motion style, elongated surreal character proportions, burlap and stitch textures, moody dramatic shadows, desaturated Victorian color palette (Tim Burton / Henry Selick style). Avoid: bright, cheerful, corporate, smooth Pixar 3D, colorful, shiny plastic, real human.' },
  ],
  video: [],
};

// v3 built-ins: video motion styles from video_motion_presets.json. The
// instructions text is the raw prompt_injection — it is substituted into the
// {{VIDEO_STYLE_INJECTION}} slot of the Video Motion system instruction.
const BUILTINS_V3 = {
  script: [],
  image: [],
  video: videoMotionPresets.map((p) => ({
    id: `bi3.video.${p.id}`,
    builtin: true,
    name: p.name,
    instructions: p.prompt_injection,
  })),
};

// The v1 factory video styles predate the Video Motion instruction and are
// superseded by the v3 presets. During the v3 migration they are removed —
// but only if the user never edited them (instructions still factory text).
const RETIRED_V3_VIDEO = {
  'bi.video.handheld': 'Naturalistic handheld camera: subtle breathing movement, quick reframes, imperfect follow focus, vérité energy — motivated and unshowy.',
  'bi.video.epic': 'Sweeping cinematic motion: slow dollies, cranes and orbits, deliberate push-ins on emotional beats, smooth stabilised moves, grand scale.',
  'bi.video.static': 'Locked-off static compositions or very slow pushes; stillness and negative space — let the action move within a fixed frame.',
};

function addMissingBuiltins(styles, additions) {
  const out = { ...styles };
  for (const cat of STYLE_CATEGORIES) {
    const have = new Set((out[cat] || []).map((s) => s.id));
    const extra = (additions[cat] || []).filter((s) => !have.has(s.id));
    if (extra.length) out[cat] = [...(out[cat] || []), ...extra];
  }
  return out;
}

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
  if (fromVersion < 2) {
    // v2: add the PDF-imported built-ins (idempotent by id).
    s = addMissingBuiltins(s, BUILTINS_V2);
  }
  if (fromVersion < 3) {
    // v3: retire the factory video styles (unless the user edited them) and
    // add the Video Motion presets (idempotent by id).
    s = {
      ...s,
      video: (s.video || []).filter(
        (st) => !(st.id in RETIRED_V3_VIDEO && (st.instructions || '') === RETIRED_V3_VIDEO[st.id])
      ),
    };
    s = addMissingBuiltins(s, BUILTINS_V3);
  }
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
    return migrate(1, seedDefaults());
  }
  if (raw == null) {
    const d = migrate(1, seedDefaults());
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
    const migrated = migrate(version, stored);
    if (version < STYLES_VERSION) {
      try {
        persist(migrated); // bump the stored envelope so migration runs once
      } catch {
        /* best-effort */
      }
    }
    return migrated;
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
    return migrate(1, seedDefaults());
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
