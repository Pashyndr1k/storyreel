import { CLAUDE_MODELS } from './config.js';
import { enforceNames } from './names.js';
import { withRetry } from './retry.js';
import { generateGeminiText } from './gemini.js';
import { activePolicy, policySystemBlock, refuse } from './policy.js';
import { appLog } from './actionLog.js';

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

// The JSON inside a model's answer: a fenced ```json block when there is
// one, else the first balanced object or array (prose around it, even with
// stray braces, is ignored). A failure is logged with the answer's ends so
// the cause can be read later.
export function extractJSON(text) {
  text = String(text ?? '');
  if (!text.trim()) throw new Error('The model returned an empty answer. Please try again.');
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const bodies = [];
  if (fence && /[{[]/.test(fence[1])) bodies.push(fence[1]);
  bodies.push(text);
  for (const body of bodies) {
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c !== '{' && c !== '[') continue;
      const end = balancedEnd(body, i);
      // an unbalanced candidate is a truncated answer: never accept a
      // fragment from inside it as the whole
      if (end < 0) break;
      try {
        return JSON.parse(body.slice(i, end + 1));
      } catch {
        i = end; // a brace in prose: look past it
      }
    }
  }
  const plain = !/[{[]/.test(text);
  try {
    appLog('text.parseFail', { plain, length: text.length, head: text.slice(0, 240), tail: text.slice(-240) });
  } catch {
    /* logging never breaks generation */
  }
  if (plain) throw new Error('The model answered in plain text instead of the expected data. Please try again.');
  throw new Error('The model returned data that could not be read (incomplete or malformed). Please try again.');
}
// index of the bracket closing the one at `start`, honouring strings; -1 when unbalanced
function balancedEnd(s, start) {
  const stack = [];
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

// Which key the selected text service needs; returns the error code the UI
// already knows ('NO_KEY' / 'NO_GEMINI_KEY') or null when the key is present.
export function textKeyError(settings) {
  const svc = settings.textService || 'claude';
  if (svc === 'gemini') return settings.geminiKey ? null : 'NO_GEMINI_KEY';
  // the local Claude Code CLI needs the desktop app (the main process runs it)
  if (svc === 'claude-cli') return typeof window !== 'undefined' && window.claudeCliBridge ? null : 'NO_CLAUDE_CLI';
  return settings.apiKey ? null : 'NO_KEY';
}

// One request through the installed Claude Code CLI: the user's console
// agent and its subscription instead of an API key. Same spec as the API
// path; the CLI returns the answer text, extractJSON reads it.
async function callClaudeCli(settings, { system, user }) {
  const bridge = typeof window !== 'undefined' ? window.claudeCliBridge : null;
  if (!bridge) throw new Error('NO_CLAUDE_CLI');
  // The console takes text only: a request that attaches reference photos
  // (content blocks) is flattened to its text, and the model is told the
  // photos exist but are not attached — otherwise "[object Object]" went
  // down the pipe and the answer was garbage.
  let text = user;
  if (Array.isArray(user)) {
    const images = user.filter((b) => b?.type === 'image').length;
    text = user.filter((b) => b?.type === 'text').map((b) => b.text).join('\n\n');
    if (images) text = `(${images} reference photo${images > 1 ? 's are' : ' is'} attached in the app but not available to this console session — work from the text; where the task says to match attached photos, follow the written descriptions instead.)\n\n${text}`;
  }
  const res = await bridge.run({ system, user: String(text || ''), model: settings.model || '' });
  if (!res?.ok) {
    const err = new Error(res?.error || 'Claude Code CLI failed.');
    err.status = 0;
    throw err;
  }
  return res.text;
}

// All script/prompt generation funnels through here; the text service setting
// picks the engine (Claude by default, Gemini as the alternative). An optional
// AbortSignal cancels the Claude request mid-flight (and stops retries).
export async function generateJSON(settings, spec, { signal, noPolicy } = {}) {
  // An active content policy rides in the system prompt; the model answers
  // with a policy_refusal object when the request itself conflicts with it.
  const policy = noPolicy ? null : activePolicy(settings);
  if (policy) spec = { ...spec, system: `${spec.system || ''}${policySystemBlock(policy, settings)}` };
  const answer = await withRetry(async () => {
    if (signal?.aborted) {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      throw e;
    }
    const text =
      (settings.textService || 'claude') === 'gemini'
        ? await generateGeminiText(settings, spec)
        : settings.textService === 'claude-cli'
          ? await callClaudeCli(settings, spec)
          : await callClaude(settings, { ...spec, signal });
    const out = extractJSON(text);
    if (policy && out && !Array.isArray(out) && out.policy_refusal) refuse(policy, out.policy_refusal);
    return out;
  });
  // A request that lists the character cards' names gets them enforced on the
  // answer: Cyrillic forms of a name are put back exactly as on the card.
  if (!spec.names?.length) return answer;
  return enforceNames(answer, spec.names, (repair) => generateJSON(settings, repair, { signal, noPolicy: true }));
}
