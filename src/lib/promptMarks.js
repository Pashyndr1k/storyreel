// Where a finished prompt repeats its sources: the passages that come from a
// character card's description and the ones that come from the 3D layout's
// measured description. The prompt writer paraphrases, so the match is by
// runs of words: a run of N consecutive words of the prompt that also occurs
// in a source is marked with that source's kind. Returns non-overlapping
// spans [{ start, end, kind }] in character offsets, for highlighting.
const WORD = /[\p{L}\p{N}]+(?:[’'\-.][\p{L}\p{N}]+)*/gu;

function tokens(text) {
  const out = [];
  for (const m of String(text || '').matchAll(WORD)) out.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}
const grams = (words, n) => {
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
};

// sources: [{ kind: 'char' | 'layout', text }]; `n` words per run (layout
// text is terse and numeric, so it matches on shorter runs)
export function markSpans(text, sources, { n = 4, layoutN = 3 } = {}) {
  const toks = tokens(text);
  if (!toks.length) return [];
  const kinds = new Array(toks.length).fill(null);
  for (const src of sources || []) {
    const srcWords = tokens(src.text).map((t) => t.w);
    const size = src.kind === 'layout' ? layoutN : n;
    if (srcWords.length < size) continue;
    const set = grams(srcWords, size);
    for (let i = 0; i + size <= toks.length; i++) {
      const g = toks.slice(i, i + size).map((t) => t.w).join(' ');
      if (!set.has(g)) continue;
      for (let k = i; k < i + size; k++) if (!kinds[k]) kinds[k] = src.kind;
    }
  }
  const spans = [];
  for (let i = 0; i < toks.length; i++) {
    if (!kinds[i]) continue;
    const kind = kinds[i];
    let j = i;
    while (j + 1 < toks.length && kinds[j + 1] === kind && toks[j + 1].start - toks[j].end <= 3) j++;
    spans.push({ start: toks[i].start, end: toks[j].end, kind });
    i = j;
  }
  return spans;
}

// The text cut into plain and marked pieces, for rendering.
export function markPieces(text, spans) {
  const out = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push({ text: text.slice(at, s.start) });
    out.push({ text: text.slice(s.start, s.end), kind: s.kind });
    at = s.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
