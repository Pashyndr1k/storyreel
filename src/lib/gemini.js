import { dataURLToInline, resizeDataURL } from './images.js';

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
export async function generateImage(settings, { prompt, images = [], aspectRatio }) {
  const key = settings.geminiKey;
  if (!key) throw new Error('NO_GEMINI_KEY');
  const model = settings.geminiModel || DEFAULT_IMAGE_MODEL;

  const parts = [{ text: prompt }];
  for (const img of images) parts.push({ inline_data: dataURLToInline(img) });

  const generationConfig = { responseModalities: ['IMAGE'] };
  if (aspectRatio) generationConfig.imageConfig = { aspectRatio };

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
    throw new Error(detail);
  }

  const data = await res.json();
  const raw = extractImage(data);
  return resizeDataURL(raw, 2_000_000, 0.85); // ~2 megapixels
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
