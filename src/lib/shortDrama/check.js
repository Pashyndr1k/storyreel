// Genre checks for a short-drama project: pacing and convention analysis of
// the episode plan, the scene outline and the shots, with concrete issues the
// user or the agent can act on. Deterministic — no model call.
import { HOOK_TYPES, OPENING_HOOKS, MAX_LINE_WORDS, MAX_ACTION_WORDS, WORDS_PER_SEC, MAX_LOCATIONS_PER_EPISODE, OPENING_HOOK_SEC, TURN_EVERY_SEC, seasonLandmarks, isShortDrama } from './rules.js';
import { episodeRange, clampEpisodes } from '../series.js';

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const EM_DASH = /[—–]/;
const VO = /\b(V\.?O\.?|O\.?S\.?|voice[- ]?over|narrat(or|ion)|internal monologue|inner (voice|thought)|\(thinks\)|thinks:)/i;
const HOOK_TAG = /HOOK\s*[·:\-]\s*(IDENTITY|EMOTION|REALISATION|REALIZATION)/i;

// Dialogue text → the spoken lines (speaker prefix stripped)
export function dialogueLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
      return m ? { speaker: m[1].replace(/\s*\(.*?\)\s*$/, '').trim(), line: m[2] } : { speaker: '', line: l };
    })
    .filter((x) => x.line);
}

// The episodes of a project's outline: [{ number, scenes, shots, seconds }]
export function episodesOf(project) {
  const out = [];
  for (const sc of project.outline || []) {
    const n = Number(sc.episode) || 0;
    const shots = project.sceneDetails?.[sc.id]?.shots || [];
    let ep = out.find((e) => e.number === n);
    if (!ep) {
      ep = { number: n, scenes: [], shots: [], seconds: 0 };
      out.push(ep);
    }
    ep.scenes.push(sc);
    ep.shots.push(...shots.map((s) => ({ ...s, sceneId: sc.id })));
    ep.seconds += Number(sc.duration) || 0;
  }
  return out;
}

export function checkProject(project) {
  const issues = [];
  const add = (level, code, message, where = {}) => issues.push({ level, code, message, ...where });
  if (!isShortDrama(project)) return { ok: true, issues: [], summary: 'Not a series project — the short-drama rules do not apply.', episodes: [] };
  const total = project.seriesPart ? project.seriesPart.total : clampEpisodes(project.episodeCount);
  const lm = seasonLandmarks(total);
  const range = episodeRange(project);

  // ---- the plan (series master)
  // the master's plan, or the slice of it a part project carries
  const plan = project.seriesPlan?.episodes?.length ? project.seriesPlan : project.seriesPart?.episodes?.length ? { episodes: project.seriesPart.episodes } : null;
  if (plan?.episodes?.length) {
    const eps = [...plan.episodes].sort((a, b) => a.number - b.number);
    let prevHook = null;
    for (const e of eps) {
      const h = String(e.hookType || '').toLowerCase();
      if (!HOOK_TYPES.includes(h)) add('warn', 'hook-missing', `Episode ${e.number}: no hook type (identity / emotion / realisation).`, { episode: e.number });
      else {
        if (h === prevHook) add('error', 'hook-repeat', `Episodes ${e.number - 1} and ${e.number} end on the same hook type (${h}); rotate the type.`, { episode: e.number });
        const want = OPENING_HOOKS[e.number - 1];
        if (want && h !== want) add('info', 'hook-opening', `Episode ${e.number} ends on ${h}; the format expects ${want} for episode ${e.number}.`, { episode: e.number });
      }
      prevHook = HOOK_TYPES.includes(h) ? h : prevHook;
      if (!(e.cliffhanger || '').trim()) add('error', 'cliff-missing', `Episode ${e.number}: no cliffhanger.`, { episode: e.number });
      if (EM_DASH.test(e.cliffhanger || '')) add('info', 'dash-plan', `Episode ${e.number}: em dash in the cliffhanger text.`, { episode: e.number });
      if (e.number === lm.paywall && h === 'emotion') add('warn', 'paywall-hook', `Episode ${e.number} is the paid checkpoint (first quarter): it should carry the strongest hook so far — an identity or realisation jaw-drop rather than a held emotion.`, { episode: e.number });
    }
    const firstWin = eps.slice(0, 5).some((e) => /\b(win|wins|won|victor|turns? the tables|exposes|proves|evidence|humiliat(es|ed) (him|her|them))\b/i.test(`${e.summary} ${e.cliffhanger}`));
    if (eps.length >= 5 && !firstWin) add('warn', 'first-win', `No first win found in episodes 1–${lm.firstWinBy}: the lead must win something concrete (a confrontation, a piece of evidence, a turnaround) by episode ${lm.firstWinBy}.`, { episode: lm.firstWinBy });
  }

  // ---- scenes and shots per episode
  const episodes = episodesOf(project).filter((e) => e.number > 0);
  const report = episodes.map((ep) => {
    const m = { number: ep.number, seconds: ep.seconds, scenes: ep.scenes.length, shots: ep.shots.length, lines: 0, spokenWords: 0, longLines: 0, dashes: 0, voiceOver: 0, longActions: 0, turns: 0, locations: 0, openingSec: null, hookTag: null };
    if (ep.seconds && (ep.seconds < range.min || ep.seconds > range.max)) add('warn', 'episode-length', `Episode ${ep.number} runs ${ep.seconds} s; the target is ${range.min}–${range.max} s.`, { episode: ep.number });
    if (ep.scenes.length > 3) add('info', 'scene-count', `Episode ${ep.number} has ${ep.scenes.length} scenes; 1–3 is the format.`, { episode: ep.number });
    const first = ep.scenes[0];
    if (first && first.beat && first.beat !== 'open') add('info', 'first-beat', `Episode ${ep.number}: its first scene is marked "${first.beat}"; it should open inside the disruption ("open").`, { episode: ep.number, sceneId: first.id });
    const last = ep.scenes[ep.scenes.length - 1];
    if (last && last.beat && last.beat !== 'cliff') add('info', 'last-beat', `Episode ${ep.number}: its last scene is marked "${last.beat}"; it should end on the hook ("cliff").`, { episode: ep.number, sceneId: last.id });
    const locs = new Set(ep.shots.map((s) => (s.location || '').split(',')[0].trim().toLowerCase()).filter(Boolean));
    m.locations = locs.size;
    if (locs.size > MAX_LOCATIONS_PER_EPISODE) add('warn', 'locations', `Episode ${ep.number} uses ${locs.size} locations; keep to ${MAX_LOCATIONS_PER_EPISODE} or fewer.`, { episode: ep.number });
    if (ep.shots.length) {
      const s0 = ep.shots[0];
      m.openingSec = Number(s0.duration) || 0;
      if (m.openingSec > OPENING_HOOK_SEC) add('warn', 'opening-long', `Episode ${ep.number}: the opening shot runs ${m.openingSec} s; the conflict must be visible inside ${OPENING_HOOK_SEC} s.`, { episode: ep.number, shotId: s0.id });
      if (!(s0.dialogue || '').trim() && !/\b(slap|grab|throw|snatch|shout|scream|tear|slam|push|point|accus|scream|bleed|kiss|ring|contract|photo|phone|door|evidence|cry|runs?|stand|stare|sign)/i.test(s0.action || '')) add('info', 'opening-quiet', `Episode ${ep.number}: the opening shot shows no visible disruption or line — check that the conflict is on screen in the first 3 seconds.`, { episode: ep.number, shotId: s0.id });
      let sinceShift = 0;
      ep.shots.forEach((sh, i) => {
        const d = Number(sh.duration) || 0;
        if (words(sh.action) > MAX_ACTION_WORDS) { m.longActions++; add('info', 'action-long', `Episode ${ep.number}, shot ${i + 1}: action block of ${words(sh.action)} words (keep under ${MAX_ACTION_WORDS}).`, { episode: ep.number, shotId: sh.id }); }
        if (VO.test(sh.dialogue || '') || VO.test(sh.notes || '')) { m.voiceOver++; add('error', 'voice-over', `Episode ${ep.number}, shot ${i + 1}: voice-over / inner monologue — turn it into something visible or audible, or cut it.`, { episode: ep.number, shotId: sh.id }); }
        for (const { line } of dialogueLines(sh.dialogue)) {
          m.lines++;
          m.spokenWords += words(line);
          if (words(line) > MAX_LINE_WORDS) { m.longLines++; add('error', 'line-long', `Episode ${ep.number}, shot ${i + 1}: a ${words(line)}-word line (max ${MAX_LINE_WORDS}; a caption holds 6–8): "${line.slice(0, 60)}…"`, { episode: ep.number, shotId: sh.id }); }
          if (EM_DASH.test(line)) { m.dashes++; add('error', 'dash', `Episode ${ep.number}, shot ${i + 1}: em dash in dialogue — use a full stop.`, { episode: ep.number, shotId: sh.id, fixable: true }); }
        }
        if (['turn', 'reversal', 'cliff'].includes(sh.beat)) m.turns++;
        sinceShift = sh.beat && sh.beat !== 'orient' ? 0 : sinceShift + d;
        if (sinceShift > 15 && ep.shots.some((x) => x.beat)) { add('warn', 'flat-run', `Episode ${ep.number}: ${sinceShift} s without a marked shift around shot ${i + 1} — something must change every 15 s.`, { episode: ep.number, shotId: sh.id }); sinceShift = 0; }
      });
      const lastShot = ep.shots[ep.shots.length - 1];
      const tag = `${lastShot.notes || ''} ${lastShot.action || ''}`.match(HOOK_TAG);
      m.hookTag = tag ? tag[1].toUpperCase() : null;
      if (!tag) add('warn', 'hook-frame', `Episode ${ep.number}: the last shot carries no "HOOK · TYPE" note — the cut must land on one labelled unresolved action.`, { episode: ep.number, shotId: lastShot.id });
      if (ep.seconds) {
        const expectTurns = Math.max(1, Math.round(ep.seconds / TURN_EVERY_SEC));
        if (ep.shots.some((x) => x.beat) && m.turns < expectTurns) add('warn', 'few-turns', `Episode ${ep.number}: ${m.turns} turn(s) marked for ${ep.seconds} s; the format turns about every ${TURN_EVERY_SEC} s (${expectTurns}).`, { episode: ep.number });
        const maxWords = Math.round(ep.seconds * WORDS_PER_SEC * 1.1);
        if (m.spokenWords > maxWords) add('warn', 'too-dense', `Episode ${ep.number}: ${m.spokenWords} spoken words in ${ep.seconds} s (about ${WORDS_PER_SEC} words a second is speakable: ≤ ${maxWords}).`, { episode: ep.number });
      }
    }
    return m;
  });

  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const score = Math.max(0, 100 - errors * 8 - warns * 3);
  return {
    ok: errors === 0,
    score,
    landmarks: lm,
    summary: `${episodes.length} episode(s) with scenes, ${plan?.episodes?.length || 0} planned; ${errors} error(s), ${warns} warning(s); score ${score}/100.`,
    episodes: report,
    issues,
  };
}

// Mechanical fixes that need no model: em dashes in dialogue become full stops.
export function autoFixProject(project) {
  let changed = 0;
  const sceneDetails = { ...(project.sceneDetails || {}) };
  for (const [sid, det] of Object.entries(sceneDetails)) {
    const shots = (det?.shots || []).map((s) => {
      const d = String(s.dialogue || '');
      if (!EM_DASH.test(d)) return s;
      changed++;
      return { ...s, dialogue: d.replace(/\s*[—–]\s*(\p{L})?/gu, (_, c) => (c ? `. ${c.toUpperCase()}` : '.')).replace(/\.\s*\./g, '.') };
    });
    sceneDetails[sid] = { ...det, shots };
  }
  return { changed, patch: changed ? { sceneDetails } : {} };
}
