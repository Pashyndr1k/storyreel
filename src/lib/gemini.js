import { dataURLToInline, resizeDataURL } from './images.js';
import { withRetry } from './retry.js';

// "Nano Banana 2" (Gemini 3 Pro Image). Overridable in Settings if the id changes.
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function extractImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }
  const text = parts.map((p) => p.text).filter(Boolean).join(' ').trim();
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new Error(`Request was blocked by Gemini (${block}).`);
  throw new Error(text || 'Gemini returned no image.');
}

// Generate an image from a text prompt plus optional reference images (data URLs).
// imageSize: '1K' | '2K' | '4K' — resolution hint for Gemini 3 Pro Image (Nano Banana 2).
export async function generateImage(settings, { prompt, images = [], aspectRatio, imageSize }) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = settings.geminiModel || DEFAULT_IMAGE_MODEL;

  const parts = [{ text: prompt }];
  for (const img of images) parts.push({ inline_data: dataURLToInline(img) });

  const generationConfig = { responseModalities: ['IMAGE'] };
  const imageConfig = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (imageSize) imageConfig.imageSize = imageSize;
  if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;

  return withRetry(async () => {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig,
      }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err?.error?.message || detail;
      } catch {
        /* keep status */
      }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const raw = extractImage(data);
    // Keep the model's native resolution; only re-encode to JPEG to keep storage sane.
    return resizeDataURL(raw, Number.POSITIVE_INFINITY, 0.92);
  });
}

// Voice-to-text via Gemini audio understanding (works in the browser and Electron).
// Model availability varies per key/generation, so discover a usable text model
// from the key's own model list instead of hardcoding one.
const TRANSCRIBE_PREFERENCES = [
  /^gemini-3.*flash/,
  /^gemini-flash-latest$/,
  /^gemini-3(?!.*image)/,
  /^gemini-2\.5-flash/,
  /^gemini-2\.0-flash/,
  /flash/,
];
let transcribeModelCache = null;

async function pickTranscribeModel(key) {
  if (transcribeModelCache) return transcribeModelCache;
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=1000`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message || detail;
    } catch {
      /* keep status */
    }
    throw new Error(detail);
  }
  const data = await res.json();
  const names = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => (m.name || '').replace(/^models\//, ''))
    // exclude models that can't do plain text-out audio understanding
    .filter((n) => n && !/image|imagen|embed|tts|veo|aqa|live|audio-dialog/i.test(n));
  for (const re of TRANSCRIBE_PREFERENCES) {
    const hit = names.find((n) => re.test(n));
    if (hit) {
      transcribeModelCache = hit;
      return hit;
    }
  }
  if (names.length) {
    transcribeModelCache = names[0];
    return names[0];
  }
  throw new Error('No Gemini text model available on this API key for transcription.');
}

export async function transcribeAudio(settings, blob, _retried) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = await pickTranscribeModel(key);

  const dataURL = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the recording.'));
    r.readAsDataURL(blob);
  });
  const [head, data] = dataURL.split(',');
  const mime = head.match(/data:(.*?);base64/)?.[1] || 'audio/webm';

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio recording verbatim in its original language. Return ONLY the transcribed text — no commentary, no labels, no quotes.' },
            { inline_data: { mime_type: mime, data } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message || detail;
    } catch {
      /* keep status */
    }
    // The picked model may have been retired between listing and calling —
    // drop the cache and rediscover once.
    if (!_retried && (res.status === 404 || /not found|not supported/i.test(detail))) {
      transcribeModelCache = null;
      return transcribeAudio(settings, blob, true);
    }
    throw new Error(detail);
  }
  const out = await res.json();
  const text = (out?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .trim();
  return text;
}

// Fetch the models available to this key, preferring image-capable ones.
export async function listImageModels(settings) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=1000`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message || detail;
    } catch {
      /* keep status */
    }
    throw new Error(detail);
  }
  const data = await res.json();
  const models = (data.models || []).filter((m) =>
    (m.supportedGenerationMethods || []).includes('generateContent')
  );
  const imageOnes = models.filter((m) => /image/i.test(m.name || ''));
  const chosen = imageOnes.length ? imageOnes : models;
  return chosen.map((m) => (m.name || '').replace(/^models\//, '')).filter(Boolean);
}
