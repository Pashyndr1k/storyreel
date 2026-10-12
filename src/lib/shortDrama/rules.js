// The short-drama engine: the conventions of the vertical short drama as
// data and as instructions, applied at every text stage of a series project.
// Sources: the 2026 "Short Drama Production Craft Guide" and the references it
// cites (SceneMixer script format, OutlierKit beat timing, Lollipop hook
// formula and genre menu, the short-drama toolkit's villain / payoff rules,
// the vertical-showrunner dialogue rules, clipcurator's episode sheet,
// hamlog's 15-second cuts). The sub-genre (comedy, revenge, sci-fi …) comes
// from the style library's "drama" category and only colours these rules.
import { episodeRange, clampEpisodes } from '../series.js';

export const isShortDrama = (project) => project?.scriptType === 'series';

export const HOOK_TYPES = ['identity', 'emotion', 'realisation'];
export const HOOK_LABEL = { identity: 'IDENTITY', emotion: 'EMOTION', realisation: 'REALISATION' };
// the first five episodes end on fixed hook types (SceneMixer)
export const OPENING_HOOKS = ['identity', 'emotion', 'realisation', 'identity', 'emotion'];
export const BEATS = ['open', 'orient', 'turn', 'squeeze', 'reversal', 'cliff'];
// the note the last shot of an episode must carry
export const HOOK_TAG = /HOOK\s*[·:\-]\s*(IDENTITY|EMOTION|REALISATION|REALIZATION)/i;

// Dialogue limits (phone captions hold 6–8 words a line)
export const MAX_LINE_WORDS = 20;
export const MAX_ACTION_WORDS = 40;
export const WORDS_PER_SEC = 3; // spoken
export const MAX_LOCATIONS_PER_EPISODE = 4;
export const OPENING_HOOK_SEC = 5; // the conflict must be visible inside this
export const TURN_EVERY_SEC = 30;
export const SHOCK_EVERY_SEC = 15; // something visibly or emotionally shifts

// Season landmarks for `total` episodes (OutlierKit's 50-episode sheet scaled,
// the first five episodes fixed, the paid checkpoint after the first quarter).
export function seasonLandmarks(total) {
  const n = clampEpisodes(total);
  const at = (f, min = 1) => Math.max(min, Math.min(n, Math.round(n * f)));
  return {
    total: n,
    inciting: 1,
    firstWinBy: Math.min(5, n),
    firstReversal: n <= 6 ? Math.min(3, n) : at(0.16, 3),
    paywall: n <= 4 ? n : Math.max(3, Math.min(n - 1, Math.round(n / 4))),
    midBetrayal: n <= 4 ? Math.max(2, n - 1) : at(0.5, 2),
    climax: n <= 3 ? n : Math.max(2, Math.min(n - 1, Math.round(n * 0.96))),
    finale: n,
  };
}

// The hook type an episode is expected to end on: fixed for 1–5, then any
// type that differs from the previous episode's.
export const expectedHook = (n) => (n >= 1 && n <= 5 ? OPENING_HOOKS[n - 1] : null);

// The timing grid of one episode of `sec` seconds (the guide's 60 / 90 / 120
// diagnostics, scaled for other lengths).
export function timingGrid(sec) {
  const s = Math.max(30, Number(sec) || 90);
  const t = (f) => Math.round(s * f);
  if (s <= 70) {
    return [
      ['0–5s', 'Conflict is visible or spoken immediately.'],
      [`5–${t(0.5)}s`, 'Orient the viewer while tightening the conflict.'],
      [`≈${t(0.5)}s`, 'Escalation changes leverage or removes an option.'],
      [`≈${t(0.75)}s`, 'Reveal or reversal changes what the scene means.'],
      [`${t(0.92)}–${s}s`, 'Cut on one specific unanswered question.'],
    ];
  }
  if (s <= 100) {
    return [
      ['0–5s', 'Conflict begins before complete context.'],
      [`5–${t(0.33)}s`, 'Pressure establishes the want and immediate stakes.'],
      [`≈${t(0.33)}s`, 'First turn: new information, allegiance, or danger.'],
      [`${t(0.33)}–${t(0.66)}s`, 'Consequences narrow the lead’s choices.'],
      [`≈${t(0.66)}s`, 'Second turn or reversal.'],
      [`${t(0.9)}–${s}s`, 'Identity, emotion, or realisation hook.'],
    ];
  }
  return [
    ['0–5s', 'Visible disruption and unanswered question.'],
    [`5–${t(0.25)}s`, 'Active orientation; no neutral exposition.'],
    [`≈${t(0.25)}s`, 'First turn changes leverage.'],
    [`${t(0.25)}–${t(0.5)}s`, 'Conflict squeeze and physical response.'],
    [`≈${t(0.5)}s`, 'Second turn or reveal.'],
    [`${t(0.5)}–${t(0.75)}s`, 'Consequence creates a harder choice.'],
    [`≈${t(0.75)}s`, 'Final escalation or reversal.'],
    [`${t(0.92)}–${s}s`, 'Interrupt before the new state settles.'],
  ];
}
export const timingText = (sec) => timingGrid(sec).map(([a, b]) => `  ${a.padEnd(10)} ${b}`).join('\n');

// ---------------------------------------------------------------- the brief
// The core mechanics, in every text stage of a series.
export const DRAMA_CORE = `SHORT DRAMA ENGINE — the format you are writing for is the vertical short drama: 9:16, episodes of one to two minutes, watched on a phone with a thumb ready to swipe, often with the sound off and captions on. These conventions are binding at every stage; the sub-genre brief (if any) colours tone, world and plot types but never overrides them.

THE DRAMATIC UNIT. An episode is a controlled interruption: ONE charged situation that changes state, stops before the new state settles, and hands the unresolved pressure to the next episode. Do not compress a normal scene into fewer seconds — EXCAVATE: find the one physical moment that contains the whole scene (the ring on the table, the packed suitcase, the signature on the page) and start there. Enter when the accusation is already being made, the document already on the table, the door already open. No calm arrivals, greetings, recaps or gradual arguments.

THE OPENING (0–3 s, at most 5 s). The first image or first line IS the conflict: [ordinary state] + [sudden visible disruption] + [unanswered question], all inside the first three seconds. Context comes later, through pressure, never through neutral exposition. The viewer must understand the stake before the context is complete.

PROGRESSION. The lead loses options, not merely learns facts. A new fact counts only if it changes who holds leverage, what must happen next, or what the audience believes about an earlier event. Turn the story about every 30 seconds (a 90-second episode turns at least twice: new information, shifted allegiance, escalated danger) and let something visibly or emotionally shift every 15 seconds. Every turn subtracts something from the lead (a route, an ally, a resource, a belief).

THE CLIFFHANGER changes its mode. Every episode ends on one of three hooks, labelled: IDENTITY (someone is not who they claimed), EMOTION (a confession, refusal or rupture left hanging), REALISATION (the lead and the viewer discover an earlier judgement was wrong). No two consecutive episodes end on the same type. The hook is one precise unresolved action or line, cut before the new state settles — a face as the final image, never a fade, a summary or a reflection. Episode 1 ends on IDENTITY, 2 on EMOTION, 3 on REALISATION, 4 on IDENTITY, 5 on EMOTION. The next episode answers that exact question in its first seconds before introducing anything new, re-staging the power relation through an accusation, a prop or a reaction — never a narrated recap.

SEASON ENGINE. Plan the whole arc before any episode: episode 1 = the lead's situation, first trap and want; 2 = the antagonist in active conflict and the stakes on the table (money, marriage, life, reputation), the lead cornered; 3 = the first reversal (the apparent weakling shows a card, an ally turns); 4–5 = the first genuine WIN (a confrontation won, evidence, a turnaround) and the bigger problem behind it — the first win no later than episode 5. The PAID CHECKPOINT sits after the first quarter of the season: that episode must deliver the strongest hook so far (a jaw-drop reveal or reversal) and the episode before it the biggest payoff so far. A mid-season betrayal, a climax near the end that forces a choice between two established values (not one more piece of evidence), and a finale that resolves everything. Track four variables: what the lead wants, what the antagonist can credibly take, what secret or misconception is still active, what irreversible cost the latest turn introduced. Escalate by changing the COST, not by repeating humiliation.

PLOT MECHANISMS are expectation contracts: hidden power or identity (others act on a false status judgement while the lead delays disclosure — the reveal must reverse a specific public misjudgement), underdog revenge (each episode adds a concrete injustice or removes a route to redress; evidence, allegiance or authority returns agency), contract relationship (public obligation and private feeling move at different speeds; a choice proves the change before a declaration explains it), secret child or heir (concealed kinship multiplies stakes; the disclosure must alter responsibility). Villains commit their error ON SCREEN: they boast, humiliate, threaten or misjudge in front of witnesses; the payoff answers that exact humiliation (identity reveal, evidence counter, mass defection, destruction of the villain's practical power) in front of the same witnesses.

CHARACTERS are pressure functions. The lead stores delayed status; the avenger turns injustice into motion with a concrete "punch" each episode; the cold executive or protector supplies status asymmetry; the scheming rival externalises the false judgement and keeps witnesses present; the mentor never solves the lead's conflict. Write playable profiles: active want, visible method, hidden leverage, shame trigger, speech rhythm, one repeatable physical strategy under pressure (stillness, invading distance, handling an object, avoiding eye contact, abrupt exits), one recurring physical motif whose handling shows the inner state. "Confident" is not an instruction; "answers questions with a counter-question until the child is threatened" is. Keep the cast small; nobody stays ambiguous for long.

DIALOGUE. Lines under 20 words (a caption line holds six to eight). Action lines under 40 words, only what can be seen or heard. About three spoken words per second; 180–360 spoken words in a one-to-two-minute episode, in 18–25 effective lines: 6–8 for the opening conflict, 6–8 for the escalation, 5–8 for the twist or hook, with reactions, action beats and object close-ups between them. No em dashes — full stops for staccato pacing. No voice-over, no internal monologue, no narration: an inner thought becomes something visible or audible or is cut. Be on the nose about circumstance, intention and stakes ("You forged my signature.") and never about emotion the face already shows; keep the subtext in the mismatch between the clean claim and the body ("I don't care." while pocketing the photograph). Every line advances the conflict or reveals character under pressure; exposition must cost the asker something. Format: CHARACTER (tone): line.

VERTICAL FRAME. Close-ups are the baseline, wide shots a luxury. Faces and hands carry the scene; two-person dialogue alternates tight singles rather than a two-shot; foreground is power, background is threat; objects motivate inserts. Three or four locations per episode at most. Write what AI video renders well (two-person close-ups, single-character beats, hard light, rain, in-car scenes) and avoid what it does not (crowds, fights with choreography, readable text close-ups, more than four people in frame).`;

// Stage-specific instructions (appended to DRAMA_CORE)
export const DRAMA_STAGE = {
  ideas: `AT THIS STAGE (plot directions): each direction is a short-drama premise that fits one sentence and stands on a trope the audience already wants. Put the invention into the execution. For EVERY direction, state inside "pitch", as labelled lines: Trope (the mechanism), Opening (the first three seconds: ordinary state + visible disruption + unanswered question), Episode 1 trap, First win (which episode ≤ 5 and what is won), Quarter hook (the paid-checkpoint episode's jaw-drop), Season promise (the final payoff that answers the opening humiliation). Pick the opening pressure for the sub-genre: a status flip for romance, an injustice for revenge, a power reveal for CEO stories, a rule break for fantasy, a wrong-body / wrong-world shock for sci-fi, an absurd rule taken seriously for comedy.`,
  storyline: `AT THIS STAGE (storyline and cast): the synopsis is the season spine in order — the wrong and the first trap (ep 1), the antagonist and the stakes (ep 2), the first reversal (ep 3), the first win and the larger problem (by ep 5), the paid-checkpoint jaw-drop at the first quarter, the mid-season betrayal, the late choice between two values, the finale that resolves the opening humiliation in front of the same witnesses. Name the active secret or misconception and when it pays off. Each character description is a PRODUCTION PROFILE: age and appearance (consistent across AI generation), then — in one or two sentences each — active want, visible method, hidden leverage, shame trigger, speech rhythm, physical strategy under pressure, recurring physical motif. Villains are built to boast, humiliate, threaten and misjudge on screen.`,
  arcs: `AT THIS STAGE (sections): sections are the escalation curve. The first section contains the wrong, the first trap, the antagonist's open humiliation and the first win (by episode 5). One section ends EXACTLY at the paid-checkpoint episode (the first quarter), on the strongest hook so far. A section near the middle carries the betrayal; the last one the climax and finale. Each section changes the COST of action, not just the opponent.`,
  episodes: `AT THIS STAGE (episodes): every episode is one dramatic unit in 1–2 locations: cold open inside the disruption, conflict squeeze, reversal, cliffhanger. For each episode give the goal, the main conflict, who holds the power at the start and at the end, 2–3 turns (each removes an option or shifts leverage), the beat-by-beat summary on the timing grid, the exact final image or line at the cut, its hook type, the one question the cut leaves open, and the first action of the next episode (which answers that question). Rotate hook types: 1 identity, 2 emotion, 3 realisation, 4 identity, 5 emotion; afterwards never the same type twice in a row. The first win lands by episode 5. The paid-checkpoint episode delivers the biggest jaw-drop so far. Villains commit their error on screen before witnesses; payoffs answer the exact humiliation.`,
  outline: `AT THIS STAGE (scenes of the episodes): 1–3 scenes per episode, each a single continuous location and moment, 3–4 locations per episode at most. The episode's first scene opens INSIDE the disruption, answering the previous cliffhanger's question in its first seconds through action, a prop or an accusation — no recap. The last scene ends exactly on the episode's hook (its "beat" is "cliff"). Mark each scene's beat: open (0–5 s conflict visible), orient (context through pressure), turn (leverage changes), squeeze (options narrow), reversal, cliff. Scene durations follow the grid of the episode length.`,
  shots: `AT THIS STAGE (shots): shots of 2–6 seconds, mostly tight singles and inserts. EVERY SCENE OPENS WITH A SHOT WITHOUT DIALOGUE: an atmosphere shot of 2–4 seconds — the place, the light, a telling detail or a face before anyone speaks — that lets the viewer settle into the new location; the scene's first line is spoken in its second shot. For an episode's FIRST scene that opening shot is at most 5 seconds and already shows the conflict through action, a face or an object (still no dialogue, no slow establishing pan, no recap). Something visibly or emotionally shifts at least every 15 seconds; mark each shot's "beat" (open / orient / turn / squeeze / reversal / cliff). Dialogue as CHARACTER (tone): line, under 20 words a line, no em dashes, no voice-over or inner monologue; reactions and object close-ups between lines. The LAST shot of an episode's last scene is the hook frame: a face, the unresolved action or line, and its notes end with "HOOK · IDENTITY" / "HOOK · EMOTION" / "HOOK · REALISATION". Keep one spelling for every name and location.`,
};

// For the image / video prompt writers (appended to their rules for a series).
export const DRAMA_FRAME_RULE = `VERTICAL SHORT DRAMA FRAME (9:16): the subject fills the frame — faces and hands at the baseline, wide shots rare and motivated; two people in dialogue as alternating tight singles rather than a two-shot; foreground is power, background is threat; an object (ring, phone, document, suitcase) motivates an insert. Keep the lower fifth of the frame free of essential detail (captions live there) and the right edge clear of important action (interface controls). Hook frames (the last shot of an episode) end on a face holding the unresolved question. First frames of an episode show the conflict, not the setting.`;

// Pure data for tools and the agent
export function dramaRulesSummary(project) {
  const n = clampEpisodes(project?.episodeCount || 30);
  const lm = seasonLandmarks(n);
  const r = episodeRange(project || {});
  return {
    format: '9:16 vertical, one dramatic unit per episode',
    episodeSeconds: r,
    opening: `conflict visible inside ${OPENING_HOOK_SEC} s (ideally 3): ordinary state + disruption + unanswered question`,
    sceneOpening: 'every scene opens with a shot WITHOUT dialogue (2–4 s: the place, the light, a detail or a face) so the viewer settles into the new location; the first line comes in the second shot — an episode\'s first scene keeps that opening shot ≤ 5 s and shows the conflict through action',
    turns: `leverage changes every ~${TURN_EVERY_SEC} s; a visible or emotional shift every ${SHOCK_EVERY_SEC} s`,
    hooks: { types: HOOK_TYPES, firstFive: OPENING_HOOKS, rule: 'no two consecutive episodes end on the same type; the next episode answers the question first' },
    landmarks: lm,
    dialogue: { maxLineWords: MAX_LINE_WORDS, maxActionWords: MAX_ACTION_WORDS, wordsPerSec: WORDS_PER_SEC, linesPerEpisode: '18–25 (6–8 / 6–8 / 5–8)', forbidden: ['em dashes', 'voice-over', 'internal monologue', 'narration', 'lines that restate what the face shows'] },
    frame: 'close-ups baseline; alternating tight singles; foreground = power, background = threat; captions in the lower fifth; ≤ 4 locations per episode',
    timing: { 60: timingGrid(60), 90: timingGrid(90), 120: timingGrid(120) },
  };
}

// ---------------------------------------------------------------- engine hooks
// The pieces of prompt text and checker configuration that differ between
// the two engines (lib/shortDrama/engine.js hands them out as rulesFor()).
export const TAG_PREFIX = 'HOOK'; // the last shot's note: "HOOK · IDENTITY"
export const FRAME_SHORT = 'vertical 9:16: the subject fills the frame, faces and hands carry it; tight singles for dialogue; foreground = power, background = threat; the lower fifth free for captions; at most 4 people in frame';
// the "THIS SERIES" landmark sentence of the system prompt
export const landmarksText = (lm, r) => `THIS SERIES: ${lm.total} episodes of ${r.min}–${r.max} seconds. Landmarks: first win by episode ${lm.firstWinBy}; first reversal around episode ${lm.firstReversal}; PAID CHECKPOINT at episode ${lm.paywall} (the strongest hook so far); mid-season betrayal around episode ${lm.midBetrayal}; climax around episode ${lm.climax}; finale in episode ${lm.finale}.`;
// the extra rule of the sections prompt
export const arcsNotes = (lm, n) => (n >= 12 ? `\n- One section ends EXACTLY at episode ${lm.paywall}, the paid checkpoint: its finale is the strongest hook of the first quarter.` : '');
// the rules of one chunk of the episode plan (hook rotation and landmarks)
export function episodePlanNotes({ lm, from, to, prevHook, range }) {
  const hookRules = [];
  for (let k = from; k <= to; k++) if (OPENING_HOOKS[k - 1]) hookRules.push(`episode ${k} ends on ${OPENING_HOOKS[k - 1].toUpperCase()}`);
  return `
- Hook types: ${hookRules.length ? hookRules.join(', ') + '; ' : ''}never the same type in two consecutive episodes${prevHook ? ` (episode ${from - 1} ended on ${prevHook.toUpperCase()})` : ''}. Each episode names its "hook_type".
- "turns": 2–3 moments where leverage changes or an option is removed, in order; "summary" places them on the timing grid of a ${range.min}–${range.max} s episode (0–5 s the conflict visible, a turn about every 30 s, the hook in the last seconds).
- "power_start" / "power_end": who holds the power when the episode opens and when it cuts.
- "cliffhanger" is the exact final image or line at the cut (a face, an action, a line — never a summary); "cliffhanger_question" the one question it leaves; "first_action_next" the first action of the next episode, which answers it before anything new.${from <= lm.firstWinBy && to >= 4 ? `\n- The lead's FIRST GENUINE WIN lands by episode ${lm.firstWinBy}, and the bigger problem behind it is revealed right after.` : ''}${lm.paywall >= from && lm.paywall <= to ? `\n- Episode ${lm.paywall} is the PAID CHECKPOINT: the biggest jaw-drop reveal or reversal so far, on an identity or realisation hook; episode ${lm.paywall - 1} carries the biggest payoff so far.` : ''}${lm.midBetrayal >= from && lm.midBetrayal <= to ? `\n- Episode ${lm.midBetrayal} carries the mid-season betrayal.` : ''}`;
}
// the note of the shot-breakdown prompt: where this scene sits in its episode
export function shotsSceneNote({ first, last, ep, epSec, planned }) {
  const hook = planned?.hookType && HOOK_TYPES.includes(planned.hookType) ? HOOK_LABEL[planned.hookType] : null;
  return `\n\nSHORT DRAMA — this scene is${first ? ' the FIRST scene' : ''}${first && last ? ' and' : ''}${last ? ' the LAST scene' : ''}${!first && !last ? ' a middle scene' : ''} of episode ${ep || '?'} (${epSec} s in all). Timing grid of the episode:\n${timingText(epSec)}${first ? '\n- Shot 1 runs at most 5 seconds and shows the conflict (a face, an object, an action), answering the previous cliffhanger through action — no dialogue in it, no slow establishing pan, no recap.' : ''}\n- SHOT 1 OF THIS SCENE HAS NO DIALOGUE: an atmosphere shot of 2–4 seconds (the place, the light, a telling detail or a face) that lets the viewer settle into the new location; the scene's first line is spoken in shot 2.${last ? `\n- The final shot is the hook frame: a face holding the unresolved action or line${planned?.cliffhanger ? ` — "${planned.cliffhanger}"` : ''}; its "notes" end with "HOOK · ${hook || 'IDENTITY / EMOTION / REALISATION'}".` : ''}${planned?.turns?.length ? `\n- Turns of this episode: ${planned.turns.join(' · ')}.` : ''}\n- Every shot names its "beat"; something visibly or emotionally shifts at least every ${SHOCK_EVERY_SEC} seconds; dialogue lines under ${MAX_LINE_WORDS} words, no em dashes, no voice-over.`;
}
// what the deterministic check (check.js) looks for in this engine
export const CHECK = {
  hookTypesText: 'identity / emotion / realisation',
  openBeat: 'open', // the first scene of an episode
  cliffBeat: 'cliff', // the last scene of an episode
  turnBeats: ['turn', 'reversal', 'cliff'], // counted as turns
  quietBeats: ['orient'], // not a shift
  weakPaywallHooks: ['emotion'],
  paywallHint: 'an identity or realisation jaw-drop rather than a held emotion',
  firstWin: true, // the lead wins something by firstWinBy
  sceneOpensQuiet: true, // every scene's first shot has no dialogue
  maxLocationsPerSeries: 0, // no series-wide cap
  maxMouthSec: 0, // no cap on a speaking mouth
};
