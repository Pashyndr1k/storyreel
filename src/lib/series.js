// Short-drama series (the "series" project template): a vertical serial of
// any number of episodes (1–200), each of a user-set length (default 1.5–2 min).
//
// A series lives in two kinds of project:
//   master  — scriptType 'series', no seriesPart. Stages 1–3 plan the whole
//             series: project.seriesPlan = { arcs, episodes, segmentSize, segments }
//               arcs:     [{ id, title, summary, finale, from, to }]  main sections, each closing on an intermediate finale
//               episodes: [{ number, title, summary, cliffhanger }]
//               segments: [{ from, to, projectId }]                   projects already created from the plan
//   segment — scriptType 'series' with project.seriesPart = { parentId, seriesTitle,
//             total, from, to, arcTitle, prevCliffhanger, episodes }. An ordinary
//             production project (stages 3–5) covering 5–10 consecutive episodes.
import { newProject, uid } from './storage.js';

export const SERIES_MIN_EPISODES = 1;
export const SERIES_MAX_EPISODES = 200;
export const SERIES_DEFAULT_EPISODES = 30;
// Episode length: the user sets a target in seconds; prompts ask for the
// target ± EPISODE_TOLERANCE_SEC (the default 105 gives the classic 90–120).
export const EPISODE_DEFAULT_SEC = 105;
export const EPISODE_SEC_MIN = 30;
export const EPISODE_SEC_MAX = 600;
export const EPISODE_TOLERANCE_SEC = 15;
export const clampEpisodeSec = (n) => Math.max(EPISODE_SEC_MIN, Math.min(EPISODE_SEC_MAX, Math.round(Number(n) || EPISODE_DEFAULT_SEC)));
// { min, max } seconds of one episode of this project's series
export const episodeRange = (p) => {
  const d = clampEpisodeSec(p?.seriesPart?.episodeSeconds || p?.episodeSeconds);
  return { min: Math.max(15, d - EPISODE_TOLERANCE_SEC), max: d + EPISODE_TOLERANCE_SEC };
};
export const SEGMENT_MIN = 5;
export const SEGMENT_MAX = 10;
export const SEGMENT_DEFAULT = 8;
// episodes written per text-model call when the plan is created
export const EPISODES_PER_CALL = 10;
// the script style every new series starts with (see lib/styles.js)
export const SHORT_DRAMA_STYLE_ID = 'bi5.script.short_drama';

export const clampEpisodes = (n) =>
  Math.max(SERIES_MIN_EPISODES, Math.min(SERIES_MAX_EPISODES, Math.round(Number(n) || SERIES_DEFAULT_EPISODES)));
export const clampSegment = (n) => Math.max(SEGMENT_MIN, Math.min(SEGMENT_MAX, Math.round(Number(n) || SEGMENT_DEFAULT)));

export const isSeries = (p) => p?.scriptType === 'series';
export const isSeriesMaster = (p) => isSeries(p) && !p.seriesPart;
export const episodeCountOf = (p) => (p?.seriesPart ? p.seriesPart.to - p.seriesPart.from + 1 : clampEpisodes(p?.episodeCount));

// The model's sections, forced into a gap-free cover of episodes 1..total.
export function normalizeArcs(raw, total) {
  const list = (Array.isArray(raw) ? raw : [])
    .map((a) => ({
      id: uid(),
      title: String(a?.title || '').trim(),
      summary: String(a?.summary || '').trim(),
      finale: String(a?.finale || '').trim(),
      from: Math.round(Number(a?.episode_from ?? a?.from) || 0),
      to: Math.round(Number(a?.episode_to ?? a?.to) || 0),
    }))
    .filter((a) => a.to >= a.from && a.to >= 1)
    .sort((a, b) => a.from - b.from);
  if (!list.length) return [{ id: uid(), title: '', summary: '', finale: '', from: 1, to: total }];
  let next = 1;
  const out = [];
  for (const a of list) {
    if (next > total) break;
    const to = Math.min(total, Math.max(a.to, next));
    out.push({ ...a, from: next, to });
    next = to + 1;
  }
  out[out.length - 1].to = total;
  return out;
}

// Calls needed to write an arc's episodes: [{ from, to }] of at most EPISODES_PER_CALL.
export function arcChunks(arc) {
  const len = arc.to - arc.from + 1;
  const k = Math.ceil(len / EPISODES_PER_CALL);
  const out = [];
  let from = arc.from;
  for (let i = 0; i < k; i++) {
    const size = Math.ceil((arc.to - from + 1) / (k - i));
    out.push({ from, to: from + size - 1 });
    from += size;
  }
  return out;
}

// Split the series into production segments of SEGMENT_MIN..SEGMENT_MAX
// episodes, about `size` each. Segments end where a section ends whenever the
// section lengths allow it, so a segment closes on an intermediate finale.
export function planSegments(arcs, total, size) {
  const want = clampSegment(size);
  if (total <= SEGMENT_MAX && total < want + SEGMENT_MIN) return [{ from: 1, to: total, arcTitle: arcs[0]?.title || '' }];
  let segs = [];
  for (const arc of arcs.length ? arcs : [{ from: 1, to: total, title: '' }]) {
    const len = arc.to - arc.from + 1;
    let k = Math.max(1, Math.round(len / want));
    while (k > 1 && len / k < SEGMENT_MIN) k--;
    while (len / k > SEGMENT_MAX) k++;
    let from = arc.from;
    for (let i = 0; i < k; i++) {
      const n = Math.ceil((arc.to - from + 1) / (k - i));
      segs.push({ from, to: from + n - 1, arcTitle: arc.title || '' });
      from += n;
    }
  }
  // a section shorter than the minimum joins its neighbour when the pair fits
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.to - s.from + 1 >= SEGMENT_MIN || segs.length === 1) continue;
    const j = i > 0 ? i - 1 : i + 1;
    const o = segs[j];
    if (o.to - o.from + 1 + (s.to - s.from + 1) > SEGMENT_MAX) continue;
    const merged = { from: Math.min(s.from, o.from), to: Math.max(s.to, o.to), arcTitle: segs[Math.min(i, j)].arcTitle };
    segs = [...segs.slice(0, Math.min(i, j)), merged, ...segs.slice(Math.max(i, j) + 1)];
    i = Math.max(-1, Math.min(i, j) - 1);
  }
  return segs;
}

export const episodeLine = (e) =>
  `Episode ${e.number}${e.title ? ` — "${e.title}"` : ''}: ${e.summary || ''}${e.cliffhanger ? `\n  Cliffhanger: ${e.cliffhanger}` : ''}`;

// A production project for episodes seg.from..seg.to of the master series.
// Stages 1–2 arrive filled (plot, storyline, cast with photos); it opens at
// Stage 3, where the scene outline for its episodes is written.
export function buildSegmentProject(master, seg, label) {
  const plan = master.seriesPlan || {};
  const total = clampEpisodes(master.episodeCount);
  const episodes = (plan.episodes || []).filter((e) => e.number >= seg.from && e.number <= seg.to).sort((a, b) => a.number - b.number);
  const prev = (plan.episodes || []).find((e) => e.number === seg.from - 1);
  const arc = (plan.arcs || []).find((a) => seg.from >= a.from && seg.from <= a.to);
  const p = newProject({
    title: `${master.title} · ${label}`,
    logline: master.logline,
    scriptType: 'series',
    aspectRatio: master.aspectRatio,
    episodeCount: total,
    episodeSeconds: clampEpisodeSec(master.episodeSeconds),
    scriptStyleId: master.scriptStyleId,
  });
  return {
    ...p,
    genres: [...(master.genres || [])],
    lang: master.lang || '',
    imageStyleId: master.imageStyleId || '',
    videoStyleId: master.videoStyleId || '',
    cover: master.cover || '',
    approvedPlot: episodes.map(episodeLine).join('\n\n'),
    storyline: master.storyline ? structuredClone(master.storyline) : null,
    stage: 3,
    seriesPart: {
      parentId: master.id,
      seriesTitle: master.title,
      total,
      from: seg.from,
      to: seg.to,
      arcTitle: arc?.title || '',
      arcSummary: arc?.summary || '',
      prevCliffhanger: prev?.cliffhanger || '',
      episodeSeconds: clampEpisodeSec(master.episodeSeconds),
      episodes,
    },
  };
}
