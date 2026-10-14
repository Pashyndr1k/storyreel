// The "unconventional plot" options of Stage 1 — all off by default, each one
// a project flag (project.originality):
//   sampling    verbalized sampling at Stage 1 (Zhang et al., ICML 2026)
//   subversion  the subversion pass at Stage 2
//   writing     the writing rules for scenes, shots and the smart edit
//   dice        story dice: words pinned to points of the timeline
//   structure   structure die: a dramatic situation or form for one act
//   interview   the story interview: three questions, the author's answers
// The texts the prompts need live here; prompts.js reads the flags and
// appends what is on.
import storyDice from '../data/story_dice.json';
import plotBlocks from '../data/plot_blocks.json';

export const ORIGINALITY_KEYS = ['sampling', 'subversion', 'writing', 'dice', 'structure', 'interview'];
export const normalizeOriginality = (o) => Object.fromEntries(ORIGINALITY_KEYS.map((k) => [k, !!(o && o[k])]));
export const originalityOf = (project) => normalizeOriginality(project?.originality);

// ---- story dice --------------------------------------------------------------
export const DICE_SLOTS = ['open', 'early', 'middle', 'late', 'end'];
export const DICE_MAX = 5;
const DICE_WORDS = Object.values(storyDice || {}).flat().filter((w) => typeof w === 'string');
export const diceWordCount = () => DICE_WORDS.length;
export function rollDiceWord(exclude = []) {
  const pool = DICE_WORDS.filter((w) => !exclude.includes(w));
  const list = pool.length ? pool : DICE_WORDS;
  return list[Math.floor(Math.random() * list.length)] || '';
}
export const normalizeDice = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((d) => d && typeof d.word === 'string')
    .map((d) => ({ word: d.word.trim().slice(0, 60), at: DICE_SLOTS.includes(d.at) ? d.at : 'middle' }))
    .filter((d) => d.word)
    .slice(0, DICE_MAX);

// ---- structure die -------------------------------------------------------------
export const PLOT_BLOCKS = Array.isArray(plotBlocks) ? plotBlocks : [];
export const PLOT_WHERE = ['act1', 'act2', 'act3', 'whole'];
export const plotBlockOf = (id) => PLOT_BLOCKS.find((b) => b.id === id) || null;
export function rollPlotBlock(excludeId = '') {
  const pool = PLOT_BLOCKS.filter((b) => b.id !== excludeId);
  const list = pool.length ? pool : PLOT_BLOCKS;
  return list[Math.floor(Math.random() * list.length)] || null;
}
export const normalizeStructureDie = (s) =>
  s && plotBlockOf(s.id) ? { id: s.id, where: PLOT_WHERE.includes(s.where) ? s.where : 'act2' } : null;

// ---- story interview -----------------------------------------------------------
export const INTERVIEW_MAX = 3;
export const normalizeInterview = (iv) => ({
  questions: (Array.isArray(iv?.questions) ? iv.questions : [])
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .map((q) => ({
      question: q.question.trim(),
      why: String(q.why || ''),
      options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4),
      answer: String(q.answer || ''),
    }))
    .slice(0, INTERVIEW_MAX),
});

// ---- the text the prompts get ---------------------------------------------------
const SLOT_TEXT = {
  film: {
    open: 'at the opening (the first 15% of the running time)',
    early: 'early (15–40% of the running time)',
    middle: 'in the middle (40–60% of the running time)',
    late: 'late (60–85% of the running time)',
    end: 'at the end (the last 15% of the running time)',
  },
  series: {
    open: 'in the first episode',
    early: 'in the first third of the season',
    middle: 'in the middle of the season',
    late: 'in the last third of the season',
    end: 'in the final episode',
  },
};
const WHERE_TEXT = {
  film: { act1: 'the beginning (the first act)', act2: 'the middle (the second act)', act3: 'the ending (the third act)', whole: 'the whole story' },
  series: { act1: 'the opening episodes', act2: 'the middle of the season', act3: 'the final episodes', whole: 'the whole season' },
};

// The constraints of the options that are on, ready to append to a prompt's
// user text (empty when nothing applies).
export function plotConstraintsText(project) {
  const f = originalityOf(project);
  const kind = project?.scriptType === 'series' ? 'series' : 'film';
  const parts = [];
  if (f.dice) {
    const dice = normalizeDice(project.storyDice);
    if (dice.length) {
      parts.push(
        `STORY DICE — fixed points on the timeline. Each word below must appear MATERIALLY where it is placed — as an object on screen, an event or a spoken word — and must matter to the story there, as a cause or a consequence, never as a cameo: ${dice.map((d) => `"${d.word}" ${SLOT_TEXT[kind][d.at]}`).join('; ')}.`
      );
    }
  }
  if (f.structure) {
    const s = normalizeStructureDie(project.structureDie);
    const b = s && plotBlockOf(s.id);
    if (b) {
      parts.push(
        `STRUCTURE DIE — ${WHERE_TEXT[kind][s.where]} is built on ${b.kind === 'form' ? 'the narrative form' : 'the dramatic situation'} "${b.name}": ${b.summary} Its elements: ${b.elements}. ${s.where === 'whole' ? 'The whole story takes this shape.' : 'Everything outside it is free, but has to lead into it and out of it.'}`
      );
    }
  }
  if (f.interview) {
    const qa = normalizeInterview(project.interview).questions.filter((q) => q.answer.trim());
    if (qa.length) {
      parts.push(`THE AUTHOR'S ANSWERS — binding facts of this story, which every direction, synopsis and scene must honour:\n${qa.map((q) => `- ${q.question} — ${q.answer.trim()}`).join('\n')}`);
    }
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}
