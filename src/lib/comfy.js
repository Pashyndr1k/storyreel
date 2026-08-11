// ComfyUI client. Talks to a local ComfyUI server (default http://127.0.0.1:8000)
// using API-format workflow templates captured from the user's own proven runs:
//   ltx_i2v_api.json    — LTX-2 image-to-video (first frame + motion prompt)
//   ltx_flf2v_api.json  — LTX-2 first+last-frame-to-video
//   krea2_t2i_api.json  — Krea-2 Turbo text-to-image (Stage-4 storyboards)
// Requests avoid CORS preflights (text/plain POST bodies, FormData uploads);
// in the Vite dev server they go through the /comfy proxy, in Electron the
// main process strips the Origin header and injects CORS response headers.
import i2vTemplate from '../data/comfy/ltx_i2v_api.json';
import flf2vTemplate from '../data/comfy/ltx_flf2v_api.json';
import t2iTemplate from '../data/comfy/krea2_t2i_api.json';
import flux2Template from '../data/comfy/flux2_klein_edit_api.json';
import ttsTemplate from '../data/comfy/omnivoice_tts_api.json';
import si2vTemplate from '../data/comfy/ltx_si2v_api.json';
import h3Template from '../data/comfy/minimax_h3_i2v_api.json';
import h3RefTemplate from '../data/comfy/minimax_h3_r2v_api.json';
import aceTemplate from '../data/comfy/ace_step_api.json';
import sfxTemplate from '../data/comfy/stable_audio_sfx_api.json';

export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8000';
export const DEFAULT_OUTPUT_DIR = 'D:\\Claude work\\ComfyUI\\Output';

function base(settings) {
  // In Electron the main-process bridge talks to ComfyUI directly (no CORS);
  // the Vite dev server proxies /comfy to sidestep ComfyUI's same-origin
  // check; a plain production browser build hits the URL directly.
  if (window.comfyBridge?.request) return (settings.comfyUrl || DEFAULT_COMFY_URL).replace(/\/+$/, '');
  if (import.meta.env.DEV) return '/comfy';
  return (settings.comfyUrl || DEFAULT_COMFY_URL).replace(/\/+$/, '');
}

// Video resolutions per aspect ratio and quality tier (LTX-friendly dims; the
// HD row is unchanged from before). HD is the long-standing default; SD is
// faster/cheaper, FHD is full-quality.
const VIDEO_DIMS = {
  SD: {
    '16:9': [848, 480],
    '4:3': [640, 480],
    '1:1': [512, 512],
    '3:4': [480, 640],
    '9:16': [480, 848],
  },
  HD: {
    '16:9': [1280, 720],
    '4:3': [1200, 900],
    '1:1': [960, 960],
    '3:4': [900, 1200],
    '9:16': [720, 1280],
  },
  FHD: {
    '16:9': [1920, 1080],
    '4:3': [1600, 1200],
    '1:1': [1440, 1440],
    '3:4': [1200, 1600],
    '9:16': [1080, 1920],
  },
};
export const VIDEO_RESOLUTIONS = ['SD', 'HD', 'FHD'];

// ---- MiniMax H3 (local open weights) ---------------------------------------
// The open checkpoint is H3-Base: a 768px SHORT EDGE ceiling (the 2K figure in
// the marketing belongs to the API-only Regenerate-2K module), dimensions in
// multiples of 32, 24fps, and native stereo audio produced in the same forward
// pass as the picture. Our SD/HD/FHD tiers therefore map onto H3's own
// megapixel ladder rather than the LTX dimensions.
export const VIDEO_ENGINES = ['ltx', 'minimax'];
const H3_DIMS = {
  SD: { '16:9': [640, 352], '4:3': [576, 448], '1:1': [512, 512], '3:4': [448, 576], '9:16': [352, 640] },
  HD: { '16:9': [864, 480], '4:3': [800, 608], '1:1': [704, 704], '3:4': [608, 800], '9:16': [480, 864] },
  // 768 is a hard SHORT-EDGE ceiling for the open weights — a square frame
  // tops out at 768x768, it does not get to be 896.
  FHD: { '16:9': [1344, 768], '4:3': [1024, 768], '1:1': [768, 768], '3:4': [768, 1024], '9:16': [768, 1344] },
};
export const h3Dims = (ratio, resolution = 'HD') => {
  const tier = H3_DIMS[resolution] || H3_DIMS.HD;
  return tier[ratio] || tier['16:9'];
};

// H3 works in temporal blocks: only 17n+5 frame counts are valid at 24fps, and
// the model rounds UP. Mirrors the template's math node so the app can report
// the real duration instead of the requested one.
export const h3Frames = (seconds) => {
  const want = Math.max(5, Math.round((Number(seconds) || 4) * 24));
  return want + ((17 - ((want - 5) % 17)) % 17);
};
export const h3Seconds = (seconds) => h3Frames(seconds) / 24;
export const videoDims = (ratio, resolution = 'HD') => {
  const tier = VIDEO_DIMS[resolution] || VIDEO_DIMS.HD;
  return tier[ratio] || tier['16:9'];
};

// Krea-2 ResolutionSelector combo values per aspect ratio.
const T2I_ASPECT = {
  '16:9': '16:9 (Widescreen)',
  '4:3': '4:3 (Standard)',
  '1:1': '1:1 (Square)',
  '3:4': '3:4 (Portrait Standard)',
  '9:16': '9:16 (Portrait Widescreen)',
};

const textDecoder = new TextDecoder();

function b64ToBytes(b64) {
  const bin = atob(b64 || '');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function throwComfy(status, bytes) {
  let detail = `ComfyUI HTTP ${status}`;
  try {
    const err = JSON.parse(textDecoder.decode(bytes));
    detail = err?.error?.message || err?.error || detail;
    if (err?.node_errors && Object.keys(err.node_errors).length) {
      const first = Object.values(err.node_errors)[0];
      const msg = first?.errors?.[0]?.message;
      if (msg) detail += ` — ${msg}`;
    }
  } catch {
    /* keep status */
  }
  if (status === 403) {
    detail += ' — ComfyUI rejected the request origin. Restart StoryReel; if this persists, start ComfyUI with --enable-cors-header.';
  }
  throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
}

// Unified transport. In Electron every request runs in the main process
// (window.comfyBridge), which carries no Origin header — the reason renderer
// fetches got HTTP 403 from ComfyUI. Browsers use fetch (dev proxy or direct).
async function request(settings, path, { method = 'GET', json = null, upload = null } = {}) {
  const url = `${base(settings)}${path}`;

  if (window.comfyBridge?.request) {
    let out;
    try {
      out = await window.comfyBridge.request({ url, method, json, upload });
    } catch {
      throw new Error('COMFY_UNREACHABLE');
    }
    const bytes = b64ToBytes(out.base64);
    if (!out.ok) throwComfy(out.status, bytes);
    return {
      json: () => JSON.parse(textDecoder.decode(bytes)),
      blob: () => new Blob([bytes], { type: out.contentType || 'application/octet-stream' }),
    };
  }

  const opts = { method };
  if (upload) {
    const blob = new Blob([b64ToBytes(upload.base64)], { type: upload.mime || 'image/png' });
    const fd = new FormData();
    fd.append('image', blob, upload.filename);
    fd.append('overwrite', 'true');
    opts.body = fd;
  } else if (json != null) {
    // text/plain keeps this a "simple" request (no CORS preflight); the
    // aiohttp server parses the JSON body regardless of content type.
    opts.headers = { 'content-type': 'text/plain' };
    opts.body = JSON.stringify(json);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('COMFY_UNREACHABLE');
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!res.ok) throwComfy(res.status, buf);
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  return {
    json: () => JSON.parse(textDecoder.decode(buf)),
    blob: () => new Blob([buf], { type: ct }),
  };
}

// Upload a data-URL image into ComfyUI's input folder; returns the stored name.
async function uploadInput(settings, dataURL, name) {
  const [head, base64] = dataURL.split(',');
  const mime = head.match(/data:(.*?)(;|$)/)?.[1] || 'image/png';
  const res = await request(settings, '/upload/image', {
    method: 'POST',
    upload: { base64, mime, filename: name },
  });
  const data = res.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

// Queue an API-format graph; resolves with the outputs map once execution ends.
async function runGraph(settings, graph, { timeoutMs = 15 * 60 * 1000, onStatus } = {}) {
  const res = await request(settings, '/prompt', {
    method: 'POST',
    json: { prompt: graph, client_id: 'storyreel' },
  });
  const { prompt_id: id } = res.json();
  if (!id) throw new Error('ComfyUI did not accept the workflow.');

  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    if (Date.now() - started > timeoutMs) throw new Error('ComfyUI generation timed out.');
    let hist;
    try {
      hist = (await request(settings, `/history/${id}`)).json();
    } catch {
      continue; // transient poll failure — keep waiting
    }
    const item = hist?.[id];
    if (!item) {
      if (onStatus) onStatus('queued');
      continue;
    }
    const st = item.status || {};
    if (st.status_str === 'error') {
      const msgs = (st.messages || [])
        .filter((m) => m[0] === 'execution_error')
        .map((m) => m[1]?.exception_message)
        .filter(Boolean);
      throw new Error(msgs[0] || 'ComfyUI execution failed.');
    }
    if (item.outputs && Object.keys(item.outputs).length) return item.outputs;
  }
}

// Flatten a history outputs map into [{filename, subfolder, type}].
function collectFiles(outputs) {
  const files = [];
  for (const node of Object.values(outputs || {})) {
    for (const key of ['images', 'video', 'videos', 'gifs', 'audio']) {
      for (const f of node[key] || []) {
        if (f?.filename) files.push(f);
      }
    }
  }
  return files;
}

async function fetchOutputBlob(settings, file) {
  const q = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
  });
  const res = await request(settings, `/view?${q}`);
  return res.blob();
}

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the generated file.'));
    r.readAsDataURL(blob);
  });

// Copy a generated file into the local outputs folder (Electron only; the
// browser build silently skips). Returns true when a copy was written.
export async function saveToLocalOutputs(settings, filename, dataURL) {
  if (!window.localFiles?.saveOutput) return false;
  const dir = settings.comfyOutputDir || DEFAULT_OUTPUT_DIR;
  const base64 = dataURL.split(',')[1];
  if (!base64) return false;
  try {
    const out = await window.localFiles.saveOutput(dir, filename, base64);
    return !!out?.ok;
  } catch {
    return false;
  }
}

const rndSeed = () => Math.floor(Math.random() * 2 ** 48);
const clone = (o) => JSON.parse(JSON.stringify(o));
const sanitize = (s) => (s || 'shot').replace(/[^\w\d-]+/g, '_').slice(0, 60);

// ---- Stage 5: shot video ---------------------------------------------------
// Three LTX-2 workflows. 'auto' picks the richest one the shot's material
// allows: voice audio + first frame → ltx_si2v (talking video: the model reads
// mood, lip sync and pacing from the audio and image, so the prompt stays
// brief); first + last frame → ltx_flf2v; first frame only → ltx_i2v. Stage 5
// can pin a specific workflow per shot instead. Returns the video as a data
// URL plus the ComfyUI-side filename.
export const VIDEO_MODES = ['auto', 'i2v', 'flf2v', 'si2v'];
// H3 exposes its own workflow set: no audio-in (the model scores itself), and
// the extra reference mode when the shot has curated reference media.
export const H3_VIDEO_MODES = ['auto', 'i2v', 'flf2v', 'r2v'];

// H3 counterpart of resolveVideoMode: r2v only with references, flf2v only
// with a final frame, auto prefers the richest available.
export function resolveH3VideoMode(mode, { lastFrame, hasRefs } = {}) {
  if (mode === 'r2v' && hasRefs) return 'r2v';
  if (mode === 'flf2v' && lastFrame) return 'flf2v';
  if (mode === 'i2v') return 'i2v';
  if (mode === 'r2v' || mode === 'si2v' || mode === 'auto') return lastFrame ? 'flf2v' : 'i2v';
  return lastFrame ? 'flf2v' : 'i2v';
}

// The workflow a shot would actually run, given its material and the pinned
// mode. A pinned workflow whose material is missing falls back to auto.
export function resolveVideoMode(mode, { lastFrame, audio } = {}) {
  if (mode === 'si2v' && audio) return 'si2v';
  if (mode === 'flf2v' && lastFrame) return 'flf2v';
  if (mode === 'i2v') return 'i2v';
  if (audio) return 'si2v';
  if (lastFrame) return 'flf2v';
  return 'i2v';
}

// Pull the finished video out of a completed run (shared by both engines).
async function firstVideo(outputs, settings) {
  const vid = collectFiles(outputs).find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f.filename));
  if (!vid) throw new Error('ComfyUI finished but returned no video file.');
  const blob = await fetchOutputBlob(settings, vid);
  return { dataURL: await blobToDataURL(blob), filename: vid.filename };
}

// ---- H3 preflight -----------------------------------------------------------
// The H3 graph needs the MiniMax node pack plus four model files; without them
// ComfyUI fails with an opaque "node type not found" / "value not in list".
// So before the first H3 render per ComfyUI url, verify everything is in place
// and name exactly what is absent. Verification is best-effort: if ComfyUI is
// unreachable or an endpoint shape is unknown, the render proceeds and the
// normal error path speaks.
const H3_HF = 'https://huggingface.co/Comfy-Org/MiniMax-H3';
const h3PreflightOk = new Set();
export async function h3Preflight(settings, template = h3Template) {
  const key = (settings.comfyUrl || '') + '|' + (template === h3RefTemplate ? 'r2v' : 'i2v');
  if (h3PreflightOk.has(key)) return;
  const loaderField = { UNETLoader: 'unet_name', CLIPLoader: 'clip_name', VAELoader: 'vae_name' };
  // Model files the graph actually references — read from the template so the
  // check can never drift from the workflow.
  const needs = {};
  let h3Node = null;
  for (const node of Object.values(template)) {
    const field = loaderField[node.class_type];
    if (field) (needs[node.class_type] = needs[node.class_type] || new Set()).add(node.inputs[field]);
    if (node.class_type.startsWith('MiniMaxH3')) h3Node = node.class_type;
  }
  const info = async (cls) => {
    try {
      const res = await request(settings, `/object_info/${cls}`);
      return res.json();
    } catch {
      return null;
    }
  };
  const nodeInfo = await info(h3Node);
  if (nodeInfo === null) return; // ComfyUI unreachable — not a preflight matter
  const missing = [];
  if (!nodeInfo[h3Node]) {
    missing.push(`${h3Node} node — update ComfyUI to a build with MiniMax H3 support`);
  }
  for (const [cls, files] of Object.entries(needs)) {
    const ci = await info(cls);
    const avail = ci?.[cls]?.input?.required?.[loaderField[cls]]?.[0];
    if (!Array.isArray(avail)) continue; // unknown shape — do not block on it
    for (const f of files) if (!avail.includes(f)) missing.push(f);
  }
  if (missing.length) {
    throw new Error(
      `MiniMax H3 is not ready on this ComfyUI:\n• ${missing.join('\n• ')}\n` +
        `Model files: ${H3_HF} → ComfyUI/models (unet / text_encoders / vae).`
    );
  }
  h3PreflightOk.add(key);
}

// MiniMax H3 reference mode (ref2va checkpoint): the shot is conditioned on
// a curated set of reference media instead of a first frame. Documented caps:
// 9 images, 3 videos, 3 audio clips, 12 files and ~15s of media in total.
export const H3_REF_CAPS = { images: 9, videos: 3, audios: 3, total: 12 };

export async function generateComfyRefVideo(
  settings,
  { prompt, refImages = [], refVideos = [], refAudios = [], durationSec, aspectRatio, resolution, name },
  { onStatus } = {}
) {
  await h3Preflight(settings, h3RefTemplate);
  const [w, h] = h3Dims(aspectRatio, resolution);
  const stamp = Date.now();
  const graph = clone(h3RefTemplate);
  graph['136'].inputs.prompt = prompt;
  graph['136'].inputs.width = w;
  graph['136'].inputs.height = h;
  graph['136'].inputs.length = h3Frames(durationSec || 4);
  graph['136'].inputs.ref_image_size = settings.h3RefImageSize === 'max' ? 'max' : 'match';
  // Dynamic reference slots use the node's dotted input names, exactly as the
  // UI graph serializes them (ref_images.ref_image_0, ref_videos.ref_video_0
  // with a paired ref_video_audios slot, ref_audios.ref_audio_0).
  refImages.slice(0, H3_REF_CAPS.images).forEach((dataURL, k) => {
    const id = String(200 + k);
    graph[id] = { class_type: 'LoadImage', inputs: { image: '', upload: 'image' }, _meta: { title: `ref image ${k + 1}` } };
    graph['136'].inputs[`ref_images.ref_image_${k}`] = [id, 0];
    graph[id]._pendingUpload = { dataURL, name: `storyreel_${stamp}_ref${k}.png` };
  });
  refAudios.slice(0, H3_REF_CAPS.audios).forEach((dataURL, k) => {
    const id = String(220 + k);
    graph[id] = { class_type: 'LoadAudio', inputs: { audio: '' }, _meta: { title: `ref audio ${k + 1}` } };
    graph['136'].inputs[`ref_audios.ref_audio_${k}`] = [id, 0];
    graph[id]._pendingUpload = { dataURL, name: `storyreel_${stamp}_refaud${k}.wav`, field: 'audio' };
  });
  refVideos.slice(0, H3_REF_CAPS.videos).forEach((dataURL, k) => {
    const vid = String(240 + k);
    const comp = String(260 + k);
    graph[vid] = { class_type: 'LoadVideo', inputs: { file: '' }, _meta: { title: `ref video ${k + 1}` } };
    // GetVideoComponents outputs: images, audio, fps — the paired audio slot
    // takes the clip's own soundtrack.
    graph[comp] = { class_type: 'GetVideoComponents', inputs: { video: [vid, 0] }, _meta: { title: `ref video ${k + 1} audio` } };
    graph['136'].inputs[`ref_videos.ref_video_${k}`] = [vid, 0];
    graph['136'].inputs[`ref_video_audios.ref_video_audio_${k}`] = [comp, 1];
    graph[vid]._pendingUpload = { dataURL, name: `storyreel_${stamp}_refvid${k}.mp4`, field: 'file' };
  });
  // Upload everything, then patch the filenames into the loaders.
  for (const node of Object.values(graph)) {
    if (!node._pendingUpload) continue;
    const { dataURL, name: fname, field = 'image' } = node._pendingUpload;
    node.inputs[field] = await uploadInput(settings, dataURL, fname);
    delete node._pendingUpload;
  }
  graph['129'].inputs.noise_seed = rndSeed();
  graph['92'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;
  const outs = await runGraph(settings, graph, { onStatus });
  return firstVideo(outs, settings);
}

export async function generateComfyVideo(
  settings,
  { prompt, firstFrame, lastFrame, audio, durationSec, aspectRatio, resolution, name, mode = 'auto' },
  { onStatus } = {}
) {
  const engine = settings.videoEngine === 'minimax' ? 'minimax' : 'ltx';
  const [w, h] = engine === 'minimax'
    ? h3Dims(aspectRatio, resolution)
    : videoDims(aspectRatio, resolution);
  // Shots are 2-10s on the timeline, but generation requests carry the +2s
  // dynamics padding (head/tail get trimmed in assembly) — allow up to 12.
  const dur = Math.max(2, Math.min(12, Math.round(durationSec || 4)));
  const stamp = Date.now();
  const useMode = resolveVideoMode(mode, { lastFrame, audio });
  let graph;

  // ---- MiniMax H3 ----------------------------------------------------------
  // One node covers t2va/i2va/fl2va, and it scores itself: dialogue, effects
  // and music come out of the same pass, so no separate voice track is fed in.
  if (engine === 'minimax') {
    await h3Preflight(settings);
    graph = clone(h3Template);
    graph['200'].inputs.image = await uploadInput(settings, firstFrame, `storyreel_${stamp}_first.png`);
    graph['104'].inputs.first_frame = ['200', 0];
    if (lastFrame && useMode !== 'i2v') {
      graph['201'] = { class_type: 'LoadImage', inputs: { image: '', upload: 'image' }, _meta: { title: 'last frame' } };
      graph['201'].inputs.image = await uploadInput(settings, lastFrame, `storyreel_${stamp}_last.png`);
      graph['104'].inputs.last_frame = ['201', 0];
    }
    graph['104'].inputs.prompt = prompt;
    graph['104'].inputs.width = w;
    graph['104'].inputs.height = h;
    graph['104'].inputs.length = h3Frames(durationSec || 4);
    graph['15'].inputs.noise_seed = rndSeed();
    graph['92'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;
    const outs = await runGraph(settings, graph, { onStatus });
    return firstVideo(outs, settings);
  }

  if (useMode === 'si2v') {
    // Dialogue shot: the generated video carries the voice track and is
    // rendered at the EXACT shot duration (no padding — trimming would break
    // the audio sync), so assembly plays it as-is.
    graph = clone(si2vTemplate);
    graph['269'].inputs.image = await uploadInput(settings, firstFrame, `storyreel_${stamp}_first.png`);
    // Voice audio arrives as mp3 (OmniVoice) or wav (Gemini TTS) — name the
    // upload by its actual container so ComfyUI decodes it correctly.
    const audExt = /^data:audio\/wav/i.test(audio) ? 'wav' : 'mp3';
    graph['276'].inputs.audio = await uploadInput(settings, audio, `storyreel_${stamp}_voice.${audExt}`);
    graph['340:319'].inputs.value = prompt;
    graph['340:331'].inputs.value = Math.max(2, Math.min(12, durationSec || 4));
    graph['340:330'].inputs.value = w;
    graph['340:324'].inputs.value = h;
    graph['340:286'].inputs.noise_seed = rndSeed();
    graph['341'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;
  } else if (useMode === 'flf2v') {
    graph = clone(flf2vTemplate);
    graph['31'].inputs.image = await uploadInput(settings, firstFrame, `storyreel_${stamp}_first.png`);
    graph['39'].inputs.image = await uploadInput(settings, lastFrame, `storyreel_${stamp}_last.png`);
    graph['129:128'].inputs.text = prompt;
    graph['129:102'].inputs.value = dur;
    graph['129:113'].inputs.value = w;
    graph['129:98'].inputs.value = h;
    graph['129:100'].inputs.noise_seed = rndSeed();
    graph['68'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;
  } else {
    graph = clone(i2vTemplate);
    graph['269'].inputs.image = await uploadInput(settings, firstFrame, `storyreel_${stamp}_first.png`);
    graph['320:319'].inputs.value = prompt;
    graph['320:301'].inputs.value = dur;
    graph['320:312'].inputs.value = w;
    graph['320:299'].inputs.value = h;
    graph['320:276'].inputs.noise_seed = rndSeed();
    graph['320:277'].inputs.noise_seed = rndSeed();
    graph['75'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;
  }

  const outputs = await runGraph(settings, graph, { onStatus });
  return firstVideo(outputs, settings);
}

// ---- Stage 5: shot image via Flux.2 Klein 9B --------------------------------
// Image resolutions per aspect ratio (multiples of 16, ~1MP — Flux-friendly).
const IMG_DIMS = {
  '16:9': [1280, 720],
  '4:3': [1152, 864],
  '1:1': [1024, 1024],
  '3:4': [864, 1152],
  '9:16': [720, 1280],
};
const imageDims = (ratio) => IMG_DIMS[ratio] || IMG_DIMS['16:9'];

// Text-to-image / image editing on the local ComfyUI Flux.2 Klein 9B workflow
// (flux2_klein_edit_api.json). Takes up to TWO reference images: with one
// reference the second LoadImage chain is bypassed (nodes removed, the guider
// rewired to the first chain); with none, the guider runs straight off the
// text conditioning. Returns the image as a data URL plus its filename.
export async function generateComfyImage(settings, { prompt, images = [], aspectRatio, name }) {
  const graph = clone(flux2Template);
  const refs = (images || []).filter(Boolean).slice(0, 2);
  const [w, h] = imageDims(aspectRatio);
  const stamp = Date.now();

  graph['4'].inputs.text = prompt;
  graph['18'].inputs.width = w;
  graph['18'].inputs.height = h;
  graph['20'].inputs.width = w;
  graph['20'].inputs.height = h;
  graph['19'].inputs.noise_seed = rndSeed();
  graph['23'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;

  if (refs[0]) graph['6'].inputs.image = await uploadInput(settings, refs[0], `storyreel_${stamp}_ref1.png`);
  if (refs[1]) graph['11'].inputs.image = await uploadInput(settings, refs[1], `storyreel_${stamp}_ref2.png`);
  if (!refs[1]) {
    // Bypass the second reference chain: drop its nodes and hand the guider
    // the first chain's conditioning directly.
    for (const id of ['11', '12', '13', '14', '15']) delete graph[id];
    graph['16'].inputs.positive = ['9', 0];
    graph['16'].inputs.negative = ['10', 0];
  }
  if (!refs[0]) {
    // No references at all — pure text-to-image.
    for (const id of ['6', '7', '8', '9', '10']) delete graph[id];
    graph['16'].inputs.positive = ['4', 0];
    graph['16'].inputs.negative = ['5', 0];
  }

  const outputs = await runGraph(settings, graph);
  const img = collectFiles(outputs).find((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.filename));
  if (!img) throw new Error('ComfyUI finished but returned no image file.');
  const blob = await fetchOutputBlob(settings, img);
  return { dataURL: await blobToDataURL(blob), filename: img.filename };
}

// ---- Stage 5: shot voice audio via OmniVoice TTS ----------------------------
// OmniVoice (TTS Audio Suite) designs the voice reference-free from a tag
// instruction ("female, young adult, moderate pitch, british accent") and
// speaks SRT subtitle blocks, natively targeting each block's duration — the
// voice director times lines to the shot's events and the engine hits them.
const OMNI_LANG = { en: 'English', ru: 'Russian', uk: 'Ukrainian' };

// OmniVoice voice-design vocabulary (the model rejects unknown instruction
// tags, so the UI offers exactly these) and the engine-language menu shown in
// the audio tab. The design string joins the chosen tags in this slot order.
export const OMNI_VOICE_TAGS = {
  gender: ['male', 'female'],
  age: ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'],
  pitch: ['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch'],
  style: ['whisper'],
  accent: [
    'american accent',
    'british accent',
    'australian accent',
    'canadian accent',
    'indian accent',
    'chinese accent',
    'korean accent',
    'japanese accent',
    'portuguese accent',
    'russian accent',
  ],
};
export const OMNI_VOICE_SLOTS = ['gender', 'age', 'pitch', 'style', 'accent'];

// Real voice library (TTS Audio Suite voices_examples): every entry has a
// reference transcript next to its wav, which is what OmniVoice needs for
// zero-shot CLONING — a far more stable character voice than tag design.
// `tag` is the [voice_name] used inside SRT text to switch speakers;
// `file` is the narrator_voice enum value of the Unified TTS SRT node.
export const VOICE_LIBRARY = [
  { tag: 'Clint_Eastwood CC3 (enhanced2)', file: 'voices_examples/Clint_Eastwood CC3 (enhanced2).wav', label: 'Clint (elderly male)', desc: 'elderly male, dry, gravelly, weathered' },
  { tag: 'David_Attenborough CC3', file: 'voices_examples/David_Attenborough CC3.wav', label: 'David (narrator)', desc: 'elderly male, refined, gentle, documentary narrator' },
  { tag: 'Morgan_Freeman CC3', file: 'voices_examples/Morgan_Freeman CC3.wav', label: 'Morgan (deep male)', desc: 'mature male, deep, warm, calm authority' },
  { tag: 'Sophie_Anderson CC3', file: 'voices_examples/Sophie_Anderson CC3.wav', label: 'Sophie (warm female)', desc: 'adult female, warm, expressive' },
  { tag: 'female_01', file: 'voices_examples/female/female_01.wav', label: 'Female 1 (neutral)', desc: 'adult female, neutral, clear' },
  { tag: 'female_02', file: 'voices_examples/female/female_02.wav', label: 'Female 2 (young)', desc: 'young female, bright, energetic' },
  { tag: 'male_01', file: 'voices_examples/male/male_01.wav', label: 'Male 1 (neutral)', desc: 'adult male, neutral, even' },
  { tag: 'male_02', file: 'voices_examples/male/male_02.wav', label: 'Male 2 (firm)', desc: 'adult male, deeper, firm' },
];
export const OMNI_LANGUAGES = [
  'Auto',
  'English',
  'Russian',
  'Ukrainian',
  'German',
  'French',
  'Spanish',
  'Italian',
  'Portuguese',
  'Polish',
  'Chinese',
  'Japanese',
  'Korean',
];

// Speak a shot's dialogue on the local OmniVoice TTS workflow. `srt` is
// standard SRT text (timestamps inside the shot's duration; [voice_name]
// speaker tags and angle non-verbal tags like <sigh> allowed); `narrator` is
// a VOICE_LIBRARY file to CLONE (fallback voice for untagged lines) — with
// 'none' the voice is designed from `instruct` instead. An explicit
// `language` (from the audio tab's selector) overrides the script-language
// default. Returns the audio as a data URL plus filename.
export async function generateComfyVoice(settings, { srt, instruct, narrator, lang, language, name }) {
  const graph = clone(ttsTemplate);
  graph['1'].inputs.language = language || OMNI_LANG[lang] || 'Auto';
  graph['1'].inputs.instruct = String(instruct || '').trim();
  graph['2'].inputs.srt_content = srt;
  graph['2'].inputs.narrator_voice = VOICE_LIBRARY.some((v) => v.file === narrator) ? narrator : 'none';
  graph['2'].inputs.seed = Math.floor(Math.random() * 4294967295);
  graph['3'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;

  const outputs = await runGraph(settings, graph, { timeoutMs: 10 * 60 * 1000 });
  const aud = collectFiles(outputs).find((f) => /\.(mp3|flac|wav|ogg|opus)$/i.test(f.filename));
  if (!aud) throw new Error('ComfyUI finished but returned no audio file.');
  const blob = await fetchOutputBlob(settings, aud);
  return { dataURL: await blobToDataURL(blob), filename: aud.filename };
}

// ---- Stage 6: background music via ACE-Step 1.5 XL Turbo --------------------
// Instrumental-only score for the film: `tags` is the ACE caption (style,
// instruments, emotion, texture — comma-separated dimensions per the ACE-Step
// guide), the lyrics track is pinned to "[Instrumental]" so no vocals ever
// appear, and bpm/seconds set the tempo and length. Returns an mp3 data URL.
export async function generateComfyMusic(settings, { tags, bpm, seconds, name }, { onStatus } = {}) {
  const graph = clone(aceTemplate);
  const dur = Math.max(5, Math.min(600, Math.round(seconds || 60)));
  const seed = rndSeed();
  graph['4'].inputs.tags = tags;
  graph['4'].inputs.lyrics = '[Instrumental]';
  graph['4'].inputs.bpm = Math.max(30, Math.min(300, Math.round(bpm || 120)));
  graph['4'].inputs.duration = dur;
  graph['4'].inputs.seed = seed;
  graph['6'].inputs.seconds = dur;
  graph['7'].inputs.seed = seed;
  graph['10'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;

  const outputs = await runGraph(settings, graph, { timeoutMs: 15 * 60 * 1000, onStatus });
  const aud = collectFiles(outputs).find((f) => /\.(mp3|flac|wav|ogg|opus)$/i.test(f.filename));
  if (!aud) throw new Error('ComfyUI finished but returned no audio file.');
  const blob = await fetchOutputBlob(settings, aud);
  return { dataURL: await blobToDataURL(blob), filename: aud.filename };
}

// Sound effect via Stable Audio 3 Medium (the audio_stable_audio_3_medium
// workflow, flattened; the optional LLM re-prompt path is skipped — StoryReel
// sends the user's text straight to the encoder). English prompts work best.
export async function generateComfySfx(settings, { prompt, seconds, name }, { onStatus } = {}) {
  const graph = clone(sfxTemplate);
  const dur = Math.max(1, Math.min(120, Math.round((Number(seconds) || 5) * 10) / 10));
  graph['6'].inputs.text = prompt;
  graph['11'].inputs.seconds = dur;
  graph['3'].inputs.seed = rndSeed();
  graph['19'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;

  const outputs = await runGraph(settings, graph, { timeoutMs: 10 * 60 * 1000, onStatus });
  const aud = collectFiles(outputs).find((f) => /\.(mp3|flac|wav|ogg|opus)$/i.test(f.filename));
  if (!aud) throw new Error('ComfyUI finished but returned no audio file.');
  const blob = await fetchOutputBlob(settings, aud);
  return { dataURL: await blobToDataURL(blob), filename: aud.filename };
}

// ---- Stage 4: storyboard frame via Krea-2 Turbo -----------------------------
// Returns the full-resolution image as a data URL plus its filename; the
// caller downscales for the animatic strip.
export async function generateComfyStoryboard(settings, { prompt, aspectRatio, name }) {
  const graph = clone(t2iTemplate);
  graph['30:19'].inputs.value = prompt;
  graph['49'].inputs.aspect_ratio = T2I_ASPECT[aspectRatio] || T2I_ASPECT['16:9'];
  graph['49'].inputs.megapixels = 0.5; // storyboards are rough previews — keep them fast
  graph['30:3'].inputs.seed = rndSeed();
  graph['29'].inputs.filename_prefix = `StoryReel/${sanitize(name)}`;

  const outputs = await runGraph(settings, graph);
  const img = collectFiles(outputs).find((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.filename));
  if (!img) throw new Error('ComfyUI finished but returned no image file.');
  const blob = await fetchOutputBlob(settings, img);
  return { dataURL: await blobToDataURL(blob), filename: img.filename };
}
