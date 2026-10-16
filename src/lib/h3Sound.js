// MiniMax H3 sound discipline. H3 renders noisy textures (hiss, rustle,
// gurgle, rain, wind, sea, steam, hum) as a harsh high-pitched squeal, so an
// H3 video prompt carries at most THREE clean sounds, each made by a character
// or object visible in the frame. The rule is given to the prompt writer and
// then ENFORCED on its answer, whatever the scene says:
//  - the app writes the overall_soundscape field itself from the writer's
//    "sounds" list (or, without one, from the clauses of its soundscape):
//    forbidden, off-screen and speech entries are dropped, three at most kept;
//  - the description body must name no sound; a body that does is sent back
//    for one surgical repair, and what still names sound after that is cut
//    clause by clause (the <d> speech tags and [Shot N] cut markers survive).
// Speech is exempt: it is not a sound source and may be a voiceover.

export const H3_MAX_SOUNDS = 3;

export const H3_SOUND_RULE = `SOUND RULE — binding. It overrides the script, the scene description, the location, the action lines and the directorial style: whatever they say about sound or atmosphere, follow this rule and leave out every detail that breaks it. MiniMax H3 turns noisy sound into an unpleasant high-pitched squeal.
ALLOWED — at most THREE sound sources in the whole video (fewer is better): short, distinct, clean sounds of physical actions, each made by a character or an object VISIBLE in the frame at that moment — the woman's heels on the floor, a cup set down on a table, a door she closes, a key turning in a lock, a car door shutting, a book dropped on a desk, a palm slapping a counter, a short laugh or gasp of a visible character.
FORBIDDEN — always, even when the scene is written around it: any HISSING (steam, tyres on a wet road, spray, sizzling, air, a hissed breath); rustling (paper, leaves, fabric, sand, grass); gurgling, running, dripping or splashing water (rain, drizzle, puddles, streams, fountains, waves, sea, surf); wind or breeze; whistling; squeaking, creaking or screeching; crackling (fire, radio, static); buzzing or humming (lights, neon, streetlights, fridges, electrics, insects); engines idling or driving, traffic; crowds, chatter, murmuring; breathing or panting; room tone, any continuous noise bed or ambience; any sound whose source is off-screen or distant.
If the scene has rain, wind, sea, traffic, a fire or a flickering light, it stays a SILENT part of the picture: never give it a sound and never use a sound verb for it (drumming, pattering, splashing, roaring, rumbling, hissing).
Speech is exempt and is not a sound source: the characters' lines may be spoken on camera or as voiceover.`;

// what the writer is told about where sound goes and how it is listed
export const H3_SOUND_FORMAT = `Sound goes ONLY in "overall_soundscape": one short sentence per sound source, at most THREE sentences, no commas or lists inside a sentence, each timed to the action ("Her heels click twice on the pavement as she steps off the curb."), then "Nothing else is heard." ("Apart from the dialogue, nothing else is heard." when someone speaks). The description body names NO sound at all: it holds picture, action, camera and the spoken lines.`;

// ---- detection -------------------------------------------------------------
// noise verbs / nouns: forbidden anywhere outside the spoken lines
const NOISE = /\b(hiss\w*|rustl\w*|gurgl\w*|squeak\w*|squeal\w*|screech\w*|creak\w*|whistl\w*|crackl\w*|sizzl\w*|fizz\w*|bubbl\w*|babbl\w*|whoosh\w*|swoosh\w*|swish\w*|howl\w*|buzz\w*|hum|hums|humming|hummed|whirr?\w*|patter\w*|drumm\w*|splash\w*|slosh\w*|gush\w*|trickl\w*|drip\w*|roar\w*|rumbl\w*|purr\w*|thrum\w*)\b/gi;
// naming a sound in the body at all
const BODY_SOUND = /\b(sounds? of|the sound|a sound|noise\w*|hears?|heard|audible|echo\w*|soundscape)\b/gi;
// sources that are never allowed as a sound
const AMBIENT = /\b(wind|winds|windy|breeze|gusts?|gale|sea|ocean|surf|waves?|tide|rain\w*|drizzle|downpour|storm\w*|thunder\w*|water|stream|river|creek|puddles?|fountain|steam\w*|sand|leaves|grass|tyres?|tires|traffic|engines?|motors?|idl\w*|crowds?|chatter\w*|murmur\w*|walla|room tone|ambien\w*|background|fire|flames?|insects?|crickets?|cicadas?|birds?|birdsong|seagulls?|neon|fluorescent|streetlights?|static|radio|television|fridge|refrigerator|air.?condition\w*|fans?|vents?|electric\w*|machinery|city|breath\w*|panting|pants|sigh\w*)\b/gi;
const OFFSCREEN = /\b(off-?screen|out of (?:frame|shot|view)|unseen|distant|in the distance|far-?off|somewhere|next door|from outside|nearby)\b/gi;
const SPEECH = /<d>|\b(says?|speaks?|said|dialogue|voice-?over|voiceover|lines?|words?)\b/i;

const hits = (re, text) => [...String(text || '').matchAll(re)].map((m) => m[0].toLowerCase());

const CLOSING = /(?:apart from the dialogue,\s*)?nothing else is heard\.?/gi;

// Split an H3 prompt into the part before the soundscape, the soundscape and
// the rest (non_diegetic_music: …). Without a soundscape field: { body: text }.
export function splitSoundscape(text) {
  const t = String(text || '');
  const m = /overall_soundscape\s*:/i.exec(t);
  if (!m) return { body: t, sound: null, rest: '' };
  const after = t.slice(m.index + m[0].length);
  const n = /\n?\s*non_diegetic_music\s*:/i.exec(after);
  return {
    body: t.slice(0, m.index),
    sound: (n ? after.slice(0, n.index) : after).trim(),
    rest: n ? after.slice(n.index).replace(/^\n?\s*/, '') : '',
  };
}

// <d>…</d> tags and decimal points (timestamps) are masked before sentences
// are cut, so speech is never touched and "00:03.500" stays one token.
function masked(text) {
  const tags = [];
  const t = String(text || '')
    .replace(/<d>[\s\S]*?<\/d>/g, (m) => `\u0000${tags.push(m) - 1}\u0000`)
    .replace(/(\d)\.(\d)/g, '$1\u0001$2');
  const unmask = (s) => s.replace(/\u0001/g, '.').replace(/\u0000(\d+)\u0000/g, (_, i) => tags[+i]);
  return { t, tags, unmask };
}
const sentencesOf = (t) => t.match(/[^.!?\n]*[.!?]+|[^.!?\n]+|\n/g) || [];
const bodyHits = (s) => [...hits(NOISE, s), ...hits(BODY_SOUND, s)];

// Sentences of the body (outside speech) that name sound.
export function bodySoundSentences(body) {
  const { t, unmask } = masked(body);
  return sentencesOf(t)
    .filter((s) => s.trim() && bodyHits(s).length)
    .map((s) => ({ text: unmask(s).trim(), words: [...new Set(bodyHits(s))] }));
}

// Is one listed sound acceptable? Returns the reason it is not, or ''.
export function soundEntryProblem(entry) {
  const e = typeof entry === 'string' ? { sound: entry } : entry || {};
  const text = `${e.source || ''} ${e.sound || ''}`;
  if (!String(e.sound || '').trim()) return 'empty';
  if (e.visible === false) return 'not visible';
  if (SPEECH.test(text)) return 'speech';
  const bad = [...hits(NOISE, text), ...hits(AMBIENT, text), ...hits(OFFSCREEN, text)];
  return bad.length ? [...new Set(bad)].join(', ') : '';
}

// The clauses of a free-written soundscape, one candidate sound each.
export function soundClauses(sound) {
  const s = String(sound || '').replace(CLOSING, '').trim();
  if (!s || /^n\/?a\.?$/i.test(s)) return [];
  return s
    .split(/[.;!?]+|,\s*/) // a whole comma segment is one sound: "rain on the roof and the pavement"
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
}

const sentence = (s) => {
  const x = String(s || '').trim().replace(/[\s,;:]+$/, '');
  return x ? `${x[0].toUpperCase()}${x.slice(1)}${/[.!?]$/.test(x) ? '' : '.'}` : '';
};

// The soundscape field the app writes: ≤ 3 clean, visible sounds.
export function buildSoundscape(entries, hasSpeech) {
  const seen = new Set();
  const kept = [];
  for (const e of entries || []) {
    if (kept.length >= H3_MAX_SOUNDS) break;
    if (soundEntryProblem(e)) continue;
    const key = String(typeof e === 'string' ? e : e.source || e.sound).toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence(typeof e === 'string' ? e : e.sound));
  }
  if (!kept.length) return hasSpeech ? 'Apart from the dialogue, nothing else is heard.' : 'N/A';
  return `${kept.join(' ')} ${hasSpeech ? 'Apart from the dialogue, nothing else is heard.' : 'Nothing else is heard.'}`;
}

// Last resort: cut the clauses of the body that name sound. Speech tags and
// the "[Shot N] At MM:SS.mmm," lead-in of an internal cut are kept.
export function stripBodySound(body) {
  const { t, unmask } = masked(body);
  return sentencesOf(t)
    .map((s) => {
      if (!bodyHits(s).length) return s;
      const lead = (s.match(/^\s*\[Shot \d+\]\s*(?:At \d{2}:\d{2}\u0001\d{3},?\s*)?/) || [''])[0];
      const parts = s.slice(lead.length).split(/(,\s+|\s+(?:as|while|with|and)\s+)/);
      const out = [];
      for (let i = 0; i < parts.length; i += 2) {
        let clause = parts[i];
        if (bodyHits(clause).length) {
          // a delivery verb next to a spoken line ("she hisses: <d>…") becomes "says"
          if (/\u0000\d+\u0000/.test(clause)) clause = clause.replace(NOISE, 'says').replace(BODY_SOUND, '');
          else continue;
        }
        out.push(out.length ? `${parts[i - 1] || ' '}${clause}` : clause);
      }
      let x = out.join('').trim();
      if (!x) return lead ? `${lead.trimEnd().replace(/,?$/, ',')} the shot continues. ` : s.match(/^\s*/)[0];
      if (!/[.!?]$/.test(x)) x += '.';
      x = x[0].toUpperCase() + x.slice(1);
      return `${s.match(/^\s*/)[0]}${lead}${x}${/\s$/.test(s) ? ' ' : ''}`;
    })
    .map(unmask)
    .join('')
    .replace(/[ \t]{2,}/g, ' ');
}

// Problems of a hand-written H3 prompt (the agent's storyreel_set_prompt).
export function h3SoundProblems(text) {
  const { body, sound } = splitSoundscape(text);
  const problems = [];
  const bodyBad = bodySoundSentences(body);
  if (bodyBad.length)
    problems.push(`The description body names sound (${[...new Set(bodyBad.flatMap((b) => b.words))].join(', ')}): every sound goes in overall_soundscape only, and only sounds the SOUND RULE allows.`);
  if (sound != null) {
    const clauses = soundClauses(sound);
    const bad = [...new Set(clauses.map(soundEntryProblem).filter((p) => p && p !== 'speech').flatMap((p) => p.split(', ')))];
    if (bad.length) problems.push(`Forbidden sound in overall_soundscape (${bad.join(', ')}): H3 renders hissing, rustling, gurgling, squeaking, whistling, humming, rain, wind, sea, water, steam, engines and any ambience or off-screen sound as a high squeal.`);
    if (clauses.length > H3_MAX_SOUNDS) problems.push(`overall_soundscape lists ${clauses.length} sounds: at most ${H3_MAX_SOUNDS}, one short sentence each, no commas or lists.`);
  }
  return problems;
}

// ---- enforcement on the writer's answer ------------------------------------
const repairSpec = (items) => ({
  system: `You remove sound from the description body of MiniMax H3 video prompts. ${H3_SOUND_RULE}

The description body must name NO sound at all. Rewrite only the listed sentences: delete every sound from them (sound verbs, "the sound of …", noises, what anyone hears) and keep their picture, action, camera, timing, [Shot N] markers, speaker IDs and every <d>…</d> tag exactly. Every other sentence stays word for word. Respond with VALID JSON only.`,
  maxTokens: 8000,
  user: `${items
    .map(
      (it) => `SHOT ${it.key}
BODY:
"""
${it.body.trim()}
"""
SENTENCES THAT NAME SOUND:
${it.bad.map((b) => `- ${b.text}`).join('\n')}`,
    )
    .join('\n\n')}

Return every shot above.

JSON schema:
{"prompts":[{"shot":"<the SHOT key>","body":"..."}]}`,
});

const speechTags = (s) => (String(s || '').match(/<d>[\s\S]*?<\/d>/g) || []).join('\u0000');

// items: [{ key, text, sounds? }] → Map(key → enforced text)
export async function enforceH3Sound(items, repair) {
  const parts = items.map((it) => ({ ...it, ...splitSoundscape(it.text) }));
  const work = parts.filter((p) => p.sound != null);
  // 1. the body: one repair round for every body that names sound
  const dirty = work.map((p) => ({ ...p, bad: bodySoundSentences(p.body) })).filter((p) => p.bad.length);
  if (dirty.length && repair) {
    try {
      const data = await repair(repairSpec(dirty));
      for (const r of data?.prompts || []) {
        const p = work.find((x) => String(x.key) === String(r.shot));
        const body = typeof r.body === 'string' ? r.body : '';
        // accepted only when the speech survived exactly
        if (p && body.trim() && speechTags(body) === speechTags(p.body)) p.body = `${body.trim()}\n\n`;
      }
    } catch {
      /* the cut below still applies */
    }
  }
  for (const p of work) if (bodySoundSentences(p.body).length) p.body = stripBodySound(p.body);
  // 2. the soundscape: written by the app, ≤ 3 visible clean sounds
  const out = new Map();
  for (const p of parts) {
    if (p.sound == null) {
      out.set(p.key, p.text);
      continue;
    }
    const listed = Array.isArray(p.sounds) && p.sounds.length ? p.sounds : soundClauses(p.sound);
    const sound = buildSoundscape(listed, /<d>/.test(p.body));
    out.set(p.key, `${p.body.replace(/\s*$/, '')}\n\noverall_soundscape: ${sound}\n\n${p.rest || 'non_diegetic_music: N/A'}`.trim());
  }
  return out;
}

// spec.enforce for the H3 scene writer: {"prompts":[{shot, sounds, video_prompt}]}
export async function enforceH3Answer(answer, repair) {
  const list = (answer?.prompts || []).filter((pr) => typeof pr?.video_prompt === 'string');
  if (!list.length) return answer;
  const fixed = await enforceH3Sound(
    list.map((pr, i) => ({ key: String(pr.shot ?? i + 1), text: pr.video_prompt, sounds: pr.sounds })),
    repair,
  );
  return {
    ...answer,
    prompts: (answer.prompts || []).map((pr, i) => (typeof pr?.video_prompt === 'string' ? { ...pr, video_prompt: fixed.get(String(pr.shot ?? i + 1)) } : pr)),
  };
}

// spec.enforce for a tweak of one H3 prompt: {"prompt": "..."}
export async function enforceH3Tweak(answer, repair) {
  if (typeof answer?.prompt !== 'string') return answer;
  const fixed = await enforceH3Sound([{ key: '1', text: answer.prompt, sounds: answer.sounds }], repair);
  return { ...answer, prompt: fixed.get('1') };
}
