// Agent control: the registry through which mounted parts of the UI expose
// their actions to the agent API (lib/agent/api.js).
//
// The app's generation logic lives in its React components (the same code the
// buttons run), so the agent drives the app the way a user would: it opens a
// project, moves to a stage, and calls the actions that stage registered here.
// A scope is one mounted owner ('app', 'project', 'stage1' … 'stage4', 'bench'
// = the Stage 5 shot workbench, 'assembly' = the Stage 5 timeline). The scope's
// value is a ref refreshed on every render, so actions never run on stale
// closures.
import { useEffect, useRef } from 'react';

const scopes = new Map(); // scope -> ref ({ current: actions })

export function useAgentScope(scope, actions) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    scopes.set(scope, ref);
    return () => {
      if (scopes.get(scope) === ref) scopes.delete(scope);
    };
  }, [scope]);
}

export const agentScope = (scope) => scopes.get(scope)?.current || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until a scope is mounted (and, optionally, satisfies `pred`).
export async function waitScope(scope, pred = null, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const s = agentScope(scope);
    if (s && (!pred || pred(s))) return s;
    if (Date.now() - t0 > ms) return null;
    await sleep(50);
  }
}

// ---- agent mode: while an agent call runs, the app must never stop on a
// native confirm()/alert() waiting for a human. main.jsx routes both through
// these: confirm answers yes, alert is recorded as the call's message.
let depth = 0;
let alerts = [];
export const agentActive = () => depth > 0;
export const agentAlert = (message) => alerts.push(String(message ?? ''));
export async function inAgentCall(fn) {
  depth++;
  if (depth === 1) alerts = [];
  try {
    return await fn();
  } finally {
    depth--;
  }
}
export const takeAgentAlerts = () => {
  const out = alerts;
  alerts = [];
  return out;
};
