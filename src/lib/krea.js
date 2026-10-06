// Krea: one cloud API in front of many image and video models.
//   docs: https://www.krea.ai/docs/developers/introduction
//   keys: https://www.krea.ai/settings/api-tokens  (prepaid USD balance)
//
// Every model is POST /generate/{kind}/{vendor}/{model} → { job_id }, then
// GET /jobs/{id} until "completed" ({ result: { urls } }), "failed" or
// "cancelled"; DELETE /jobs/{id} cancels (cancelled jobs are not billed).
// Media inputs are URLs of at most 1024 characters, so frames and reference
// photos are first uploaded with POST /assets and passed by their asset URL.
//
// Like Kling, the API sends no CORS headers: every call goes through the
// Electron main process (window.netBridge, electron/netRequest.cjs). In a
// plain browser build there is no bridge — generation reports KREA_NEEDS_APP.
import { enforcePolicy } from './policy.js';

export const KREA_BASE = 'https://api.krea.ai';
export const DEFAULT_KREA_IMAGE_MODEL = 'nano-banana-pro';
export const DEFAULT_KREA_VIDEO_MODEL = 'kling-3.0';

// Image models that take reference images (the character, location and
// asset photos the app attaches).
//   refs  — how references are passed: 'urls' (list of strings),
//           'style' ({ url, strength }), 'tagged' ({ url, tag })
//   size  — 'aspect' (aspect_ratio + resolution) or 'wh' (width/height)
export const KREA_IMAGE_MODELS = [
  { id: 'nano-banana-pro', label: 'Nano Banana Pro', path: '/generate/image/google/nano-banana-pro', refs: 'urls', maxRefs: 10, size: 'aspect', resolution: '2K' },
  { id: 'nano-banana-2', label: 'Nano Banana 2', path: '/generate/image/google/nano-banana-2', refs: 'urls', maxRefs: 10, size: 'aspect', resolution: '2K' },
  { id: 'gpt-image-2', label: 'ChatGPT Image 2', path: '/generate/image/openai/gpt-image-2', refs: 'urls', maxRefs: 10, size: 'aspect', resolution: '2K', extra: { quality: 'high' } },
  { id: 'seedream-5-pro', label: 'Seedream 5 Pro', path: '/generate/image/bytedance/seedream-5-pro', refs: 'style', maxRefs: 10, size: 'wh' },
  { id: 'runway-gen-4-image', label: 'Runway Gen-4 Image', path: '/generate/image/runway/gen-4-image', refs: 'tagged', maxRefs: 3, minRefs: 1, size: 'wh' },
];

// Video models that animate the shot's first frame (and, where supported,
// hold its last frame).
//   family      — which prompt format the app writes for it
//   range/fixed — allowed clip lengths in seconds
//   aspects     — accepted aspect ratios (the nearest is used)
//   audioField  — has generate_audio (the app turns it off: it adds voice
//                 and sound itself); nativeAudio — always delivers a mix
//   resField/resMap — how the app's SD / HD / FHD maps onto the model
export const KREA_VIDEO_MODELS = [
  { id: 'kling-3.0', label: 'Kling 3.0', path: '/generate/video/kling/kling-3.0', family: 'kling', lastFrame: true, range: [3, 15], aspects: ['16:9', '9:16'], audioField: true, resField: 'mode', resMap: { SD: 'std', HD: 'std', FHD: 'pro' } },
  { id: 'kling-2.6', label: 'Kling 2.6', path: '/generate/video/kling/kling-2.6', family: 'kling', lastFrame: true, fixed: [5, 10], aspects: ['16:9', '9:16'], audioField: true },
  { id: 'veo-3.1', label: 'Veo 3.1', path: '/generate/video/google/veo-3.1', family: 'ltx', lastFrame: true, fixed: [4, 6, 8], aspects: ['16:9', '9:16'], audioField: true, resField: 'resolution', resMap: { SD: '720p', HD: '720p', FHD: '1080p' } },
  { id: 'minimax-h3', label: 'MiniMax H3', path: '/generate/video/minimax/hailuo-3', family: 'minimax', lastFrame: true, range: [5, 15], aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], nativeAudio: true },
  { id: 'minimax-h3-max', label: 'MiniMax H3 Max', path: '/generate/video/minimax/h3-max', family: 'minimax', lastFrame: true, range: [5, 15], aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], nativeAudio: true, resField: 'resolution', resMap: { SD: '480p', HD: '768p', FHD: '1080p' }, extra: { prompt_expansion_mode: 'disabled' } },
  { id: 'seedance-2', label: 'Seedance 2.0', path: '/generate/video/bytedance/seedance-2', family: 'ltx', lastFrame: true, range: [4, 15], aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], nativeAudio: true, resField: 'resolution', resMap: { SD: '480p', HD: '720p', FHD: '1080p' } },
  { id: 'seedance-2-5', label: 'Seedance 2.5', path: '/generate/video/bytedance/seedance-2-5', family: 'ltx', lastFrame: true, range: [4, 30], aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], nativeAudio: true, resField: 'resolution', resMap: { SD: '480p', HD: '720p', FHD: '1080p' } },
  { id: 'ltx-2.5-pro', label: 'LTX-2.5 Pro', path: '/generate/video/lightricks/ltx-video-2.5-pro', family: 'ltx', lastFrame: true, fixed: [6, 8, 10], aspects: ['16:9', '9:16'], audioField: true, resField: 'resolution', resMap: { SD: '720p', HD: '720p', FHD: '1080p' } },
  { id: 'wan-3.0', label: 'Wan 3.0', path: '/generate/video/alibaba/wan-3.0', family: 'ltx', lastFrame: true, range: [2, 30], aspects: ['16:9', '4:3', '1:1', '3:4', '9:16'], audioField: true, resField: 'resolution', resMap: { SD: '480p', HD: '720p', FHD: '1080p' }, extra: { enable_prompt_expansion: false } },
  { id: 'gemini-omni-flash-1.1', label: 'Gemini Omni Flash 1.1', path: '/generate/video/google/gemini-omni-flash-1.1', family: 'ltx', lastFrame: false, range: [3, 10], aspects: ['16:9', '9:16'] },
  { id: 'runway-gen-4.5', label: 'Runway Gen-4.5', path: '/generate/video/runway/gen-4.5', family: 'ltx', lastFrame: false, range: [2, 10], aspects: ['16:9', '9:16', '4:3', '3:4', '1:1'], aspectMap: { '16:9': '1280:720', '9:16': '720:1280', '4:3': '1104:832', '3:4': '832:1104', '1:1': '960:960' } },
];

export const kreaImageModelOf = (settings) => KREA_IMAGE_MODELS.find((m) => m.id === (settings?.kreaImageModel || DEFAULT_KREA_IMAGE_MODEL)) || KREA_IMAGE_MODELS[0];
export const kreaVideoModelOf = (settings) => KREA_VIDEO_MODELS.find((m) => m.id === (settings?.kreaVideoModel || DEFAULT_KREA_VIDEO_MODEL)) || KREA_VIDEO_MODELS[0];
// a stored engine id "krea:<model>" → does that clip carry its own sound mix?
export const kreaNativeAudio = (engineId) => !!KREA_VIDEO_MODELS.find((m) => `krea:${m.id}` === engineId)?.nativeAudio;

// The clip length the model will render for a shot of `sec` seconds: the
// shortest allowed length that is not shorter than the shot.
export function kreaSeconds(model, sec) {
  const want = Math.max(1, Number(sec) || 4);
  if (model.fixed) return model.fixed.find((v) => v >= want) ?? model.fixed[model.fixed.length - 1];
  const [lo, hi] = model.range;
  return Math.min(hi, Math.max(lo, Math.ceil(want)));
}

// The model's aspect ratio nearest to the project's.
export function kreaAspect(model, ratio) {
  const r = String(ratio || '16:9');
  const list = model.aspects || ['16:9', '9:16'];
  const val = (s) => {
    const [a, b] = s.split(':').map(Number);
    return a > 0 && b > 0 ? a / b : 16 / 9;
  };
  const pick = list.includes(r) ? r : list.reduce((best, s) => (Math.abs(Math.log(val(s) / val(r))) < Math.abs(Math.log(val(best) / val(r))) ? s : best), list[0]);
  return model.aspectMap ? model.aspectMap[pick] || pick : pick;
}

export const KREA_VIDEO_MODES = ['auto', 'i2v', 'flf2v'];
export function resolveKreaMode(mode, { lastFrame, model } = {}) {
  if (mode === 'flf2v') return lastFrame && model?.lastFrame ? 'flf2v' : 'i2v';
  if (mode === 'i2v') return 'i2v';
  return lastFrame && model?.lastFrame ? 'flf2v' : 'i2v';
}

// pixel sizes for models that take width/height
const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1536, 1536], '4:3': [1600, 1200], '3:4': [1200, 1600] };

const sanitize = (s) => String(s || 'storyreel').replace(/[^\w\d-]+/g, '_').slice(0, 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// HTTP status → a sentence the user can act on (the raw message stays).
function kreaError(status, body) {
  const raw = body?.error?.message || body?.message || body?.error || body?.detail || `HTTP ${status}`;
  let what = 'request failed';
  if (status === 401) what = 'the API key was rejected — check it in Settings (keys are created at krea.ai/settings/api-tokens)';
  else if (status === 402) what = 'the Krea API balance is used up — top it up at krea.ai/settings/api-tokens';
  else if (status === 403) what = 'the account has no access to this model';
  else if (status === 404) what = 'the model or job was not found';
  else if (status === 400 || status === 422) what = 'the request was not accepted (invalid parameters)';
  else if (status === 429) what = 'rate limit reached — try again in a moment';
  else if (status >= 500) what = 'Krea’s service is temporarily unavailable';
  const e = new Error(`Krea: ${what} (${status}: ${typeof raw === 'string' ? raw : JSON.stringify(raw)})`);
  e.status = status;
  return e;
}

const bridge = () => (typeof window !== 'undefined' ? window.netBridge : null);

async function call(settings, path, { method = 'GET', json = null, form = null } = {}) {
  const b = bridge();
  if (!b) throw new Error('KREA_NEEDS_APP');
  const res = await b.request({ url: KREA_BASE + path, method, headers: { Authorization: `Bearer ${settings.kreaKey}` }, json, form });
  let body = null;
  try {
    body = JSON.parse(res.text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw kreaError(res.status, body);
  return body;
}

// Reference photos and frames are uploaded once per session; the same data
// URL gives the same asset URL again.
const assetCache = new Map();
const cacheKey = (dataURL) => `${dataURL.length}:${dataURL.slice(0, 80)}:${dataURL.slice(-80)}`;

export async function uploadAsset(settings, dataURL, name = 'image') {
  const src = String(dataURL || '');
  if (/^https?:\/\//.test(src)) return src;
  const k = cacheKey(src);
  if (assetCache.has(k)) return assetCache.get(k);
  const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) throw new Error('Krea: an image could not be read for upload.');
  const mime = m[1] || 'image/png';
  const base64 = m[2] ? m[3] : btoa(decodeURIComponent(m[3]));
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('mp4') ? 'mp4' : 'png';
  const body = await call(settings, '/assets', { method: 'POST', form: { file: { field: 'file', name: `${sanitize(name)}.${ext}`, mime, base64 } } });
  const url = body?.image_url || body?.url || body?.asset?.image_url;
  if (!url) throw new Error('Krea: the upload returned no asset URL.');
  assetCache.set(k, url);
  return url;
}

// Wait for a job; `onStatus` gets the Krea status words. Stopping cancels the
// job on Krea's side (cancelled jobs are not billed).
async function waitJob(settings, jobId, { onStatus, signal, timeoutMs = 60 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    await sleep(signal ? 3000 : 3000);
    if (signal?.aborted) {
      try {
        await call(settings, `/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      } catch {
        /* already finished or gone */
      }
      const e = new Error('Aborted');
      e.name = 'AbortError';
      throw e;
    }
    const job = await call(settings, `/jobs/${encodeURIComponent(jobId)}`);
    const st = job?.status || 'processing';
    onStatus?.(st);
    if (st === 'completed') return job;
    if (st === 'failed') {
      const why = job?.error?.message || job?.result?.error?.message || job?.result?.error || job?.error || 'no reason given';
      throw new Error(`Krea: generation failed — ${typeof why === 'string' ? why : JSON.stringify(why)}`);
    }
    if (st === 'cancelled') throw new Error('Krea: the job was cancelled.');
    if (Date.now() - t0 > timeoutMs) throw new Error('Krea: timed out waiting for the job.');
  }
}

// result.urls is a list of URL strings or of { type, url } objects
function resultUrls(job) {
  const raw = job?.result?.urls;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw).flat() : [];
  return list.map((u) => (typeof u === 'string' ? u : u?.url)).filter(Boolean);
}

async function download(url, fallbackMime) {
  const file = await bridge().request({ url, method: 'GET', binary: true });
  if (!file.ok || !file.base64) throw new Error(`Krea: the result could not be downloaded (HTTP ${file.status}).`);
  const mime = (file.contentType || '').split(';')[0] || fallbackMime;
  return `data:${mime};base64,${file.base64}`;
}

// A first or final frame. `images` are the reference photos (data URLs).
export async function generateKreaImage(settings, { prompt, images = [], aspectRatio = '16:9', name }) {
  if (!(settings.kreaKey || '').trim()) throw new Error('NO_KREA_KEY');
  await enforcePolicy(settings, { kind: 'image', text: prompt });
  const model = kreaImageModelOf(settings);
  const refs = [];
  for (const [i, img] of (images || []).slice(0, model.maxRefs || 0).entries()) refs.push(await uploadAsset(settings, img, `${name || 'ref'}_ref${i + 1}`));
  if (model.minRefs && refs.length < model.minRefs) throw new Error(`Krea: ${model.label} needs at least ${model.minRefs} reference image — attach a character, location or asset photo to the shot.`);
  const body = { prompt: String(prompt || ''), ...(model.extra || {}) };
  if (model.size === 'aspect') {
    body.aspect_ratio = kreaAspect({ aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'] }, aspectRatio);
    body.resolution = model.resolution || '1K';
  } else {
    const [w, h] = SIZES[aspectRatio] || SIZES['16:9'];
    body.width = w;
    body.height = h;
  }
  if (refs.length) {
    if (model.refs === 'urls') body.image_urls = refs;
    else if (model.refs === 'style') body.style_images = refs.map((url) => ({ url, strength: 1 }));
    else if (model.refs === 'tagged') body.reference_images = refs.map((url, i) => ({ url, tag: `ref${i + 1}` }));
  }
  const job = await call(settings, model.path, { method: 'POST', json: body });
  if (!job?.job_id) throw new Error('Krea: the job was accepted but returned no id.');
  const done = await waitJob(settings, job.job_id, { timeoutMs: 15 * 60 * 1000 });
  const url = resultUrls(done)[0];
  if (!url) throw new Error('Krea finished but returned no image file.');
  return download(url, 'image/png');
}

// One shot. `firstFrame` / `lastFrame` are data URLs; `durationSec` is the
// shot's length (the model's nearest allowed length is rendered).
export async function generateKreaVideo(
  settings,
  { prompt, firstFrame, lastFrame = null, durationSec, resolution = 'HD', aspectRatio = '16:9', name },
  { onStatus, signal } = {}
) {
  if (!(settings.kreaKey || '').trim()) throw new Error('NO_KREA_KEY');
  await enforcePolicy(settings, { kind: 'video', text: prompt });
  const model = kreaVideoModelOf(settings);
  const seconds = kreaSeconds(model, durationSec);
  const useLast = !!lastFrame && model.lastFrame;
  const body = {
    prompt: String(prompt || ''),
    start_image: await uploadAsset(settings, firstFrame, `${name || 'shot'}_first`),
    ...(useLast ? { end_image: await uploadAsset(settings, lastFrame, `${name || 'shot'}_last`) } : {}),
    aspect_ratio: kreaAspect(model, aspectRatio),
    duration: seconds,
    // the app adds voice and sound itself (Gemini TTS, the audio lanes)
    ...(model.audioField ? { generate_audio: false } : {}),
    ...(model.resField ? { [model.resField]: model.resMap[resolution] || model.resMap.HD } : {}),
    ...(model.extra || {}),
  };
  onStatus?.('queued');
  const job = await call(settings, model.path, { method: 'POST', json: body });
  if (!job?.job_id) throw new Error('Krea: the job was accepted but returned no id.');
  const done = await waitJob(settings, job.job_id, { onStatus, signal });
  const url = resultUrls(done).find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u)) || resultUrls(done)[0];
  if (!url) throw new Error('Krea finished but returned no video file.');
  return {
    dataURL: await download(url, 'video/mp4'),
    filename: `${sanitize(name)}.mp4`,
    seconds,
    model: model.id,
    nativeAudio: !!model.nativeAudio,
  };
}
