// MiniMax H3 multi-frame reference mode ("MULTI"): one ref2va generation
// anchored to several stills on the OUTPUT timeline. Picture 1 is the first
// frame (a ref_images slot, no guide); every later keyframe is an Add Guide at
// round(seconds * 24) and, per MiniMax's note, is ALSO plugged into a
// ref_images slot so the text encoder can see it as <Picture N>. This module
// owns the ordering so the graph builder (comfy.js) and the prompt writer
// (prompts.js) can never disagree about which picture is which.
import { H3_REF_CAPS, h3Frames } from './comfy.js';
import { takeOf, takeShots, takeCutTimes } from './takes.js';

export const H3_GUIDE_FPS = 24;
export const H3_MFR_MAX_SECONDS = 15; // documented ceiling of one generation
export const h3GuideFrame = (seconds) => Math.round((Number(seconds) || 0) * H3_GUIDE_FPS);

// MM:SS.mmm — the timestamp form the six-section prompt and [Shot N] markers use.
export function h3Stamp(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const mmm = String(Math.round((s % 1) * 1000)).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

// Normalised, time-sorted keyframe list for a shot: [{ kind, src, label, at }].
// `sorted: false` keeps the stored order — the editor uses it so a row never
// jumps under the cursor while its time is being typed.
export function keyframesOf(project, shotId, { sorted = true } = {}) {
  const raw = (project.shotKeyframes || {})[shotId];
  if (!Array.isArray(raw)) return [];
  const list = raw
    .filter((k) => k && k.src && (k.kind === 'image' || k.kind === 'audio'))
    .map((k) => ({ ...k, at: Math.max(0, Number(k.at) || 0) }));
  return sorted ? list.sort((a, b) => a.at - b.at) : list;
}

// Everything the picker can offer, grouped by kind. Labels double as the
// <Picture N> / <Video N> / <Audio N> descriptions fed to the prompt writer.
// Shared by the reference picker and the keyframe picker.
export function refCandidates(project, shot, t) {
  const images = [];
  const videos = [];
  const audios = [];
  for (const ch of project.storyline?.characters || []) {
    (ch.photos || []).forEach((src, k) =>
      images.push({ src, label: t('refs.charPhoto', { name: ch.name || '?', n: k + 1 }) })
    );
  }
  project.outline.forEach((sc, si) => {
    (sc.photos || []).forEach((src, k) =>
      images.push({ src, label: t('refs.scenePhoto', { n: si + 1, k: k + 1 }) })
    );
  });
  project.outline.forEach((sc, si) => {
    (project.sceneDetails[sc.id]?.shots || []).forEach((sh, shi) => {
      const img = (project.shotImages || {})[sh.id];
      const fin = (project.shotFinalImages || {})[sh.id];
      const board = (project.referenceFrames || {})[sh.id];
      const vid = (project.shotVideos || {})[sh.id];
      const aud = (project.shotAudios || {})[sh.id];
      const at = { s: si + 1, n: shi + 1 };
      if (img) images.push({ src: img, label: t('refs.shotFrame', at), shotId: sh.id });
      if (fin) images.push({ src: fin, label: t('refs.shotFinal', at), shotId: sh.id, final: true });
      if (board) images.push({ src: board, label: t('refs.shotBoard', at), board: true, shotId: sh.id });
      if (vid && sh.id !== shot.id) videos.push({ src: vid, label: t('refs.shotVideo', at) });
      if (aud) audios.push({ src: aud, label: t('refs.shotVoice', at), shotId: sh.id });
    });
  });
  return { images, videos, audios };
}

// Seed keyframes for a take: every member after the lead contributes its first
// frame at the take's internal cut time. The lead's own frame is Picture 1 and
// needs no entry.
export function seedTakeKeyframes(project, take, t) {
  const members = takeShots(project, take);
  const cuts = takeCutTimes(project, take);
  const out = [];
  members.slice(1).forEach((m, k) => {
    const src = (project.shotImages || {})[m.id];
    if (!src) return;
    let si = 0;
    let n = 0;
    project.outline.forEach((sc, i) => {
      const idx = (project.sceneDetails[sc.id]?.shots || []).findIndex((x) => x.id === m.id);
      if (idx >= 0) { si = i + 1; n = idx + 1; }
    });
    out.push({ kind: 'image', src, label: t('refs.shotFrame', { s: si, n }), at: cuts[k] ?? 0 });
  });
  return out;
}

// The ordered plan one MULTI generation consumes. Pictures carry the exact
// <Picture N> number the prompt must use; guides carry the frame index.
//   pictures: [{ n, src, label, role: 'first' | 'keyframe' | 'reference', at, board }]
//   guides:   [{ kind: 'image' | 'audio', src, at, frame, pictureN? }]
//   refVideos / refAudios: semantic references from the reference picker
export function h3MultiPlan(project, shotId, { durationSec } = {}) {
  const first = (project.shotImages || {})[shotId] || null;
  const refs = (project.shotRefs || {})[shotId] || {};
  const dur = Number(durationSec) || 0;
  const length = dur ? h3Frames(dur) : Infinity;
  const kfs = keyframesOf(project, shotId);

  const pictures = [];
  const guides = [];
  let firstSrc = first;
  // a keyframe placed at 0 is simply the first frame
  const zero = kfs.find((k) => k.kind === 'image' && k.at < 0.02);
  if (zero) firstSrc = zero.src;
  if (firstSrc) pictures.push({ n: 1, src: firstSrc, label: zero?.label || 'first frame', role: 'first', at: 0 });

  for (const k of kfs) {
    if (k === zero) continue;
    const frame = h3GuideFrame(k.at);
    // a guide must land strictly inside the generated length
    if (frame < 1 || frame >= length - 1) continue;
    if (k.kind === 'image') {
      const n = pictures.length < H3_REF_CAPS.images ? pictures.length + 1 : null;
      if (n) pictures.push({ n, src: k.src, label: k.label, role: 'keyframe', at: k.at, board: !!k.board });
      guides.push({ kind: 'image', src: k.src, at: k.at, frame, pictureN: n });
    } else {
      guides.push({ kind: 'audio', src: k.src, at: k.at, frame, label: k.label });
    }
  }
  for (const r of refs.images || []) {
    if (pictures.length >= H3_REF_CAPS.images) break;
    if (pictures.some((p) => p.src === r.src)) continue;
    pictures.push({ n: pictures.length + 1, src: r.src, label: r.label, role: 'reference', at: null, board: !!r.board });
  }
  return {
    first: firstSrc,
    pictures,
    guides,
    refVideos: (refs.videos || []).slice(0, H3_REF_CAPS.videos),
    refAudios: (refs.audios || []).slice(0, H3_REF_CAPS.audios),
    hasKeyframes: kfs.length > 0,
  };
}

export const hasMultiInput = (project, shotId) => {
  const kfs = keyframesOf(project, shotId);
  const first = (project.shotImages || {})[shotId] || kfs.find((k) => k.kind === 'image' && k.at < 0.02);
  return !!first && kfs.length > 0;
};

export { takeOf };
