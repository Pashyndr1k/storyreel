// Colour code for how far a project has come:
//   stage 1      — green, the idea is still forming
//   stages 2–5   — blue, deepening as the script turns into shots and prompts
//   stage 6       — the app's violet, unchanged: ready for the final cut
const STAGE_TINTS = {
  1: '#34d399', // emerald
  2: '#7dd3fc', // sky
  3: '#38bdf8',
  4: '#3b82f6',
  5: '#2563eb', // deep blue
  6: '#a855f7', // violet (default accent)
};

export function stageTint(stage) {
  return STAGE_TINTS[Math.max(1, Math.min(Number(stage) || 1, 6))];
}

export function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
