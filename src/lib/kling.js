// Kling video generation through the official API (the July-2026 API: one
// static API key, the model in the path, a `contents` list).
//   docs: https://kling.ai/document-api  ·  key: https://kling.ai/dev/api-key
//
// The API sends no CORS headers, so every call goes through the Electron
// main process (window.netBridge, electron/netRequest.cjs). In a plain
// browser build there is no bridge — generation reports KLING_NEEDS_APP.
import { DEFAULT_KLING_MODEL } from './config.js';

export const KLING_BASE = 'https://api-singapore.klingai.com'; // the documented domain outside China

// What each image-to-video model accepts (per its API page).
//   lastFrame       — takes a last frame next to the first
//   lastFrame1080   — …but only at 1080p
//   range / fixed   — allowed clip lengths in seconds
//   audio, multiShot — settings the model knows (sent only when it does)
export const KLING_MODELS = [
  { id: 'kling-3.0', label: 'Kling 3.0', lastFrame: true, range: [3, 15], audio: true, multiShot: true },
  { id: 'kling-3.0-turbo', label: 'Kling 3.0 Turbo', lastFrame: false, range: [3, 15] },
  { id: 'kling-2.6', label: 'Kling 2.6', lastFrame: true, lastFrame1080: true, fixed: [5, 10], audio: true },
  { id: 'kling-2.5-turbo', label: 'Kling 2.5 Turbo', lastFrame: true, lastFrame1080: true, fixed: [5, 10] },
];
export const klingModelOf = (settings) =>
  KLING_MODELS.find((m) => m.id === (settings?.klingModel || DEFAULT_KLING_MODEL)) || KLING_MODELS[0];

// The clip length Kling will actually render for a shot of `sec` seconds:
// whole seconds inside the model's range, or its nearest fixed length.
export function klingSeconds(model, sec) {
  const s = Number(sec) || 5;
  if (model.fixed) return model.fixed.find((d) => s <= d) || model.fixed[model.fixed.length - 1];
  return Math.max(model.range[0], Math.min(model.range[1], Math.ceil(s - 0.001)));
}

// Workflows Kling offers: from the first frame, or first → last frame.
export const KLING_VIDEO_MODES = ['auto', 'i2v', 'flf2v'];
export function resolveKlingMode(mode, { lastFrame, model } = {}) {
  if (!lastFrame || !model?.lastFrame) return 'i2v';
  return mode === 'i2v' ? 'i2v' : 'flf2v';
}

const rawBase64 = (dataURL) => String(dataURL || '').replace(/^data:[^,]*,/, '');
const sanitize = (s) => String(s || 'storyreel').replace(/[^\w\d-]+/g, '_').slice(0, 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kling error codes → a sentence the user can act on (the raw message stays).
function klingError(status, body) {
  const code = Number(body?.code);
  const raw = body?.message || `HTTP ${status}`;
  let what = 'request failed';
  if (code >= 1000 && code <= 1004) what = 'the API key was rejected — check it in Settings (the key is shown once at kling.ai/dev/api-key)';
  else if (code === 1101 || code === 1102) what = 'the account has no balance / the resource pack is used up';
  else if (code === 1100 || code === 1103) what = 'the account has no access to this API or model';
  else if (code === 1200 || code === 1201) what = 'the request was not accepted (invalid parameters)';
  else if (code === 1202 || code === 1203) what = 'this model is not available on the account';
  else if (code === 1300 || code === 1301) what = 'the content was rejected by Kling’s safety policy — rephrase the prompt or change the frame';
  else if (code === 1302) what = 'rate limit reached — try again in a moment';
  else if (code === 1303) what = 'too many tasks are running on this account';
  else if (code >= 5000) what = 'Kling’s service is temporarily unavailable';
  const e = new Error(`Kling: ${what} (${code || status}: ${raw})`);
  e.klingCode = code;
  return e;
}

async function call(settings, path, { method = 'GET', json = null } = {}) {
  const bridge = typeof window !== 'undefined' ? window.netBridge : null;
  if (!bridge) throw new Error('KLING_NEEDS_APP');
  const res = await bridge.request({
    url: KLING_BASE + path,
    method,
    headers: { Authorization: `Bearer ${settings.klingKey}` },
    json,
  });
  let body = null;
  try {
    body = JSON.parse(res.text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !body || Number(body.code) !== 0) throw klingError(res.status, body);
  return body.data;
}

// Render one shot. `firstFrame` / `lastFrame` are data URLs; `durationSec` is
// the shot's length (the model's nearest allowed length is used); `resolution`
// is the app's SD / HD / FHD. Returns the clip as a data URL plus the seconds
// Kling actually rendered.
export async function generateKlingVideo(
  settings,
  { prompt, firstFrame, lastFrame = null, durationSec, resolution = 'HD', name },
  { onStatus } = {}
) {
  if (!(settings.klingKey || '').trim()) throw new Error('NO_KLING_KEY');
  const model = klingModelOf(settings);
  const useLast = !!lastFrame && model.lastFrame;
  const res = resolution === 'FHD' || (useLast && model.lastFrame1080) ? '1080p' : '720p';
  const seconds = klingSeconds(model, durationSec);
  const contents = [
    { type: 'prompt', text: String(prompt || '').slice(0, 2500) },
    { type: 'first_frame', url: rawBase64(firstFrame) },
  ];
  if (useLast) contents.push({ type: 'last_frame', url: rawBase64(lastFrame) });
  const body = {
    contents,
    settings: {
      resolution: res,
      duration: seconds,
      // the app adds voice and sound itself (Gemini TTS, the audio lanes)
      ...(model.audio ? { audio: 'off' } : {}),
      // one continuous shot — the model must not plan cuts of its own
      ...(model.multiShot ? { multi_shot: false } : {}),
    },
    options: { watermark_info: { enabled: false } },
  };

  // create — a busy account (1303) is retried with backoff, as the docs advise
  let task = null;
  for (let attempt = 0; ; attempt++) {
    try {
      task = await call(settings, `/image-to-video/${model.id}`, { method: 'POST', json: body });
      break;
    } catch (e) {
      if (e.klingCode === 1303 && attempt < 5) {
        onStatus?.('queued');
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }
  if (!task?.id) throw new Error('Kling: the task was accepted but returned no id.');

  // poll (queries do not count against concurrency)
  const t0 = Date.now();
  for (;;) {
    await sleep(5000);
    const data = await call(settings, `/tasks?task_ids=${encodeURIComponent(task.id)}`);
    const tk = Array.isArray(data) ? data[0] : data;
    onStatus?.(tk?.status || 'processing');
    if (tk?.status === 'succeeded') {
      const out = (tk.outputs || []).find((o) => o.type === 'video') || (tk.outputs || [])[0];
      if (!out?.url) throw new Error('Kling finished but returned no video file.');
      // result URLs are hotlink-protected and expire — fetch the file now
      const file = await window.netBridge.request({ url: out.url, method: 'GET', binary: true });
      if (!file.ok || !file.base64) throw new Error(`Kling: the video could not be downloaded (HTTP ${file.status}).`);
      return {
        dataURL: `data:video/mp4;base64,${file.base64}`,
        filename: `${sanitize(name)}.mp4`,
        seconds: Number(out.duration) || seconds,
        model: model.id,
      };
    }
    if (tk?.status === 'failed') throw new Error(`Kling: generation failed — ${tk.message || 'no reason given'}`);
    if (Date.now() - t0 > 25 * 60 * 1000) throw new Error('Kling: timed out waiting for the video.');
  }
}
