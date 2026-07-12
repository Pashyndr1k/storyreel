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

// Video resolutions per project aspect ratio (multiples of 8, LTX-friendly).
const VIDEO_DIMS = {
  '16:9': [1280, 720],
  '4:3': [1200, 900],
  '1:1': [960, 960],
  '3:4': [900, 1200],
  '9:16': [720, 1280],
};
export const videoDims = (ratio) => VIDEO_DIMS[ratio] || VIDEO_DIMS['16:9'];

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
// First frame only → ltx_i2v; first + last frame → ltx_flf2v. Returns the
// video as a data URL plus the ComfyUI-side filename.
export async function generateComfyVideo(
  settings,
  { prompt, firstFrame, lastFrame, durationSec, aspectRatio, name },
  { onStatus } = {}
) {
  const [w, h] = videoDims(aspectRatio);
  const dur = Math.max(2, Math.min(10, Math.round(durationSec || 4)));
  const stamp = Date.now();
  let graph;

  if (lastFrame) {
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
  const vid = collectFiles(outputs).find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f.filename));
  if (!vid) throw new Error('ComfyUI finished but returned no video file.');
  const blob = await fetchOutputBlob(settings, vid);
  return { dataURL: await blobToDataURL(blob), filename: vid.filename };
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
