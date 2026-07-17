// Lightweight structural highlighter for generation prompts. It tints words and
// phrases by the role they play in an image/video prompt so the writer can see a
// prompt's structure at a glance:
//   style — the visual/art-direction language (cinematic, watercolor, moody…)
//   scene — where/when it happens (interior, rooftop, dusk, forest…)
//   char  — the people in frame (character names + person/wardrobe words)
//   tech  — lighting and camera/technical detail (backlit, bokeh, 35mm, 4k…)
// This is a deliberately simple keyword pass, not NLP: it aims for a helpful,
// subtle hint, and anything it doesn't recognize stays the default text color.

const KEYWORDS = {
  // Order matters only for cross-list duplicates: the first list to claim a
  // word wins (tech → char → style → scene).
  tech: [
    'lighting', 'lit', 'backlit', 'backlight', 'backlighting', 'rim light', 'rim lighting',
    'key light', 'fill light', 'side lighting', 'top lighting', 'underlighting', 'softbox',
    'soft light', 'hard light', 'diffused light', 'ambient light', 'natural light',
    'artificial light', 'low-key lighting', 'high-key lighting', 'low key', 'high key',
    'chiaroscuro', 'volumetric lighting', 'volumetric', 'god rays', 'light rays', 'sunbeams',
    'lens flare', 'glow', 'glowing', 'bloom', 'haze', 'silhouette', 'shadow', 'shadows',
    'highlights', 'contrast', 'high contrast', 'low contrast', 'golden hour', 'blue hour',
    'neon', 'neon lights', 'spotlight', 'floodlight', 'candlelight', 'firelight', 'moonlight',
    'sunlight', 'dappled light', 'reflections', 'specular', 'ambient occlusion',
    'depth of field', 'shallow depth of field', 'deep focus', 'bokeh', 'blurred background',
    'out of focus', 'motion blur', 'sharp focus', 'tack sharp', 'close-up', 'closeup',
    'extreme close-up', 'medium shot', 'medium close-up', 'wide shot', 'wide-angle',
    'wide angle', 'ultra-wide', 'telephoto', 'macro', 'fisheye', 'overhead shot', 'top-down',
    "bird's-eye", 'birds-eye', 'aerial', 'drone shot', 'low angle', 'high angle', 'dutch angle',
    'eye level', 'over-the-shoulder', 'pov', 'point of view', 'establishing shot', 'two-shot',
    'tracking shot', 'dolly', 'dolly zoom', 'crane shot', 'steadicam', 'handheld', 'panning',
    'tilt', 'zoom', 'push in', 'pull out', 'focal length', 'anamorphic', 'anamorphic lens',
    'cinemascope', 'widescreen', 'aspect ratio', 'shot on', 'film grain', 'grain', 'iso',
    'exposure', 'long exposure', 'overexposed', 'underexposed', 'hdr', '4k', '8k', 'uhd',
    'ultra hd', 'high resolution', 'ultra-detailed', 'highly detailed', 'hyperdetailed',
    'intricate detail', 'sharpness', 'saturation', 'vignette', 'color grading', 'color grade',
    'teal and orange', 'white balance', 'composition', 'rule of thirds', 'framing', 'symmetry',
    'symmetrical', 'leading lines', 'negative space',
  ],
  char: [
    'man', 'woman', 'men', 'women', 'boy', 'girl', 'child', 'children', 'person', 'people',
    'figure', 'character', 'protagonist', 'hero', 'heroine', 'villain', 'crowd', 'wearing',
    'dressed', 'clothed', 'outfit', 'clothing', 'costume', 'jacket', 'coat', 'dress', 'gown',
    'suit', 'shirt', 'trousers', 'jeans', 'hat', 'scarf', 'gloves', 'boots', 'shoes', 'armor',
    'uniform', 'cape', 'robe', 'hair', 'beard', 'mustache', 'eyes', 'gaze', 'face', 'facial',
    'expression', 'smile', 'smiling', 'frowning', 'scowling', 'laughing', 'crying', 'standing',
    'sitting', 'seated', 'kneeling', 'crouching', 'lying', 'walking', 'running', 'sprinting',
    'jumping', 'leaping', 'holding', 'gripping', 'reaching', 'pointing', 'gesturing', 'hands',
    'arms', 'shoulders', 'posture', 'stance', 'skin', 'young', 'old', 'elderly', 'middle-aged',
  ],
  style: [
    'cinematic', 'photorealistic', 'hyperrealistic', 'photoreal', 'realistic', 'stylized',
    'painterly', 'illustrative', 'illustration', 'anime', 'manga', 'cartoon', 'watercolor',
    'oil painting', 'gouache', 'sketch', 'charcoal', 'line art', 'concept art', 'digital art',
    '3d render', 'cgi', 'unreal engine', 'octane render', 'film noir', 'noir', 'vintage',
    'retro', 'cyberpunk', 'steampunk', 'surreal', 'surrealist', 'minimalist', 'baroque',
    'impressionist', 'expressionist', 'gothic', 'art style', 'aesthetic', 'mood', 'tone',
    'atmosphere', 'moody', 'dreamy', 'ethereal', 'gritty', 'whimsical', 'epic', 'muted colors',
    'muted palette', 'vibrant', 'saturated colors', 'pastel', 'monochrome', 'monochromatic',
    'sepia', 'black and white', 'color palette', 'palette', 'matte painting', 'storybook',
    'comic', 'studio ghibli', 'wes anderson',
  ],
  scene: [
    'interior', 'exterior', 'indoors', 'outdoors', 'inside', 'outside', 'room', 'hallway',
    'corridor', 'staircase', 'kitchen', 'bedroom', 'living room', 'bathroom', 'office',
    'warehouse', 'factory', 'bar', 'cafe', 'restaurant', 'club', 'street', 'alley', 'alleyway',
    'sidewalk', 'rooftop', 'roof', 'city', 'cityscape', 'downtown', 'village', 'town',
    'countryside', 'forest', 'woods', 'jungle', 'desert', 'beach', 'shore', 'coast', 'ocean',
    'sea', 'lake', 'river', 'mountain', 'valley', 'field', 'meadow', 'park', 'garden',
    'courtyard', 'bridge', 'tunnel', 'subway', 'train station', 'airport', 'harbor', 'docks',
    'castle', 'temple', 'church', 'cathedral', 'ruins', 'cave', 'spaceship', 'landscape',
    'background', 'foreground', 'setting', 'environment', 'skyline', 'horizon', 'night', 'day',
    'dawn', 'dusk', 'sunset', 'sunrise', 'midnight', 'noon', 'evening', 'morning', 'afternoon',
    'twilight', 'overcast', 'foggy', 'rainy', 'snowy', 'stormy', 'misty',
  ],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Numeric technical tokens the keyword lists can't enumerate: focal length
// (35mm), aperture (f/1.8) and aspect ratios (16:9).
const NUMERIC = [String.raw`\b\d{2,3}mm\b`, String.raw`f\/\d(?:\.\d+)?`, String.raw`\b\d{1,2}:\d{1,2}\b`];
const isNumericTech = (s) => /^\d{2,3}mm$/i.test(s) || /^f\/\d/i.test(s) || /^\d{1,2}:\d{1,2}$/.test(s);

// Static phrase→category map, built once.
const BASE_DICT = new Map();
for (const cat of ['tech', 'char', 'style', 'scene']) {
  for (const w of KEYWORDS[cat]) {
    const k = w.toLowerCase();
    if (!BASE_DICT.has(k)) BASE_DICT.set(k, cat);
  }
}
const BASE_PHRASES = [...BASE_DICT.keys()];

// Compiled matcher cache keyed by the character-name signature.
const cache = new Map();
function matcherFor(names) {
  const clean = (names || [])
    .map((n) => String(n || '').trim())
    .filter((n) => n.length >= 2);
  const key = clean.map((n) => n.toLowerCase()).sort().join('|');
  if (cache.has(key)) return cache.get(key);

  const dict = new Map(BASE_DICT);
  const nameWords = [];
  for (const name of clean) {
    dict.set(name.toLowerCase(), 'char');
    nameWords.push(name);
    // Also color individual name words (first/last) when they stand alone.
    for (const part of name.split(/\s+/)) {
      if (part.length >= 3) {
        dict.set(part.toLowerCase(), 'char');
        nameWords.push(part);
      }
    }
  }

  // Longest phrases first so multi-word matches win over their sub-words.
  const phrases = [...new Set([...nameWords, ...BASE_PHRASES])].sort((a, b) => b.length - a.length);
  const alt = [...NUMERIC, ...phrases.map((p) => `\\b${escapeRe(p)}\\b`)].join('|');
  const re = new RegExp(`(${alt})`, 'gi');
  const m = { re, dict };
  cache.set(key, m);
  return m;
}

// Tokenize `text` into [{ text, cat }] spans covering the whole string exactly;
// `cat` is one of style/scene/char/tech, or null for unclassified text.
export function highlightPromptTokens(text, names = []) {
  const src = String(text || '');
  if (!src) return [];
  const { re, dict } = matcherFor(names);
  re.lastIndex = 0;
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index), cat: null });
    const raw = m[0];
    const cat = isNumericTech(raw) ? 'tech' : dict.get(raw.toLowerCase()) || null;
    tokens.push({ text: raw, cat });
    last = m.index + raw.length;
    if (raw.length === 0) re.lastIndex++; // guard against zero-width loops
  }
  if (last < src.length) tokens.push({ text: src.slice(last), cat: null });
  return tokens;
}

export const HIGHLIGHT_CATS = ['style', 'scene', 'char', 'tech'];
