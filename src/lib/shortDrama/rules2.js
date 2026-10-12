// The "Short Drama 2" engine: the conventions of the vertical micro-drama as
// data and as instructions, derived from the "AI Short Drama Series:
// Production Manual" (16 practitioner sources, 2025–2026: Filmustage, InkTip,
// Bookwriter, Kapwing, Morphic, invideo, Magic Hour, CapCut, Media Services,
// IndianTelevision, Vizard, Vitrina, Limecraft, Pexo) and the articles it
// cites. The publishing, checklist and pre-production sections of the manual
// are not used. Same surface as rules.js (the first engine); lib/shortDrama/
// engine.js picks one per project. Video is written for MiniMax H3, images
// for Gemini Nano Banana 2.1 — the frame rule speaks to both.
import { episodeRange, clampEpisodes } from '../series.js';
import { CAST_LOOK } from './rules.js';

export const isShortDrama = (project) => project?.scriptType === 'series';

// Cliffhanger types (InkTip, Pexo): rotate them — constant peril tires viewers.
export const HOOK_TYPES = ['revelation', 'reversal', 'deadline', 'intrusion', 'arrival', 'withheld'];
export const HOOK_LABEL = { revelation: 'REVELATION', reversal: 'REVERSAL', deadline: 'DEADLINE', intrusion: 'INTRUSION', arrival: 'NEW ARRIVAL', withheld: 'WITHHELD DECISION' };
// no fixed sequence of types in the manual: the rule is rotation and strength
export const OPENING_HOOKS = [];
export const expectedHook = () => null;
// the note the last shot of an episode must carry
export const HOOK_TAG = /CLIFF(?:HANGER)?\s*[·:\-]\s*(REVELATION|REVERSAL|DEADLINE|INTRUSION|NEW ARRIVAL|ARRIVAL|WITHHELD(?: DECISION)?)/i;
// the beats of one episode (Filmustage's beat engine, Kapwing, Morphic)
export const BEATS = ['hook', 'friction', 'turn', 'spike', 'button'];

// Dialogue and pacing limits
export const WORDS_PER_MINUTE = 135; // continuous speech (Bookwriter): ~203 words in 90 s, ~270 in 120 s
export const WORDS_PER_SEC = WORDS_PER_MINUTE / 60;
export const MAX_LINE_WORDS = 16; // short lines; a vertical caption holds ~25 characters × 3 lines
export const MAX_ACTION_WORDS = 40;
export const MAX_LOCATIONS_PER_EPISODE = 2; // and 1–3 per SERIES (see EXTRAS)
export const OPENING_HOOK_SEC = 3; // a stranger from the feed understands the conflict inside 3 s
export const TURN_EVERY_SEC = 30; // one beat (someone learns, decides or acts) per ~30 s
export const SHOCK_EVERY_SEC = 10; // 8–10 s blocks: each delivers new information, tension or a shift
export const EXTRAS = {
  maxLocationsPerSeries: 3,
  maxCharactersPerScene: 2,
  shotSec: [3, 6],
  sceneChangeEverySec: 20,
  blockSec: [8, 10],
  monologueMouthSec: 5,
  wordsPerMinute: WORDS_PER_MINUTE,
  captionCharsPerLine: 25,
  captionLines: 3,
  freeEpisodes: [5, 10],
  twistWindow: [-2, 1],
  cliffhangerWindowSec: [5, 20],
  weakPaywallHooks: [],
};

// Season landmarks for `total` episodes: the manual's 90-episode phase map
// (1–10 establish; 11–40 deepen; 41–70 darkest; 71–end resolve) scaled, the
// paywall after 5–10 free episodes (around episode 10 on the apps; the half
// for a short run), the big twist inside [paywall − 2, paywall + 1].
export function seasonLandmarks(total) {
  const n = clampEpisodes(total);
  const c = (x) => Math.max(1, Math.min(n, x));
  const at = (f) => c(Math.round(n * f));
  // a run of four or fewer has no paywall worth the name: it sits on the finale
  const paywall = n <= 4 ? n : n <= 12 ? Math.max(3, Math.min(n - 1, Math.round(n / 2))) : Math.min(10, Math.max(5, Math.round(n * 0.11)));
  const establishEnd = c(Math.max(paywall, at(0.11))); // phase 1 (characters + structural conflict, 2–3 peaks)
  const deepenEnd = c(Math.max(paywall + 1, at(0.45))); // phase 2: subplots, more "almost" moments
  const lowPoint = c(Math.max(deepenEnd, at(0.62))); // the darkest stretch (41–70 of 90)
  const resolveFrom = c(Math.max(lowPoint, at(0.79))); // phase 4: secondary arcs first, central arc last
  return {
    total: n,
    personal: 1, // ep 1 ends when the lead's problem becomes personal
    opponentMove: c(2), // ep 2 ends on the opponent's first move
    firstFailure: c(3), // ep 3: the first attempt to fix things fails
    establishEnd,
    paywall, // the last free episode: the strongest cliffhanger so far
    twistFrom: c(paywall - 2),
    twistTo: c(paywall + 1),
    firstPaid: c(paywall + 1), // pays the cliffhanger off inside ~10 s, opens a new question
    deepenEnd,
    lowPoint,
    resolveFrom,
    finale: n, // leave something open for a renewal
  };
}

// The timing grid of one episode of `sec` seconds: Filmustage's beat engine
// (hook / friction / spike / button) with Kapwing's turn, scaled to 60–120 s.
export function timingGrid(sec) {
  const s = Math.max(30, Number(sec) || 90);
  const t = (f) => Math.round(s * f);
  const button = Math.max(5, Math.min(10, Math.round(s * 0.1)));
  return [
    ['0–3s', 'HOOK: open in the middle of conflict — a shocking line, an action under way, a reveal or a reaction; readable with no backstory.'],
    [`3–${t(0.33)}s`, 'FRICTION: two people under pressure — someone lying, hiding or about to break; the want and the obstacle are clear.'],
    [`≈${t(0.33)}s`, 'TURN: something flips — a decision, a discovery, an act that changes the situation.'],
    [`${t(0.33)}–${t(0.66)}s`, 'ESCALATION: the lead loses an option; evidence appears (a text, a call, a file, an object).'],
    [`${t(0.66)}–${s - button}s`, 'SPIKE: the biggest jolt — a reveal or reversal that survives the mute test.'],
    [`${s - button}–${s}s`, 'BUTTON: cut on one unanswered question; the last 3 s carry the hook; end on the named moment.'],
  ];
}
export const timingText = (sec) => timingGrid(sec).map(([a, b]) => `  ${a.padEnd(10)} ${b}`).join('\n');

// ---------------------------------------------------------------- the brief
export const DRAMA_CORE = `SHORT DRAMA 2 — THE PRODUCTION-MANUAL ENGINE. You are writing a vertical micro-drama: 9:16, episodes of 60–120 seconds (90 is the sweet spot), a serialized product whose unit of success is the viewer tapping "next". It is not a short film and not a TV pilot cut into pieces: write for vertical from page one. These conventions are binding at every stage; a sub-genre brief colours tone, world and plot types but never overrides them.

THE BUSINESS SHAPES THE WRITING. Viewers sample the first 2–3 episodes, watch 5–10 free ones, hit a paywall and pay to continue. The first episodes and especially the LAST FREE one are the most important minutes of the series: the last free episode ends on the strongest reveal so far; the first paid episode pays that cliffhanger off inside about 10 seconds and opens a new question. Platforms re-cut or re-shoot episodes whose cliffhanger loses viewers.

THE PREMISE has built-in conflict: it generates tension by itself, without a new obstacle invented for every scene. Write it in ONE sentence that names who the story follows, the central problem and what is at stake; if it does not fit, the concept is too complicated for the format. Proven setups: enemies-to-lovers (opposed by design), forbidden proximity (forced together with a reason to stay apart), power imbalance (boss and assistant, protector and protected), arranged or forced circumstances (every interaction under involuntary pressure).

THE ENGINE has four parts and runs for the whole season without a sprawling world: a SIMPLE WANT (win custody, win someone over, keep a secret), FRESH OBSTACLES (a new one every episode, each pushing the lead deeper), a TICKING CLOCK (trial date, wedding, eviction) and an OPEN QUESTION (who sent the texts?). An ongoing information imbalance (what one character hides from another) generates turns indefinitely; a single secret generates one. Keep the central conflict between TWO people; no ensemble casts, no long setup before the conflict, never more plot than the runtime holds (cut the beat, not the runtime: split it into two episodes), never a fully resolved ending — an episode that resolves cleanly ends the binge.

GENRES that sustain the cliffhanger rhythm: drama (love triangles, family rivalries, identity), romantic comedy (awkward dates, app mishaps), thriller / crime (ordinary people pulled into danger), horror (tense, claustrophobic, one dread that repeats), fantasy (ONE small magical hook), young adult (school and college). Romance dominates (enemies-to-lovers, forbidden proximity, dark romance); psychological thriller grows fastest with younger viewers; revenge, supernatural and CEO / office drama lead on the apps.

THE SEASON is mapped before any scene: where each "almost" moment falls, where the paywall sits, the low point and the finale. Phases: establish the characters and the structural conflict with 2–3 strong emotional peaks; deepen the conflict, add subplots and raise the frequency and stakes of "almost" moments; the darkest stretch, furthest from resolution; resolve secondary arcs first and the central arc last, leaving something open. The first episodes one by one: 1 opens on the conflict and ends when the lead's problem becomes personal; 2 establishes who wants what and who opposes them, ending on the opponent's first move; 3 the lead's first attempt to fix things fails or backfires; from 4 each episode raises the stakes and ends on a new problem; the twist episode ends on the reveal. Put major revelations within two episodes before to one episode after the paywall; list every reveal, threat, decision and reversal, rank them by strength, put the strongest at the end of the last free episode and spread the rest so no long stretch goes without a big moment — a series of N episodes needs N − 1 cliffhangers.

THE EPISODE is one beat sheet: HOOK (0–3 s, readable without backstory) → FRICTION (two people under pressure, someone lying, hiding or about to break) → TURN (what flips) → SPIKE (the biggest jolt, a reveal or reversal that passes the mute test: mute the audio and the moment must still land) → BUTTON (the last 5–10 s end on a question). One clear purpose per episode (introduce a character, reveal a secret, force a decision) and the "what changed?" test: if nothing is different by the end, rewrite or cut. Beat density: about one beat — someone learns, decides or acts in a way that changes the situation — every 30 seconds (3 in 90 s, 4 in 120 s). Outline each episode as timestamps before any dialogue, then write lines that deliver those moments. In about a minute only a hook, a turn and a reveal fit.

HOOKS. Open in the middle of conflict; a stranger arriving from a feed understands what is happening within three seconds. Strong openers: a shocking line, an action already under way, a reveal, a reaction to something the viewer has not seen, an accusation, a betrayal, a slap, a proposal, an arrest, a sudden revelation, a character caught in a lie; a text message or an interruption beats scene-setting. Never open an episode on scenery, voice-over backstory or a slow establishing shot; no opening titles and no "previously on" recap after episode 1 — never re-establish context at the top of an episode. Later episodes open by paying off the previous cliffhanger inside about ten seconds, or on a flash-forward to the reveal. The episode's three questions: the opening asks "what happened?", the middle "who is lying?", the ending "what happens next?".

CLIFFHANGERS are the product; write toward them from the first line. Types, rotated so no two consecutive episodes share one: REVELATION (a shocking fact comes out), REVERSAL (a situation flips), DEADLINE (a clock runs out), INTRUSION (an outside threat arrives), NEW ARRIVAL (a new character walks in), WITHHELD DECISION (a character decides, the viewer does not learn what). A real cliffhanger changes what the viewer believed; an interrupted line or a plain mid-sentence cut does not count. Cut a little earlier than feels comfortable, do not over-explain; just as an answer seems near, add a new complication. Even the finale leaves something open.

DIALOGUE. Every line advances the conflict, reveals character under pressure, or both — cut anything else. Characters never name their feelings: they act, deny or deflect, and the viewer infers (pauses, glances, answering the wrong question). Even a casual opening brings conflict within two or three lines. Lines are short (a confession may run a little longer once the viewer is hooked). Word budget: continuous speech runs about 135 words a minute, so a 90 s episode holds at most about 203 spoken words and a 120 s one about 270. For AI video, no shot shows a speaking mouth for a monologue longer than about 5 seconds: write long speeches so they are covered by reactions and cutaways.

WRITE FOR THE CLOSE-UP. A vertical frame is mostly a face, so expression matters more than location. Keep location descriptions minimal (an apartment, a hallway, a car interior); script reaction beats explicitly (what the hands do, whether they look away, whether they almost speak and stop); keep scenes to one or two characters; show evidence instead of explaining it (text messages, missed calls, deleted files, hidden objects); favour psychological conflict over action that needs spatial movement; in thrillers use dramatic irony — let the audience know something the lead does not by episode 2–3 and keep that gap open.

PACING FOR THE CUT. The goal is stimulation, not immersion: sequences run in 8–10 second blocks and each block delivers new information, rising tension or an emotional shift — stretches where nothing changes are where viewers leave. No slow scenes: no one sits in silence processing feelings. Drop long establishing shots and detailed geography unless they serve the next beat. Choose clear reactions over subtle ones (a small glance disappears on a phone). Jump cuts and abrupt transitions are welcome. End on a named moment — the exact frame where the story turns; the last three seconds carry the hook; the final frame works as the transition into the next episode. Captions are essential (many watch with the sound off): write lines that fit 25 characters a line, three lines at most, and never put key action behind the caption band.`;

// Stage-specific instructions (appended to DRAMA_CORE)
export const DRAMA_STAGE = {
  ideas: `AT THIS STAGE (plot directions): each direction is a micro-drama premise in ONE sentence (who the story follows, the central problem, what is at stake) with built-in conflict — name the structural setup it stands on (enemies-to-lovers, forbidden proximity, power imbalance, forced circumstances, or the genre's own: identity, revenge, a crime no one else knows about, a single magical hook). For EVERY direction state inside "pitch", as labelled lines: Setup; Want (the lead's simple want); Clock (the deadline that raises pressure); Question (what keeps viewers guessing); Antagonist (the one person the central conflict is between); Paywall reveal (the strongest revelation, which ends the last free episode); Dramatic irony (what the audience will know that the lead does not). Keep the cast to the lead, the antagonist and at most two recurring others; keep the world to one to three locations. Invention goes into the execution, not into complexity.`,
  storyline: `AT THIS STAGE (storyline and cast): the synopsis is the SEASON MAP in order — episode 1 (the conflict, ending when the lead's problem becomes personal), episode 2 (who wants what, who opposes, the opponent's first move), episode 3 (the first attempt fails), the establishing phase's 2–3 emotional peaks, the paywall episode and the strongest reveal that ends it, the twist within two episodes before to one after the paywall, the deepening phase's "almost" moments and subplots, the low point, the resolution (secondary arcs first, central arc last) and what the finale leaves open. Name every reveal, threat, decision and reversal and say where it lands. Cast: the lead and the antagonist carry the central conflict between two people; recurring characters appear more than once or not at all. Give each character a FIXED IDENTITY BLOCK the image and video prompts will paste verbatim — age, gender, face shape, eyes, one modern distinctive detail (a tattoo, coloured hair, a piercing, an accessory — never a scar), hair colour and style — plus 2–3 anchor attributes (a signature garment, hairstyle or accessory) and what is NOT allowed to change; do not over-describe (long descriptions make a different person in every shot). Name one to three recurring locations, each with one immutable detail (a distinctive wall, fixture or tile) and its key-light direction. Assets are the evidence the plot turns on: the phone with the texts, the file, the ring, the letter.

${CAST_LOOK}`,
  arcs: `AT THIS STAGE (sections): sections follow the season phases. The first section establishes the characters and the structural conflict with 2–3 emotional peaks and ends at the PAYWALL episode on the strongest reveal so far (the twist lands within two episodes before to one episode after it). The next deepens the conflict, adds subplots and raises the frequency and stakes of "almost" moments; then the darkest stretch, furthest from resolution; the last resolves secondary arcs first and the central arc last and leaves something open for a renewal. Each section states which reveals, threats, decisions and reversals it spends, in rising order of strength, so no long stretch goes without a big moment.`,
  episodes: `AT THIS STAGE (episodes): every episode is one beat sheet with ONE clear purpose (what is different by the end — if nothing, merge it with the next). For each episode give: "hookType" — the cliffhanger type it ends on (revelation / reversal / deadline / intrusion / arrival / withheld), never the same as the previous episode's; "goal" and "mainConflict" (the want and the obstacle between TWO people); "powerStart" / "powerEnd"; "turns" — the beats on the timing grid, in order (hook at 0–3 s, friction, the turn, the spike that passes the mute test, the button in the last 5–10 s), about one every 30 s; "cliffhanger" — the exact final image or line at the cut (a face, an action, a line; never a summary) and "cliffhangerQuestion" — the one question it leaves; "firstActionNext" — how the next episode pays it off inside ~10 s. Keep 1–2 characters on screen per scene, the episode inside 1–2 locations, and the spoken words within the budget of 135 a minute. Episode 1 ends when the problem becomes personal; 2 on the opponent's first move; 3 on the first failed attempt; the last free episode on the strongest reveal.`,
  outline: `AT THIS STAGE (scenes of the episodes): 1–3 scenes per episode, each one continuous location and moment, at most one scene change per 20 seconds (each new location adds drift), 1–2 characters per scene. The episode's FIRST scene opens inside the conflict — the hook is readable in 3 s, no scenery, no backstory; later scenes of an episode may open on a close detail of the new place (a doorway, a desk, a sign — never a wide shot) before the first line. Each scene's summary names its beat (hook / friction / turn / spike / button), the evidence on screen (texts, calls, files, objects), the key-light direction, and the reaction beats (hands, a look away, an almost-spoken line). The last scene ends on the named moment of the cliffhanger. Write each scene so it changes something; a scene with no change is not a scene yet.`,
  shots: `AT THIS STAGE (shots): shots of 3–6 seconds, one beat per shot (never a whole exchange in one clip). Plan the 3–5 ANCHOR shots that carry the emotional weight first, then the shots around them; every episode has an opening hook shot, close-ups for emotion, alternating tight singles (or over-the-shoulder) for the confrontation, insert shots for the evidence (a phone screen, a document, an object — readable), extra reaction shots (a shocked look, a guilty pause, a suspicious glance, someone reading a phone) and a cliffhanger shot. ONE subject per frame; two people are alternating singles, never side by side; depth is built vertically (foreground low, subject above, environment behind). A new location is established by a close detail, not a wide shot. No shot shows a speaking mouth for more than about 5 seconds of continuous speech — cover long lines with reactions and cutaways. Keep the key-light direction and colour temperature within a scene. Mark each shot's "beat" (hook / friction / turn / spike / button). The LAST shot of an episode's last scene is the named moment of the cliffhanger: its notes end with "CLIFF · REVELATION" / "CLIFF · REVERSAL" / "CLIFF · DEADLINE" / "CLIFF · INTRUSION" / "CLIFF · NEW ARRIVAL" / "CLIFF · WITHHELD DECISION". Dialogue as CHARACTER (tone): line, short, no feelings named, no voice-over or inner monologue. Keep one spelling for every name and location.`,
};

// For the image (Gemini Nano Banana 2.1) and video (MiniMax H3) prompt
// writers of a Short Drama 2 series.
export const DRAMA_FRAME_RULE = `VERTICAL MICRO-DRAMA FRAME (9:16) — compose vertical in every prompt; the model defaults to landscape composition unless told where things sit. Zones: the face in the TOP THIRD with the eyeline near the top-third line and the top bar free (the status bar covers it); body, hands, props and anything that must be read (a phone screen, a document) in the MIDDLE THIRD; the BOTTOM THIRD visually quiet for captions; the RIGHT EDGE clear of key action (engagement buttons) — key information stays inside the centre two-thirds of the width. ONE subject per frame — a two-person exchange is alternating tight singles or an over-the-shoulder, never two people side by side; depth is built vertically (foreground low, subject above, environment behind) or near-far, never left-right. Establish a place with a close detail (a doorway, a desk, a sign), not a wide shot. Faces clear and unobstructed; no face cut off at the frame edge; headroom small; name what fills the negative space.

IDENTITY. Paste each character's identity block from the card VERBATIM (age, gender, face shape, eyes, the modern distinctive detail, hair colour and style) plus the anchor garment or accessory; never reword it between shots — a reworded description is a different person. Change only the action, the emotion and the setting between clips; keep camera and environment instructions separate from the identity. Every recurring location repeats its one immutable detail word for word and keeps its key-light direction and colour temperature within the scene. Inserts and cutaways need no character identity.

IMAGE PROMPTS (Nano Banana 2.1): shot type + where the face sits + eyeline + what the bottom third holds; the identity block; the action and the emotion (a reaction beat: the hands, the look away, the almost-spoken word); the location with its immutable detail; the light (source, direction, temperature, softness); a lens and mood for close-ups (shallow depth of field, 35–50 mm feel); a still that must read on a phone — evidence legible, expression clear. Start stable: a composition the video can hold without fast moves.

VIDEO PROMPTS (MiniMax H3): one beat per shot, 3–6 seconds, one or two exchanges of dialogue per clip at most; the identity block verbatim inside the description; the camera static or with one slight move (a slow push-in) — fast spins, rotations, big gestures and sudden lighting changes cause drift, so introduce motion gradually and keep the camera distance and colour temperature of the previous shot; medium shots and tight singles hold identity better than wides or extreme close-ups; every spoken line inside <d>[English] …</d> with a speaker identity; no shot keeps a speaking mouth on screen for more than about 5 seconds — a longer line is split across internal cuts to the listener's reaction or an insert ([Shot 2] At …); clear, readable reactions rather than subtle ones; ambient sound always under dialogue (it also hides lip-sync gaps); no music of any kind (the film is scored in the edit); the cliffhanger shot ends on the named moment, held, with nothing resolved.`;

// Pure data for tools and the agent
export function dramaRulesSummary(project) {
  const n = clampEpisodes(project?.episodeCount || 10);
  const lm = seasonLandmarks(n);
  const r = episodeRange(project || {});
  return {
    source: 'Short Drama 2 — the AI Short Drama Production Manual and the articles it cites',
    format: '9:16 vertical micro-drama; 60–120 s episodes (90 s sweet spot); the unit of success is the next tap',
    episodeSeconds: r,
    premise: 'one sentence: who, the central problem, the stakes; built-in conflict (enemies-to-lovers, forbidden proximity, power imbalance, forced circumstances)',
    engineParts: ['a simple want', 'fresh obstacles every episode', 'a ticking clock', 'an open question'],
    opening: `the hook is readable inside ${OPENING_HOOK_SEC} s: a shocking line, an action under way, a reveal or a reaction — never scenery, voice-over or a slow establishing shot`,
    sceneOpening: 'an episode opens inside the conflict; a later scene of the episode may open on a close detail of the new place (a doorway, a desk, a sign) before the first line — never a wide shot',
    episodeBeats: 'HOOK (0–3 s) → FRICTION → TURN → SPIKE (passes the mute test) → BUTTON (last 5–10 s, one unanswered question); about one beat per 30 s; the "what changed?" test',
    blocks: `8–${SHOCK_EVERY_SEC} s blocks, each changing something; no slow scenes; abrupt cuts welcome`,
    hooks: { types: HOOK_TYPES, labels: HOOK_LABEL, rule: 'rotate the types; a real cliffhanger changes what the viewer believed; cut early; the next episode pays it off inside ~10 s' },
    landmarks: lm,
    paywall: `last free episode ${lm.paywall} ends on the strongest reveal so far; the big twist lands in episodes ${lm.twistFrom}–${lm.twistTo}`,
    dialogue: { maxLineWords: MAX_LINE_WORDS, maxActionWords: MAX_ACTION_WORDS, wordsPerMinute: WORDS_PER_MINUTE, budget: `~${Math.round(WORDS_PER_SEC * 90)} words per 90 s, ~${Math.round(WORDS_PER_SEC * 120)} per 120 s`, forbidden: ['naming feelings', 'voice-over backstory', 'exposition before conflict', 'lines that do not advance the conflict or reveal character'], monologueMouthSec: EXTRAS.monologueMouthSec },
    cast: `the central conflict between two people; ${EXTRAS.maxCharactersPerScene} characters per scene at most; recurring characters only`,
    castLook: 'attractive, contemporary, camera-ready; striking details are modern (tattoo, coloured hair, piercing, accessory) — never a scar, wound or disfigurement as an identifying mark',
    locations: `${EXTRAS.maxLocationsPerSeries} per series at most, ${MAX_LOCATIONS_PER_EPISODE} per episode; a scene change at most every ${EXTRAS.sceneChangeEverySec} s; one immutable detail and a key-light direction per location`,
    shots: `${EXTRAS.shotSec[0]}–${EXTRAS.shotSec[1]} s, one beat each; 3–5 anchor shots; hook shot, close-ups, alternating singles, evidence inserts, extra reactions, cliffhanger shot`,
    frame: 'face in the top third, eyeline on the top-third line; evidence in the middle third; bottom third clear for captions; right edge clear; one subject per frame; depth built vertically',
    captions: `${EXTRAS.captionCharsPerLine} characters a line, ${EXTRAS.captionLines} lines`,
    models: 'video: MiniMax H3 (identity block verbatim, one beat per clip, lines in <d> tags, ≤ 5 s mouth-visible speech, ambient under dialogue, no music); images: Gemini Nano Banana 2.1 (vertical zones stated, identity verbatim, immutable location detail, light direction)',
    timing: { 60: timingGrid(60), 90: timingGrid(90), 120: timingGrid(120) },
  };
}

// ---------------------------------------------------------------- engine hooks
// The pieces of prompt text and checker configuration that differ between
// the two engines (lib/shortDrama/engine.js hands them out as rulesFor()).
export const TAG_PREFIX = 'CLIFF'; // the last shot's note: "CLIFF · REVELATION"
export const FRAME_SHORT = 'vertical 9:16: one subject per frame; the face in the top third with the eyeline on the top-third line; evidence (a phone, a document) in the middle third; the bottom third quiet for captions; the right edge clear; depth built vertically, never two people side by side';
// the "THIS SERIES" landmark sentence of the system prompt
export const landmarksText = (lm, r) => `THIS SERIES: ${lm.total} episodes of ${r.min}–${r.max} seconds. Landmarks: episode 1 ends when the problem becomes personal; episode ${lm.opponentMove} on the opponent's first move; episode ${lm.firstFailure} on the first failed attempt; the establishing phase runs to episode ${lm.establishEnd}; the LAST FREE EPISODE is ${lm.paywall} (the strongest reveal so far) and the big twist lands in episodes ${lm.twistFrom}–${lm.twistTo}; episode ${lm.firstPaid} pays the cliffhanger off inside ~10 s and opens a new question; the deepening phase runs to episode ${lm.deepenEnd}; the darkest point is around episode ${lm.lowPoint}; the resolution starts around episode ${lm.resolveFrom} (secondary arcs first, the central arc last); the finale is episode ${lm.finale} and leaves something open.`;
// the extra rule of the sections prompt
export const arcsNotes = (lm, n) => (n >= 6 ? `\n- The first section ends EXACTLY at episode ${lm.paywall}, the last free episode: its finale is the strongest reveal of the season so far, and the big twist lands between episodes ${lm.twistFrom} and ${lm.twistTo}.` : '');
// the rules of one chunk of the episode plan (cliffhanger rotation and landmarks)
export function episodePlanNotes({ lm, from, to, prevHook, range }) {
  const beats = Math.max(2, Math.round(range.max / TURN_EVERY_SEC));
  const lines = [
    `- Cliffhanger types ("hook_type"): revelation / reversal / deadline / intrusion / arrival (a new character walks in) / withheld (a decision made, not shown); rotate them — never the same type in two consecutive episodes${prevHook ? ` (episode ${from - 1} ended on ${(HOOK_LABEL[prevHook] || prevHook).toUpperCase()})` : ''}; a real cliffhanger changes what the viewer believed.`,
    `- "turns": the beats of the episode on its timing grid, in order — the hook (0–3 s), the friction, the turn, the spike (a reveal or reversal that passes the mute test) and the button; about one beat per ${TURN_EVERY_SEC} s (${beats} in ${range.max} s); "summary" says what is different by the end of the episode (the "what changed?" test).`,
    `- "power_start" / "power_end": who holds the power when the episode opens and when it cuts.`,
    `- "cliffhanger" is the exact final image or line at the cut (a face, an opening door, an unfinished line — never a summary), cut a little earlier than feels comfortable; "cliffhanger_question" the one question it leaves; "first_action_next" how the next episode pays it off inside ~10 s before a new question opens.`,
  ];
  const at = (n, text) => { if (n >= from && n <= to) lines.push(text); };
  at(1, `- Episode 1 opens on the conflict and ends when the lead's problem becomes personal.`);
  at(lm.opponentMove, `- Episode ${lm.opponentMove} establishes who wants what and who opposes them, ending on the opponent's first move.`);
  at(lm.firstFailure, `- Episode ${lm.firstFailure}: the lead's first attempt to fix things fails or backfires.`);
  at(lm.paywall, `- Episode ${lm.paywall} is the LAST FREE EPISODE: it ends on the strongest reveal of the season so far (a revelation or a reversal), the one that makes the viewer pay.`);
  if (lm.twistFrom <= to && lm.twistTo >= from) lines.push(`- The big twist of the season lands between episodes ${lm.twistFrom} and ${lm.twistTo}; the twist episode ends on the reveal.`);
  if (lm.firstPaid > lm.paywall) at(lm.firstPaid, `- Episode ${lm.firstPaid} is the first paid episode: it pays the paywall cliffhanger off inside about 10 seconds, then opens a new question.`);
  at(lm.lowPoint, `- Episode ${lm.lowPoint} sits at the darkest point of the season, furthest from resolution.`);
  if (lm.resolveFrom >= from && lm.resolveFrom <= to) lines.push(`- From episode ${lm.resolveFrom} the secondary arcs resolve, one per episode, the central arc last.`);
  at(lm.finale, `- Episode ${lm.finale} is the finale: it resolves the central arc and still leaves something open.`);
  return `\n${lines.join('\n')}`;
}
// the note of the shot-breakdown prompt: where this scene sits in its episode
export function shotsSceneNote({ first, last, ep, epSec, planned }) {
  const hook = planned?.hookType && HOOK_TYPES.includes(planned.hookType) ? HOOK_LABEL[planned.hookType] : null;
  return `\n\nSHORT DRAMA 2 — this scene is${first ? ' the FIRST scene' : ''}${first && last ? ' and' : ''}${last ? ' the LAST scene' : ''}${!first && !last ? ' a middle scene' : ''} of episode ${ep || '?'} (${epSec} s in all). Timing grid of the episode:\n${timingText(epSec)}${first ? `\n- Shot 1 is the HOOK SHOT, at most ${OPENING_HOOK_SEC} seconds: the episode opens in the middle of the conflict — a shocking line, an action under way, a reveal or a reaction — readable by a stranger with no backstory; no scenery, no slow establishing shot, no recap, no voice-over.` : `\n- Shot 1 of this scene has no dialogue: a close detail of the new place (a doorway, a desk, a sign, a face in the new light) of 2–3 seconds — never a wide shot — then the first line in shot 2.`}${last ? `\n- The final shot is the cliffhanger: the named moment${planned?.cliffhanger ? ` — "${planned.cliffhanger}"` : ''}, held, nothing resolved; the last 3 seconds carry the hook; its "notes" end with "CLIFF · ${hook || 'REVELATION / REVERSAL / DEADLINE / INTRUSION / NEW ARRIVAL / WITHHELD DECISION'}".` : ''}${planned?.turns?.length ? `\n- Beats of this episode: ${planned.turns.join(' · ')}.` : ''}\n- Shots of ${EXTRAS.shotSec[0]}–${EXTRAS.shotSec[1]} seconds, one beat each, every shot names its "beat"; one subject per frame (alternating singles for an exchange); insert shots for the evidence; extra reaction shots; a block of ${EXTRAS.blockSec[0]}–${EXTRAS.blockSec[1]} seconds without new information, rising tension or an emotional shift is cut; no speaking mouth on screen for more than ${EXTRAS.monologueMouthSec} seconds of one line (cover it with the listener's reaction or an insert); dialogue lines under ${MAX_LINE_WORDS} words, no feelings named, no em dashes, no voice-over.`;
}
// what the deterministic check (check.js) looks for in this engine
export const CHECK = {
  hookTypesText: 'revelation / reversal / deadline / intrusion / arrival / withheld',
  openBeat: 'hook',
  cliffBeat: 'button',
  turnBeats: ['turn', 'spike', 'button'],
  quietBeats: ['friction'],
  weakPaywallHooks: ['deadline', 'withheld'],
  paywallHint: 'the strongest reveal of the season so far — a revelation or a reversal, not a clock or a withheld choice',
  firstWin: false,
  sceneOpensQuiet: false, // only the later scenes of an episode open on a detail
  maxLocationsPerSeries: EXTRAS.maxLocationsPerSeries,
  maxMouthSec: EXTRAS.monologueMouthSec,
};
