// User-action logs. Two places:
//  - the APP log: a file on disk (<userData>/logs/app.log, one JSON line per
//    entry) for app-level actions — projects created / deleted / imported,
//    styles created / deleted, settings changed, undo / redo, agent calls;
//  - the PROJECT log: project.actionLog, saved inside the project itself (and
//    so inside its project.md), for what was done to that project — every
//    content change, by the user or by the agent, with the fields it touched.
import { agentActive } from './agent/registry.js';

export const MAX_PROJECT_LOG = 400;
const COALESCE_MS = 5000;

const by = () => (agentActive() ? 'agent' : 'user');

// ---- app log (desktop app: file; browser: console only)
export function appLog(action, details = {}) {
  const entry = { t: Date.now(), by: by(), action, ...(details && Object.keys(details).length ? { details } : {}) };
  try {
    if (window.appLog?.append) window.appLog.append(entry);
    else if (import.meta.env?.DEV) console.debug('[app-log]', entry);
  } catch {
    /* logging never breaks the app */
  }
}

// Settings changes without secrets: a key field is logged as set / cleared.
const SECRET = /key$/i;
export function settingsDiff(before, after) {
  const out = {};
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[k] = SECRET.test(k) ? (b ? 'set' : 'cleared') : typeof b === 'object' ? 'changed' : b;
  }
  return out;
}

// ---- project log
// What a patch touched, as a short list of field names (sub-keys for the
// per-shot maps are not listed — the entry says which map changed).
const SKIP = new Set(['actionLog', 'updatedAt', 'stale']);
export const patchKeys = (patch) => Object.keys(patch || {}).filter((k) => !SKIP.has(k));

// The project with an entry appended (or the last entry extended when the
// same actor touched the same fields within a few seconds — typing).
export function withLogEntry(project, { action = 'edit', keys = [], note = '', by: who = by() } = {}) {
  const log = Array.isArray(project.actionLog) ? project.actionLog : [];
  const last = log[log.length - 1];
  const t = Date.now();
  if (last && last.action === action && last.by === who && !note && !last.note && t - last.t < COALESCE_MS && sameKeys(last.keys, keys)) {
    return [...log.slice(0, -1), { ...last, t, n: (last.n || 1) + 1 }];
  }
  const entry = { t, by: who, action, ...(keys.length ? { keys } : {}), ...(note ? { note } : {}) };
  return [...log, entry].slice(-MAX_PROJECT_LOG);
}
const sameKeys = (a = [], b = []) => a.length === b.length && a.every((k, i) => k === b[i]);

// A patch that also records itself: use for explicit, named actions.
export const logged = (patch, action, note = '') => (p) => {
  const body = typeof patch === 'function' ? patch(p) : patch;
  return { ...body, actionLog: withLogEntry(p, { action, keys: patchKeys(body), note }) };
};
