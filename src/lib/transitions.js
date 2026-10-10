// The transition INTO the next shot, chosen from what happens in the two
// shots — not only from the scene's energy class. Abrupt cuts carry action
// and sudden events; soft ones carry slow, quiet moments; a fade to black
// marks a jump in time or place. The assembly's automatic choice and the
// agent's storyreel_set_transitions { auto: true } both use this; a manual
// pick per boundary (project.shotTransitions) always wins.
import { transitionFor } from './dynamics.js';

export const TRANSITION_TYPES = ['smash_cut', 'match_action_cut', 'directional_crossfade', 'soft_cut', 'rest_cut', 'dissolve', 'dip_to_black', 'dip_to_white', 'wipe_left', 'slide_left', 'circle_open', 'whip_pan'];
export const ABRUPT = ['smash_cut', 'match_action_cut', 'whip_pan'];
export const SMOOTH = ['soft_cut', 'dissolve', 'directional_crossfade', 'rest_cut', 'dip_to_black', 'dip_to_white'];

const ACTION_WORDS =
  /\b(run|runs|running|sprint|chase|chas(ed|ing)|fight|fights|punch|hit|hits|slam|slams|smash|crash|explo|gunshot|shoot|shot fired|fire[sd]?\b|grab|grabs|snatch|throw|throws|shove|push(es)?|kick|lunge|leap|jump|jumps|scream|shout|yell|slap|strike|struggle|collap|fall[s]?\b|stumble|burst|break[s]?\b|shatter|flee|escape|attack|strik|rush|dash|whip|swerve|skid|brake|tackle|dodge|duck[s]?\b|flinch)\b|бежит|бег|драк|удар|бьёт|бьет|хвата|швыр|толка|кричит|крик|взрыв|выстрел|падает|врыва|вскак|броса|ломает|разбива|биж|бійк|удар|б'є|хапа|кида|штовха|кричить|вибух|постріл|пада/i;
const SLOW_WORDS =
  /\b(slow(ly)?|quiet(ly)?|silence|silent|gentle|gently|softly|still|calm|pause[sd]?|linger|gaze|stares?|watches|waits?|breath(es|ing)?|sits? (down|alone)|lies|rests?|dream|memory|remember|tears?|weeps?|cries|smiles? (faintly|softly)|dusk|dawn|sunset|sunrise|tender|caress|embrace)\b|медленн|тихо|тишин|молч|смотрит|ждёт|ждет|дышит|сидит|лежит|плачет|слёз|слез|вспомина|нежн|обнима|повільн|тихо|мовч|дивиться|чекає|дихає|сидить|лежить|плаче|сльоз|згаду|ніжн|обійм/i;
const TIME_JUMP = /\b(later|next (day|morning|night|week|month|year)|hours? later|days? later|years? later|meanwhile|that (night|evening|morning)|the next|months? later|flashback|years? ago|earlier)\b|позже|спустя|на следующ|тем временем|той же ночью|наутро|пізніше|згодом|наступн|тим часом|вранці/i;

const text = (s) => `${s?.shotType || ''}. ${s?.action || ''} ${s?.notes || ''}`;
const energy = (b) => Number(b?.kinetic_energy_level) || 5;

// { type, reason } for the boundary between two consecutive shots
export function suggestTransition(prev, next, { prevBlock = null, nextBlock = null, sameScene = true, sceneChange = false, episodeEnd = false, nextSummary = '' } = {}) {
  if (!prev || !next) return { type: 'match_action_cut', reason: 'edge' };
  const a = text(prev);
  const b = text(next);
  const act = ACTION_WORDS.test(a) || ACTION_WORDS.test(b);
  const slow = SLOW_WORDS.test(a) && SLOW_WORDS.test(b);
  const short = (Number(prev.duration) || 0) <= 2.5 || (Number(next.duration) || 0) <= 2.5;
  const e = Math.max(energy(prevBlock), energy(nextBlock));
  if (episodeEnd) return { type: 'dip_to_black', reason: 'end of the episode' };
  if (!sameScene) {
    if (TIME_JUMP.test(`${b} ${nextSummary}`)) return { type: 'rest_cut', reason: 'a jump in time — fade to black' };
    if (act || e >= 7) return { type: 'smash_cut', reason: 'the next scene opens on action' };
    return sceneChange ? { type: 'soft_cut', reason: 'a new place, quiet — short fade' } : { type: 'match_action_cut', reason: 'continuous' };
  }
  if (act || e >= 8 || (short && e >= 6)) return { type: 'smash_cut', reason: 'action — abrupt cut' };
  if (TIME_JUMP.test(b)) return { type: 'dissolve', reason: 'time passes within the scene' };
  if (slow || e <= 3) return { type: 'soft_cut', reason: 'slow, quiet beat — soft cut' };
  if ((prev.dialogue || '').trim() && (next.dialogue || '').trim()) return { type: 'match_action_cut', reason: 'continuous dialogue — plain cut' };
  // otherwise the scene's rhythm decides
  const base = transitionFor(prevBlock, nextBlock);
  return { type: base.transition_type, reason: 'scene rhythm' };
}

// Every boundary of a project's assembly: [{ index, shotId, nextShotId, suggested, reason, override }]
export function boundariesOf(project, blockOf = () => null) {
  const list = [];
  const scenes = project.outline || [];
  const eps = new Set();
  scenes.forEach((sc, i) => {
    const nx = scenes[i + 1];
    if (nx && nx.episode && sc.episode && nx.episode !== sc.episode) eps.add(sc.id);
  });
  const flat = scenes.flatMap((sc) => (project.sceneDetails?.[sc.id]?.shots || []).map((sh) => ({ sh, sc })));
  for (let i = 0; i < flat.length - 1; i++) {
    const { sh, sc } = flat[i];
    const { sh: n, sc: nsc } = flat[i + 1];
    const sameScene = sc.id === nsc.id;
    const s = suggestTransition(sh, n, {
      prevBlock: blockOf(sc),
      nextBlock: blockOf(nsc),
      sameScene,
      sceneChange: !sameScene && (sh.location || '') !== (n.location || ''),
      episodeEnd: !sameScene && eps.has(sc.id),
      nextSummary: sameScene ? '' : nsc.summary || '',
    });
    const override = (project.shotTransitions || {})[sh.id];
    list.push({ index: i, shotId: sh.id, nextShotId: n.id, suggested: s.type, reason: s.reason, override: override && override !== 'auto' ? override : null });
  }
  return list;
}
