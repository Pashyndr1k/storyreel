// Subtitles for the assembly (Stage 5): a layer of timed text blocks under the
// video track. Blocks are made from the shots' dialogue ("NAME: line"), or
// added by hand anywhere on the frame (custom text). The preview draws them
// over the picture; the render burns them in through an ASS subtitle file
// (libass in ffmpeg), so fonts, colours and placement match the preview.
//
// project.subtitles = { style, items }
//   style: { font, size (% of frame height), color, outline, position }
//   items: [{ id, shotId?, start, duration, text, custom?, x?, y?, style? }]
//     start/duration in timeline seconds; x/y in % of the frame for custom
//     placement; style = per-block overrides of the same fields.
// (kept free of other app modules: storage.js imports this file)
const dialogueLines = (text) =>
  String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
      return m ? { speaker: m[1].replace(/\s*\(.*?\)\s*$/, '').trim(), line: m[2] } : { speaker: '', line: l };
    })
    .filter((x) => x.line);

// Fonts present on both Windows and macOS (Supplemental), with Cyrillic.
export const SUB_FONTS = ['Arial', 'Arial Black', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Courier New', 'Impact'];
export const SUB_POSITIONS = ['bottom', 'center', 'top', 'custom'];
export const DEFAULT_SUB_STYLE = { font: 'Arial', size: 4.2, color: '#ffffff', outline: '#000000', position: 'bottom' };
export const MAX_SUB_ITEMS = 1500;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);

export function normalizeSubStyle(s, base = DEFAULT_SUB_STYLE) {
  return {
    font: SUB_FONTS.includes(s?.font) ? s.font : base.font,
    size: clamp(num(s?.size, base.size), 1.5, 14),
    color: hex(s?.color, base.color),
    outline: hex(s?.outline, base.outline),
    position: SUB_POSITIONS.includes(s?.position) ? s.position : base.position,
  };
}
// a per-block override keeps only the fields it sets
export function normalizeOverride(s) {
  if (!s || typeof s !== 'object') return undefined;
  const o = {};
  if (SUB_FONTS.includes(s.font)) o.font = s.font;
  if (Number.isFinite(Number(s.size))) o.size = clamp(Number(s.size), 1.5, 14);
  if (hex(s.color, '')) o.color = hex(s.color, '');
  if (hex(s.outline, '')) o.outline = hex(s.outline, '');
  if (SUB_POSITIONS.includes(s.position)) o.position = s.position;
  return Object.keys(o).length ? o : undefined;
}
export function normalizeSubItem(it) {
  if (!it || typeof it !== 'object' || !String(it.text ?? '').trim()) return null;
  const o = {
    id: String(it.id || `sub_${Math.random().toString(36).slice(2, 10)}`),
    start: Math.max(0, num(it.start, 0)),
    duration: clamp(num(it.duration, 2), 0.2, 60),
    text: String(it.text).slice(0, 400),
  };
  if (typeof it.shotId === 'string' && it.shotId) o.shotId = it.shotId;
  if (it.custom) o.custom = true;
  if (Number.isFinite(Number(it.x))) o.x = clamp(Number(it.x), 0, 100);
  if (Number.isFinite(Number(it.y))) o.y = clamp(Number(it.y), 0, 100);
  const st = normalizeOverride(it.style);
  if (st) o.style = st;
  return o;
}
export function normalizeSubtitles(raw) {
  const style = normalizeSubStyle(raw?.style);
  const items = (Array.isArray(raw?.items) ? raw.items : []).map(normalizeSubItem).filter(Boolean).slice(0, MAX_SUB_ITEMS);
  items.sort((a, b) => a.start - b.start);
  return { style, items };
}
export const subtitlesOf = (project) => normalizeSubtitles(project?.subtitles);
export const subStyleOf = (subs, item) => normalizeSubStyle({ ...subs.style, ...(item?.style || {}) }, subs.style);

// Timeline start of every shot: { shotId: seconds }, in assembly order.
export function shotStarts(project) {
  const out = {};
  let acc = 0;
  for (const sc of project.outline || []) {
    for (const sh of project.sceneDetails?.[sc.id]?.shots || []) {
      out[sh.id] = acc;
      acc += Number(sh.duration) || 0;
    }
  }
  return out;
}

// Blocks for the dialogue of the given shots (all shots when none given):
// the shot's slot minus its silence pads, shared between its lines in
// proportion to their length; lines keep the speaker's name off screen. The
// shots' earlier dialogue blocks are replaced; custom text stays.
export function autoSubtitles(project, { sceneId = null, shotId = null } = {}) {
  const subs = subtitlesOf(project);
  const starts = shotStarts(project);
  const made = [];
  const touched = new Set();
  for (const sc of project.outline || []) {
    if (sceneId && sc.id !== sceneId) continue;
    for (const sh of project.sceneDetails?.[sc.id]?.shots || []) {
      if (shotId && sh.id !== shotId) continue;
      touched.add(sh.id);
      const lines = dialogueLines(sh.dialogue).map((l) => l.line.trim()).filter(Boolean);
      if (!lines.length) continue;
      const pads = (project.shotAudioPads || {})[sh.id] || {};
      const slot = Number(sh.duration) || 0;
      const lead = clamp(Number(pads.lead) || 0, 0, slot);
      const avail = Math.max(0.6, slot - lead - clamp(Number(pads.tail) || 0, 0, slot - lead));
      const weights = lines.map((l) => Math.max(4, l.length));
      const sum = weights.reduce((a, b) => a + b, 0);
      let at = starts[sh.id] + lead;
      lines.forEach((text, i) => {
        const d = Math.max(0.4, (avail * weights[i]) / sum);
        made.push({ id: `sub_${sh.id}_${i + 1}`, shotId: sh.id, start: Math.round(at * 100) / 100, duration: Math.round(Math.min(d, starts[sh.id] + slot - at) * 100) / 100, text });
        at += d;
      });
    }
  }
  const kept = subs.items.filter((it) => it.custom || !touched.has(it.shotId || ''));
  return { subtitles: { ...subs, items: [...kept, ...made].sort((a, b) => a.start - b.start) }, made: made.length, shots: touched.size };
}

// The blocks visible at a moment (timeline seconds).
export const activeSubtitles = (subs, t) => subs.items.filter((it) => t >= it.start && t < it.start + it.duration);

// Where a block sits in the frame: { align: 'left'|'center'|'right', vertical:
// 'top'|'middle'|'bottom', x, y (0..1 of the frame) } — shared by the preview,
// the canvas renderer and the ASS writer.
export function subPlacement(subs, item) {
  const st = subStyleOf(subs, item);
  if (st.position === 'custom' || item.custom) {
    const x = clamp(num(item.x, 50), 0, 100) / 100;
    const y = clamp(num(item.y, 88), 0, 100) / 100;
    return { align: x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'center', vertical: y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : 'middle', x, y, custom: true };
  }
  return st.position === 'top' ? { align: 'center', vertical: 'top', x: 0.5, y: 0.07, custom: false } : st.position === 'center' ? { align: 'center', vertical: 'middle', x: 0.5, y: 0.5, custom: false } : { align: 'center', vertical: 'bottom', x: 0.5, y: 0.93, custom: false };
}

// ---- ASS file for the render (libass): one style per distinct look, an
// event per block, times shifted into the rendered window.
const assColor = (h) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) || ['', 'ff', 'ff', 'ff'];
  return `&H00${m[3]}${m[2]}${m[1]}&`.toUpperCase();
};
const assTime = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
};
const assText = (t) => String(t).replace(/[{}]/g, (c) => (c === '{' ? '｛' : '｝')).replace(/\r?\n/g, '\\N');
const ALIGN = { 'left:bottom': 1, 'center:bottom': 2, 'right:bottom': 3, 'left:middle': 4, 'center:middle': 5, 'right:middle': 6, 'left:top': 7, 'center:top': 8, 'right:top': 9 };

export function buildAss(project, width, height, rIn = 0, rOut = Infinity) {
  const subs = subtitlesOf(project);
  const items = subs.items.filter((it) => it.start + it.duration > rIn + 0.01 && it.start < rOut - 0.01);
  if (!items.length) return '';
  const base = subs.style;
  const px = (size) => Math.max(8, Math.round((size / 100) * height));
  const marginV = Math.round(height * 0.06);
  const events = items.map((it) => {
    const st = subStyleOf(subs, it);
    const pl = subPlacement(subs, it);
    const tags = [`\\an${ALIGN[`${pl.align}:${pl.vertical}`] || 2}`];
    if (st.font !== base.font) tags.push(`\\fn${st.font}`);
    if (st.size !== base.size) tags.push(`\\fs${px(st.size)}`);
    if (st.color !== base.color) tags.push(`\\1c${assColor(st.color)}`);
    if (st.outline !== base.outline) tags.push(`\\3c${assColor(st.outline)}`);
    if (pl.custom) tags.push(`\\pos(${Math.round(pl.x * width)},${Math.round(pl.y * height)})`);
    const a = Math.max(0, it.start - rIn);
    const b = Math.min(rOut - rIn, it.start + it.duration - rIn);
    return `Dialogue: 0,${assTime(a)},${assTime(b)},Default,,0,0,0,,{${tags.join('')}}${assText(it.text)}`;
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${base.font},${px(base.size)},${assColor(base.color)},${assColor(base.color)},${assColor(base.outline)},&H80000000&,-1,0,0,0,100,100,0,0,1,${Math.max(1, Math.round(px(base.size) / 18))},${Math.max(0, Math.round(px(base.size) / 24))},2,${Math.round(width * 0.05)},${Math.round(width * 0.05)},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
