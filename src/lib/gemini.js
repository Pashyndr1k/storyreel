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

// ---- Cheap lite-image pipeline (storyboard frames + project covers) ------
// Pinned to gemini-3.1-flash-lite-image; if that id isn't available on the
// key, falls back once to another image-capable flash model from ListModels.
const LITE_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
let liteModelCache = null;

async function discoverLiteFallback(key, fallback) {
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=1000`);
    if (res.ok) {
      const data = await res.json();
      const names = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter((n) => /image/i.test(n) && !/veo|embed|imagen/i.test(n));
      const flash = names.find((n) => /flash/i.test(n));
      return flash || names[0] || fallback;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

async function liteImageCall(settings, { prompt, aspectRatio, maxPixels, quality }, _retried) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = liteModelCache || LITE_IMAGE_MODEL;

  const generationConfig = { responseModalities: ['IMAGE'] };
  if (aspectRatio) generationConfig.imageConfig = { aspectRatio, imageSize: '1K' };

  try {
    return await withRetry(async () => {
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
      return resizeDataURL(raw, maxPixels, quality);
    });
  } catch (e) {
    // Preferred model missing on this key — discover a substitute once.
    if (!_retried && (e.status === 404 || /not found|not supported/i.test(String(e.message)))) {
      liteModelCache = await discoverLiteFallback(key, settings.geminiModel || DEFAULT_IMAGE_MODEL);
      return liteImageCall(settings, { prompt, aspectRatio, maxPixels, quality }, true);
    }
    throw e;
  }
}

// Stage-4 animatic frames: tiny (~320x200) so pacing can be judged before
// spending credits on full Nano Banana renders.
export function generateStoryboardImage(settings, { prompt, aspectRatio }) {
  return liteImageCall(settings, { prompt, aspectRatio, maxPixels: 320 * 200, quality: 0.72 });
}

// Project cover: same cheap lite model, but kept at native resolution.
export function generateCoverImage(settings, { prompt, aspectRatio }) {
  return liteImageCall(settings, { prompt, aspectRatio, maxPixels: Number.POSITIVE_INFINITY, quality: 0.9 });
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

// Clean up dictated text: strip fillers, false starts and stray speech from
// other people, fix grammar and structure. Same fast model as transcription.
export async function groomText(settings, text, _retried) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = await pickTranscribeModel(key);
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `The text below was dictated by voice. Clean it up: remove filler words, false starts, duplicated words, and any unrelated speech accidentally captured from other people nearby; fix grammar, punctuation and sentence structure so it reads clearly. Keep the author's language, meaning, tone and every substantive detail. Return ONLY the cleaned text — no commentary, no labels, no quotes.\n\n"""\n${text}\n"""`,
            },
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
    if (!_retried && (res.status === 404 || /not found|not supported/i.test(detail))) {
      transcribeModelCache = null;
      return groomText(settings, text, true);
    }
    throw new Error(detail);
  }
  const out = await res.json();
  return (out?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .trim();
}

// ---- Text generation (optional alternative to Claude) ----------------------
// Discovered from the key's model list, preferring the strongest text models.
const TEXTGEN_PREFERENCES = [
  /^gemini-3.*pro(?!.*image)/,
  /^gemini-3(?!.*image)(?!.*lite)/,
  /^gemini-flash-latest$/,
  /^gemini-2\.5-pro/,
  /^gemini-2\.5-flash/,
  /flash/,
];
let textGenModelCache = null;
// Models this key's plan can't actually use (free tier reports limit: 0 for
// paid-only models like gemini-*-pro). Skipped so we fall back to Flash.
const textGenBlocked = new Set();

async function pickTextGenModel(key) {
  if (textGenModelCache && !textGenBlocked.has(textGenModelCache)) return textGenModelCache;
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
    .filter((n) => n && !/image|imagen|embed|tts|veo|aqa|live|audio-dialog/i.test(n) && !textGenBlocked.has(n));
  for (const re of TEXTGEN_PREFERENCES) {
    const hit = names.find((n) => re.test(n));
    if (hit) {
      textGenModelCache = hit;
      return hit;
    }
  }
  if (names.length) {
    textGenModelCache = names[0];
    return names[0];
  }
  throw new Error(
    textGenBlocked.size
      ? 'This Gemini key has no text model with available quota — the free tier does not cover the Pro models. Enable billing in Google AI Studio or switch the text service back to Claude in Settings.'
      : 'No Gemini text model available on this API key.'
  );
}

// A quota/plan error where THIS model isn't usable on the key's plan at all:
// the free tier returns 429 with "limit: 0". Must stay narrow — a temporary
// rate limit (limit: N>0) also mentions "free_tier" but should be retried on
// the SAME model by withRetry, not cause a permanent fallback.
function isPlanUnavailable(status, detail) {
  return status === 429 && /\blimit:\s*0\b/i.test(detail || '');
}

// Anthropic-style content (plain string or [{type:'text'|'image'}]) → parts.
function toGeminiParts(user) {
  if (!Array.isArray(user)) return [{ text: String(user) }];
  return user.map((b) =>
    b.type === 'image'
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } }
      : { text: b.text || '' }
  );
}

// Runs the same {system, user, maxTokens} spec Claude uses; returns raw text
// (the specs demand JSON-only output, enforced here via responseMimeType).
export async function generateGeminiText(settings, { system, user, maxTokens = 4096 }, _attempt = 0) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = await pickTextGenModel(key);
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system || '' }] },
      contents: [{ role: 'user', parts: toGeminiParts(user) }],
      // Thinking models spend output tokens on reasoning — leave headroom.
      generationConfig: { maxOutputTokens: maxTokens * 2, responseMimeType: 'application/json' },
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
    // This model isn't usable on the key's plan — blacklist it and try the
    // next candidate (typically a Flash model with free-tier quota).
    if (isPlanUnavailable(res.status, detail) && _attempt < 4) {
      textGenBlocked.add(model);
      textGenModelCache = null;
      return generateGeminiText(settings, { system, user, maxTokens }, _attempt + 1);
    }
    if (_attempt < 4 && (res.status === 404 || /not found|not supported/i.test(detail))) {
      textGenModelCache = null;
      return generateGeminiText(settings, { system, user, maxTokens }, _attempt + 1);
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const out = await res.json();
  const text = (out?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .filter(Boolean)
    .join('');
  if (!text) {
    const block = out?.promptFeedback?.blockReason;
    throw new Error(block ? `Request was blocked by Gemini (${block}).` : 'Gemini returned no text.');
  }
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
