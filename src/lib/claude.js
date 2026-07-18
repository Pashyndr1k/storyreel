import { withRetry } from './retry.js';
import { generateGeminiText } from './gemini.js';

export const MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (recommended)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (highest quality)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

async function callClaude(settings, { system, user, maxTokens = 4096, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message || detail;
    } catch {
      /* keep status text */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function extractJSON(text) {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const candidates = [firstObj, firstArr].filter((i) => i !== -1);
  if (!candidates.length) throw new Error('The model returned an unexpected format. Please try again.');
  const start = Math.min(...candidates);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The model returned an unexpected format. Please try again.');
  }
}

// Which key the selected text service needs; returns the error code the UI
// already knows ('NO_KEY' / 'NO_GEMINI_KEY') or null when the key is present.
export function textKeyError(settings) {
  if ((settings.textService || 'claude') === 'gemini') {
    return settings.geminiKey ? null : 'NO_GEMINI_KEY';
  }
  return settings.apiKey ? null : 'NO_KEY';
}

// All script/prompt generation funnels through here; the text service setting
// picks the engine (Claude by default, Gemini as the alternative). An optional
// AbortSignal cancels the Claude request mid-flight (and stops retries).
export async function generateJSON(settings, spec, { signal } = {}) {
  return withRetry(async () => {
    if (signal?.aborted) {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      throw e;
    }
    const text =
      (settings.textService || 'claude') === 'gemini'
        ? await generateGeminiText(settings, spec)
        : await callClaude(settings, { ...spec, signal });
    return extractJSON(text);
  });
}
