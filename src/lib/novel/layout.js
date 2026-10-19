// Graphic novel geometry: one SCREEN is a 1080 × 1920 (9:16) page divided
// into 2–3 panels by a layout template. Every panel cell is the image box plus
// a caption line below it. Bubbles are measured with the real font so the
// preview (SVG) and the exported PNG (canvas) draw the very same geometry.
// All numbers are in screen units: the dialogue font is the same size on
// every screen and in every panel; only the bubble grows with its text.

export const SCREEN_W = 1080;
export const SCREEN_H = 1920;
const MARGIN = 28;
const GUTTER = 22;
export const CAPTION_H = 84; // the text line under every panel (two lines at most)

export const COMIC_FONT_FAMILY = '"Comic Sans MS", "Comic Sans", "Comic Neue", "Chalkboard SE", cursive';
export const DIALOGUE_SIZE = 34;
export const DIALOGUE_LINE = 41;
export const CAPTION_SIZE = 28;
export const CAPTION_LINE = 33;
const BUBBLE_PAD_X = 26;
const BUBBLE_PAD_Y = 16;
const BUBBLE_MAX_TEXT = 520; // a bubble's text column never exceeds this
const BUBBLE_GAP = 14;
const TAIL_LEN = 46;
export const STROKE = 5; // panel borders and bubble outlines

// The layout templates of the composition tool. rows: the panels per row
// (1 = full width, 2 = side by side); weights: the share of height per row.
export const LAYOUTS = [
  { id: 'stack2', panels: 2, rows: [1, 1], weights: [1, 1] },
  { id: 'stack3', panels: 3, rows: [1, 1, 1], weights: [1, 1, 1] },
  { id: 'heroTop', panels: 3, rows: [1, 2], weights: [1.25, 1] },
  { id: 'heroBottom', panels: 3, rows: [2, 1], weights: [1, 1.25] },
];
export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
export const layoutOf = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

// What each template is for — the planner reads this, the picker shows it.
export const LAYOUT_GUIDE = {
  stack2: 'Two tiers — two equal wide panels: action and reaction, question and answer, before and after. Calm, readable rhythm.',
  stack3: 'Three tiers — three wide strips: a fast sequence of three beats, a chase, rising tension, a countdown. Quick rhythm.',
  heroTop: 'Hero + pair — a large panel on top for the establishing view or the big moment, then two tall panels below for reactions or details.',
  heroBottom: 'Pair + hero — two tall build-up panels on top, then a large panel below for the payoff: a reveal, an impact, the cliffhanger that makes the reader scroll.',
};

// → [{ x, y, w, h, cap: { x, y, w, h } }] in reading order (left→right, top→bottom)
export function screenPanels(layoutId) {
  const L = layoutOf(layoutId);
  const availH = SCREEN_H - 2 * MARGIN - (L.rows.length - 1) * GUTTER;
  const sum = L.weights.reduce((a, b) => a + b, 0);
  const out = [];
  let y = MARGIN;
  L.rows.forEach((cols, r) => {
    const cellH = Math.round((availH * L.weights[r]) / sum);
    const cellW = (SCREEN_W - 2 * MARGIN - (cols - 1) * GUTTER) / cols;
    for (let c = 0; c < cols; c++) {
      const x = Math.round(MARGIN + c * (cellW + GUTTER));
      const w = Math.round(cellW);
      const h = cellH - CAPTION_H;
      out.push({ x, y, w, h, cap: { x, y: y + h, w, h: CAPTION_H } });
    }
    y += cellH + GUTTER;
  });
  return out;
}

// The image ratios the image models take; a panel is drawn at the nearest one
// and cover-cropped into its box.
const RATIOS = [
  ['1:1', 1], ['5:4', 5 / 4], ['4:5', 4 / 5], ['4:3', 4 / 3], ['3:4', 3 / 4],
  ['3:2', 3 / 2], ['2:3', 2 / 3], ['16:9', 16 / 9], ['9:16', 9 / 16], ['21:9', 21 / 9],
];
export function nearestRatio(w, h) {
  const r = w / h;
  return RATIOS.reduce((best, cur) => (Math.abs(Math.log(cur[1] / r)) < Math.abs(Math.log(best[1] / r)) ? cur : best))[0];
}

// ---- text ------------------------------------------------------------------
let measureCtx = null;
function ctx2d() {
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}
// width of `text` at `size` px in the comic font (rough estimate without a DOM)
export function textWidth(text, size) {
  const c = ctx2d();
  if (!c) return String(text).length * size * 0.55;
  c.font = `${size}px ${COMIC_FONT_FAMILY}`;
  return c.measureText(String(text)).width;
}

// Greedy word wrap; a single word longer than the column is split.
export function wrapText(text, size, maxW) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size) <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (textWidth(w, size) <= maxW) cur = w;
    else {
      let piece = '';
      for (const ch of w) {
        if (textWidth(piece + ch, size) > maxW && piece) {
          lines.push(piece);
          piece = ch;
        } else piece += ch;
      }
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// The caption line: up to two lines; longer text is cut with an ellipsis.
export function captionLines(text, w) {
  const lines = wrapText(text, CAPTION_SIZE, w - 32);
  if (lines.length <= 2) return { lines, cut: false };
  let second = lines[1];
  while (second && textWidth(`${second}…`, CAPTION_SIZE) > w - 32) second = second.slice(0, -1);
  return { lines: [lines[0], `${second.trimEnd()}…`], cut: true };
}

// ---- bubbles ---------------------------------------------------------------
// The size a bubble needs for its text inside a panel of width panelW.
export function bubbleSize(text, panelW) {
  const maxText = Math.min(BUBBLE_MAX_TEXT, panelW * 0.72 - 2 * BUBBLE_PAD_X);
  const lines = wrapText(text, DIALOGUE_SIZE, maxText);
  const textW = Math.max(40, ...lines.map((l) => textWidth(l, DIALOGUE_SIZE)));
  return { lines, w: Math.ceil(textW + 2 * BUBBLE_PAD_X), h: Math.ceil(lines.length * DIALOGUE_LINE + 2 * BUBBLE_PAD_Y) };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Every bubble of a panel placed in screen units: [{ ...bubble, x, y, w, h,
// lines, tail: { bx, by, tx, ty } | null }]. A bubble with x/y (fractions of
// the image box, its top-left corner) stays where the user put it; the others
// are laid out in reading order — top first, alternating left and right.
export function placeBubbles(panel, bubbles) {
  const box = panel;
  const out = [];
  let autoY = box.y + 18;
  (bubbles || []).forEach((b, i) => {
    if (!String(b.text || '').trim()) return;
    const s = bubbleSize(b.text, box.w);
    const maxX = box.x + box.w - s.w - 12;
    const maxY = box.y + box.h - s.h - (b.tail === 'none' ? 12 : TAIL_LEN + 8);
    let x;
    let y;
    if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
      x = box.x + b.x * box.w;
      y = box.y + b.y * box.h;
    } else {
      const right = (b.side || (i % 2 ? 'right' : 'left')) === 'right';
      x = right ? maxX : box.x + 18;
      y = autoY;
      autoY = y + s.h + BUBBLE_GAP;
    }
    x = clamp(x, box.x + 12, Math.max(box.x + 12, maxX));
    y = clamp(y, box.y + 12, Math.max(box.y + 12, maxY));
    let tail = null;
    if (b.tail !== 'none') {
      const toRight = b.tail === 'right' || (!b.tail && x + s.w / 2 > box.x + box.w / 2);
      const bx = x + s.w * (toRight ? 0.68 : 0.32);
      const by = y + s.h;
      tail = { bx, by, tx: bx + (toRight ? 34 : -34), ty: by + TAIL_LEN };
    }
    out.push({ ...b, x, y, w: s.w, h: s.h, lines: s.lines, tail });
  });
  return out;
}

// A bubble's rounded outline as an SVG path (the tail joins the bottom edge).
export function bubblePath(b) {
  const r = Math.min(b.h / 2, 44);
  const { x, y, w, h } = b;
  const tail = b.tail;
  const base = 22; // half width of the tail at the bubble's edge
  const bottom = tail
    ? `L ${tail.bx + base} ${y + h} L ${tail.tx} ${tail.ty} L ${tail.bx - base} ${y + h}`
    : '';
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    bottom,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

// The text baseline of line k of a bubble.
export const bubbleLineY = (b, k) => b.y + BUBBLE_PAD_Y + DIALOGUE_SIZE * 0.95 + k * DIALOGUE_LINE;
