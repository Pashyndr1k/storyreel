// Word timing from the shot's own speech. The subtitle engine's fallback
// spreads a block's words over its duration by letter count; this module
// listens to the audio the shot actually carries (the H3 mix clip, the
// shot's video, or its voice track) and places every word where the speech
// energy says it is spoken, so the words light up with the voice in the
// preview and in the finished video.
//
// Method: the audio is cut into 20 ms frames; frames above a noise-relative
// threshold are speech; a word's onset is the moment the cumulative speech
// energy reaches the share of the words before it (by letter weight) — a
// pause carries no energy, so words do not advance through silence — and
// the onset snaps to the start of the nearest speech burst within 180 ms.
import { decodeMediaAudio } from './audio.js';
import { shotStarts } from './subtitles.js';

const FRAME_SEC = 0.02;
const dialogueWeight = (w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5;

// RMS per frame of one channel over [from, to] seconds: { t: [], e: [] }
export function speechEnvelope(buffer, from = 0, to = Infinity) {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const a = Math.max(0, Math.floor(from * sr));
  const b = Math.min(data.length, Math.floor(Math.min(to, buffer.duration) * sr));
  const n = Math.max(1, Math.round(FRAME_SEC * sr));
  const t = [];
  const e = [];
  for (let i = a; i < b; i += n) {
    let s = 0;
    const end = Math.min(b, i + n);
    for (let k = i; k < end; k++) s += data[k] * data[k];
    e.push(Math.sqrt(s / Math.max(1, end - i)));
    t.push((i - a) / sr);
  }
  return { t, e };
}

// Word onsets (seconds from the envelope's start) for `words`.
export function alignWords(words, env) {
  const { t, e } = env;
  if (!words.length || !e.length) return null;
  const sorted = [...e].sort((x, y) => x - y);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const floor = q(0.2);
  const peak = q(0.95);
  if (peak < 0.004 || peak - floor < 0.002) return null; // silence, or no dynamics to read
  const thr = floor + 0.15 * (peak - floor);
  const voiced = e.map((v) => v > thr);
  // speech bursts: voiced runs of ≥ 60 ms, gaps < 80 ms bridged
  const bursts = [];
  let run = null;
  let gap = 0;
  voiced.forEach((v, i) => {
    if (v) {
      if (run && gap > 0 && gap * FRAME_SEC >= 0.08) {
        bursts.push(run);
        run = null;
      }
      if (!run) run = { a: i, b: i };
      run.b = i;
      gap = 0;
    } else if (run) gap++;
  });
  if (run) bursts.push(run);
  const good = bursts.filter((r) => (r.b - r.a + 1) * FRAME_SEC >= 0.06);
  if (!good.length) return null;
  const mass = e.map((v, i) => (voiced[i] ? v : 0));
  const total = mass.reduce((x, y) => x + y, 0);
  if (total <= 0) return null;
  const weights = words.map(dialogueWeight);
  const wsum = weights.reduce((x, y) => x + y, 0);
  const onsets = [];
  const claimed = new Set(); // a burst's start belongs to the first word that lands in it
  let acc = 0;
  let cum = 0;
  let i = 0;
  for (let k = 0; k < words.length; k++) {
    const target = (acc / wsum) * total;
    while (i < mass.length - 1 && cum + mass[i] < target) {
      cum += mass[i];
      i++;
    }
    // the first frame at or after the target that is voiced
    let j = i;
    while (j < voiced.length - 1 && !voiced[j]) j++;
    let at = t[j];
    // a word that lands inside a burst (or in the 180 ms of silence before it)
    // begins where the burst begins — unless an earlier word already started
    // that burst, in which case this word sits at its energy position inside it
    const burst = good.find((r) => t[r.a] - 0.18 <= at + 1e-6 && at <= t[r.b] + FRAME_SEC + 1e-6);
    if (burst && !claimed.has(burst)) {
      at = t[burst.a];
      claimed.add(burst);
    }
    if (onsets.length && at < onsets[onsets.length - 1] + 0.05) at = onsets[onsets.length - 1] + 0.05;
    onsets.push(Math.round(at * 1000) / 1000);
    acc += weights[k];
  }
  return onsets;
}

// Where a shot's speech is: { dataURL, offset } — the H3 / split lane clip
// (its source offset is the trimmed head), the shot's own video, or its
// voice track; null when the shot carries no sound.
export function shotSpeechSource(project, shotId) {
  for (const L of project.audioLayers || []) {
    const c = (L.clips || []).find((x) => x.id === `h3_${shotId}` || x.id === `av_${shotId}`);
    if (c?.dataURL && L.enabled !== false && !c.muted) return { dataURL: c.dataURL, offset: Number(c.offset) || 0 };
  }
  const video = (project.shotVideos || {})[shotId];
  if (video && !(project.shotMutes || {})[shotId]) return { dataURL: video, offset: Number((project.shotTrims || {})[shotId]?.head) || 0 };
  const voice = (project.shotAudios || {})[shotId];
  if (voice) return { dataURL: voice, offset: 0 };
  return null;
}

// The subtitle items with their words timed from the speech: every
// shot-linked item gets `wordAt` (seconds from the item's start) when the
// shot has audio with speech in it; the blocks of a shot are re-cut so each
// starts at its first word (the first block stays at the shot's start, so
// the line is on screen from the first frame). Items without audio are
// returned unchanged (the letter-count estimate applies).
export async function alignSubtitlesToSpeech(project, items) {
  const starts = shotStarts(project);
  const byShot = new Map();
  items.forEach((it, idx) => {
    if (it.custom || !it.shotId || !(it.shotId in starts)) return;
    if (!byShot.has(it.shotId)) byShot.set(it.shotId, []);
    byShot.get(it.shotId).push(idx);
  });
  const out = items.map((it) => ({ ...it }));
  for (const [shotId, idxs] of byShot) {
    const src = shotSpeechSource(project, shotId);
    if (!src) continue;
    let buf = null;
    try {
      buf = await decodeMediaAudio(src.dataURL);
    } catch {
      buf = null;
    }
    if (!buf) continue;
    const shot = (project.outline || []).flatMap((sc) => project.sceneDetails?.[sc.id]?.shots || []).find((s) => s.id === shotId);
    const slot = Number(shot?.duration) || buf.duration;
    const env = speechEnvelope(buf, src.offset, src.offset + slot);
    idxs.sort((a, b) => out[a].start - out[b].start);
    const blocks = idxs.map((i) => out[i]);
    const words = blocks.flatMap((b) => String(b.text || '').split(/\s+/).filter(Boolean));
    const onsets = alignWords(words, env);
    if (!onsets) continue;
    const shotStart = starts[shotId];
    const shotEnd = shotStart + slot;
    let w = 0;
    blocks.forEach((b, bi) => {
      const n = String(b.text || '').split(/\s+/).filter(Boolean).length;
      const mine = onsets.slice(w, w + n);
      w += n;
      if (!mine.length) return;
      // the first block keeps the shot's start; later blocks begin a hair before their first word
      const start = bi === 0 ? shotStart : Math.max(shotStart, Math.round((shotStart + mine[0] - 0.05) * 100) / 100);
      const nextFirst = bi + 1 < blocks.length ? onsets[w] : null;
      const end = nextFirst != null ? Math.max(start + 0.4, Math.round((shotStart + nextFirst - 0.05) * 100) / 100) : shotEnd;
      b.start = start;
      b.duration = Math.round(Math.max(0.4, Math.min(end, shotEnd) - start) * 100) / 100;
      b.wordAt = mine.map((o) => Math.round(Math.max(0, Math.min(b.duration, shotStart + o - start)) * 1000) / 1000);
    });
  }
  return out.sort((a, b) => a.start - b.start);
}
