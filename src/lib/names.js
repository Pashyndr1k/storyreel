// Character names stay exactly as written on the Stage 2 cards (English, Latin
// letters) in everything the script stages write. A model writing Russian or
// Ukrainian prose tends to turn "Anna" into "Анна", "Анну", "Анной" however it
// is instructed, so the rule is enforced on the answer itself:
//   1. every capitalised Cyrillic word that reads as a form of a card name is
//      replaced by that name (transliteration + case endings, no model call);
//   2. capitalised Cyrillic words left in the middle of a sentence — proper
//      nouns the first pass could not place — are sent once to the text model,
//      which says which of them are character names; places and brands stay.
// generateJSON runs this for any request that carries `names`.

// a capitalised Cyrillic word, or one in capitals (a speaker prefix: "АННА:")
const CYR_WORD = /[А-ЯЁІЇЄҐ][а-яёіїєґ'’ʼ]+|[А-ЯЁІЇЄҐ]{2,}/g;
const ALL_CAPS = /^[А-ЯЁІЇЄҐ]+$/;
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'e', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia',
};
const translit = (w) => [...w.toLowerCase()].map((ch) => TRANSLIT[ch] ?? (/[a-z]/.test(ch) ? ch : '')).join('');

// One phonetic spelling for both sides, so "John" meets "Джон" and "Michael"
// meets "Майкл": digraphs folded, soft c, h dropped, doubles collapsed.
function key(latin, softG = false) {
  let s = latin.toLowerCase().replace(/[^a-z]/g, '');
  s = s.replace(/dzh/g, 'j').replace(/zh/g, 'j').replace(/sh/g, 'x').replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/ch/g, 'k');
  if (softG) s = s.replace(/g(?=[ei])/g, 'j');
  s = s.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/z/g, 's').replace(/h/g, '');
  return s.replace(/(.)\1+/g, '$1');
}
const skeleton = (k) => k.replace(/[aeiou]/g, '');
const startsVowel = (k) => /^[aeiou]/.test(k);
// what a case ending may add after the stem of a name
const ENDING = /^(|[aeiou]{1,3}|[aeiou]{1,2}m|[aeiou]{1,2}v|[oe]vi|i?ami)$/;
const SKEL_ENDING = /^(|m|v|mi)$/;

// The words of the card names, longest first, with their phonetic forms.
function nameWords(names) {
  const seen = new Set();
  const out = [];
  for (const full of names || []) {
    for (const word of String(full || '').split(/[\s\-–—]+/)) {
      const w = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (w.length < 2 || !/^[A-Za-z'’.]+$/.test(w) || seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      const keys = [...new Set([key(w), key(w, true), ...(/^j[aeiou]/i.test(w) ? [key(`i${w.slice(1)}`)] : [])])];
      out.push({ word: w, keys, stems: keys.map((k) => k.replace(/[aeiou]+$/, '') || k) });
    }
  }
  return out.sort((a, b) => b.word.length - a.word.length);
}

// The card-name word a Cyrillic word is a form of, or null.
function matchName(cyr, words) {
  const k = key(translit(cyr));
  if (k.length < 2) return null;
  for (const n of words) {
    for (let i = 0; i < n.keys.length; i++) {
      const stem = n.stems[i];
      if (stem.length >= 2 && k.startsWith(stem) && ENDING.test(k.slice(stem.length)) && k.length <= n.keys[i].length + 3) return n.word;
      const ns = skeleton(n.keys[i]);
      const ws = skeleton(k);
      if (ns.length >= 3 && ws.startsWith(ns) && SKEL_ENDING.test(ws.slice(ns.length)) && startsVowel(k) === startsVowel(n.keys[i]) && Math.abs(k.length - n.keys[i].length) <= 3) return n.word;
    }
  }
  return null;
}

const SENTENCE_END = /[.!?…:;«»"“”„(\[\n—–-]/;

// Pass 1 on one string. `known` maps lower-cased Cyrillic words to a card name
// (or null = not a name), learnt from the model in pass 2. Collects into
// `suspects` the capitalised Cyrillic words still standing (a sentence opener
// may be a name the first pass could not read) and speakers in capitals.
export function latinNames(text, names, known = new Map(), suspects = null) {
  const src = String(text ?? '');
  if (!src || !/[А-ЯЁІЇЄҐ]/.test(src)) return src;
  const words = Array.isArray(names) && names.length && typeof names[0] === 'object' ? names : nameWords(names);
  if (!words.length) return src;
  return src.replace(CYR_WORD, (w, at) => {
    const low = w.toLowerCase();
    if (known.has(low)) return known.get(low) || w;
    const hit = matchName(w, words);
    if (hit) return hit;
    if (suspects) {
      const before = src.slice(0, at).replace(/\s+$/, '');
      const midSentence = before.length > 0 && !SENTENCE_END.test(before[before.length - 1]);
      const speaker = /^\s*:/.test(src.slice(at + w.length)) && (!before.length || /\n$/.test(src.slice(0, at)) || SENTENCE_END.test(before[before.length - 1]));
      const caps = ALL_CAPS.test(w);
      if (speaker || (!caps && (midSentence || w.length >= 3))) suspects.add(w);
    }
    return w;
  });
}

const deepMap = (v, fn) =>
  typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map((x) => deepMap(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x, fn)])) : v;

// what the model said about a word, per cast, for the session
const learnt = new Map();
const castKey = (names) => names.map((n) => String(n).toLowerCase()).sort().join('|');

export function namesRepairSpec(names, suspects) {
  return {
    system: 'You identify character names in text. Respond with VALID JSON ONLY. No markdown, no commentary.',
    maxTokens: 3000,
    user: `Character names of a script, exactly as written on the character cards:
${names.map((n) => `- ${n}`).join('\n')}

These capitalised words were found in the script's text (Russian or Ukrainian):
${suspects.map((w) => `- ${w}`).join('\n')}

For each word decide whether it refers to one of the characters above — the name in any grammatical case, a diminutive or pet form, or a transliteration or translation of the name. If it does, give the matching part of the card name exactly as written above (the first name when the word is the first name, the surname when it is the surname). If it is anything else — a place, a brand, a title, an ordinary word, another person — give null.

JSON schema:
{"map":{"${suspects[0]}":"card name or null"}}`,
  };
}

// Enforce the card names on a whole model answer (every string in it).
// `ask(spec)` runs a small JSON request on the text model for pass 2; if it
// fails the answer of pass 1 is kept.
export async function enforceNames(data, names, ask) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  const words = nameWords(list);
  if (!words.length) return data;
  const ck = castKey(list);
  if (!learnt.has(ck)) learnt.set(ck, new Map());
  const known = learnt.get(ck);
  const suspects = new Set();
  let out = deepMap(data, (s) => latinNames(s, words, known, suspects));
  const open = [...suspects].filter((w) => !known.has(w.toLowerCase())).slice(0, 120);
  if (!open.length || !ask) return out;
  try {
    const res = await ask(namesRepairSpec(list, open));
    const map = res?.map && typeof res.map === 'object' ? res.map : {};
    const allowed = new Map();
    for (const n of list) {
      allowed.set(n.toLowerCase(), n);
      for (const w of n.split(/\s+/)) allowed.set(w.toLowerCase(), w);
    }
    let found = false;
    for (const w of open) {
      const v = typeof map[w] === 'string' ? allowed.get(map[w].trim().toLowerCase()) : null;
      if (!known.get(w.toLowerCase())) known.set(w.toLowerCase(), v || null); // "Ганна" and "ГАННА" share one entry
      if (v) found = true;
    }
    if (found) out = deepMap(out, (s) => latinNames(s, words, known));
  } catch {
    // keep pass 1
  }
  return out;
}
