export const MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (recommended)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (highest quality)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

async function callClaude(settings, { system, user, maxTokens = 4096 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
    throw new Error(detail);
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

export async function generateJSON(settings, spec) {
  const text = await callClaude(settings, spec);
  return extractJSON(text);
}
