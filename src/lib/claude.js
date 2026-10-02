import { CLAUDE_MODELS } from './config.js';
import { withRetry } from './retry.js';
import { generateGeminiText } from './gemini.js';
import { activePolicy, policySystemBlock, refuse } from './policy.js';

export const MODELS = CLAUDE_MODELS;

// The current Claude models think before they answer, and that thinking is
// billed against max_tokens together with the answer. A spec's maxTokens is
// sized for the JSON alone, so the request adds room for the thinking on top —
// without it the answer is cut off mid-JSON (or never starts) and cannot be
// parsed. Haiku 4.5 does not think by default and rejects the effort setting.
const THINKING_HEADROOM = 12000;
const MAX_OUTPUT_TOKENS = 32000;
const thinks = (model) => !/haiku/i.test(model || '');

async function callClaude(settings, { system, user, maxTokens = 4096, signal }, _retry = false) {
  const model = settings.model;
  const budget = Math.min(MAX_OUTPUT_TOKENS, (_retry ? maxTokens * 2 : maxTokens) + (thinks(model) ? THINKING_HEADROOM * (_retry ? 2 : 1) : 0));
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
      model,
      max_tokens: budget,
      // medium effort: enough thought for story work without spending the
      // budget on reasoning
      ...(thinks(model) ? { output_config: { effort: 'medium' } } : {}),
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
  if (data.stop_reason === 'max_tokens') {
    // cut off at the output limit: one more try with twice the room
    if (!_retry) return callClaude(settings, { system, user, maxTokens, signal }, true);
    // (worded so withRetry does not treat it as transient and repeat the pair)
    throw new Error('The answer was cut off at the output limit before it was complete. Split the task into smaller parts (fewer shots or episodes at once) and run it again.');
  }
  if (data.stop_reason === 'refusal') {
    const why = data.stop_details?.explanation ? ` ${data.stop_details.explanation}` : '';
    throw new Error(`The model declined this request.${why}`);
  }
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function extractJSON(text) {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const candidates = [firstObj, firstArr].filter((i) => i !== -1);
  if (!text.trim()) throw new Error('The model returned an empty answer. Please try again.');
  if (!candidates.length) throw new Error('The model answered in plain text instead of the expected data. Please try again.');
  const start = Math.min(...candidates);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The model returned data that could not be read (incomplete or malformed). Please try again.');
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
export async function generateJSON(settings, spec, { signal, noPolicy } = {}) {
  // An active content policy rides in the system prompt; the model answers
  // with a policy_refusal object when the request itself conflicts with it.
  const policy = noPolicy ? null : activePolicy(settings);
  if (policy) spec = { ...spec, system: `${spec.system || ''}${policySystemBlock(policy, settings)}` };
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
    const out = extractJSON(text);
    if (policy && out && !Array.isArray(out) && out.policy_refusal) refuse(policy, out.policy_refusal);
    return out;
  });
}
