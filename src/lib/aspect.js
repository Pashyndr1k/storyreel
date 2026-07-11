// Aspect ratios offered per project. Values map 1:1 to Gemini's imageConfig
// aspectRatio, and w/h drive the proportioned selector glyphs.
export const ASPECT_RATIOS = [
  { value: '16:9', w: 16, h: 9 },
  { value: '4:3', w: 4, h: 3 },
  { value: '1:1', w: 1, h: 1 },
  { value: '3:4', w: 3, h: 4 },
  { value: '9:16', w: 9, h: 16 },
];

export const DEFAULT_ASPECT = '16:9';

const DESCRIPTIONS = {
  '16:9': '16:9 widescreen landscape',
  '4:3': '4:3 standard landscape',
  '1:1': '1:1 square',
  '3:4': '3:4 portrait',
  '9:16': '9:16 vertical portrait',
};

export function isValidAspect(v) {
  return Object.prototype.hasOwnProperty.call(DESCRIPTIONS, v);
}

export function aspectDescription(v) {
  return DESCRIPTIONS[v] || DESCRIPTIONS[DEFAULT_ASPECT];
}
