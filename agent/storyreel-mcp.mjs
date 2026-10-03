#!/usr/bin/env node
// StoryReel MCP server: lets an MCP client (Claude Code, Claude Desktop, …)
// operate the StoryReel desktop app. It is a thin stdio bridge — the tools are
// defined by the running app and fetched from it, so this file never needs to
// change when the app gains a tool.
//
// The app must be open with "Agent access" enabled (Settings → Interface).
// Connection details are read from, in order:
//   STORYREEL_AGENT_URL + STORYREEL_AGENT_TOKEN   (environment)
//   STORYREEL_AGENT_FILE                          (path to the app's agent.json)
//   the app's default agent.json for this OS
//
// Claude Code:  claude mcp add storyreel -- node "<path to this file>"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL = '2024-11-05';

function defaultFile() {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'StoryReel', 'agent.json');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'StoryReel', 'agent.json');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'StoryReel', 'agent.json');
}

// Read on every call: the app may be started, or the port changed, later.
function connection() {
  if (process.env.STORYREEL_AGENT_URL && process.env.STORYREEL_AGENT_TOKEN) {
    return { url: process.env.STORYREEL_AGENT_URL.replace(/\/+$/, ''), token: process.env.STORYREEL_AGENT_TOKEN };
  }
  const file = process.env.STORYREEL_AGENT_FILE || defaultFile();
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cfg.url && cfg.token) return { url: cfg.url, token: cfg.token };
    return { error: 'StoryReel is not accepting agent connections. Open the app and turn on Settings → Interface → Agent access.' };
  } catch {
    return { error: `StoryReel's connection file was not found (${file}). Open the app and turn on Settings → Interface → Agent access.` };
  }
}

async function http(method, route, body) {
  const c = connection();
  if (c.error) return { ok: false, error: { code: 'NOT_CONNECTED', message: c.error } };
  try {
    const res = await fetch(`${c.url}${route}`, {
      method,
      headers: { authorization: `Bearer ${c.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: { code: 'NOT_CONNECTED', message: `StoryReel did not answer at ${c.url} (${e.cause?.code || e.message}). Is the app open with Agent access on?` } };
  }
}

const OFFLINE_TOOL = {
  name: 'storyreel_status',
  description: 'StoryReel is not connected yet. Call this to see what is needed (the desktop app must be open with Agent access enabled), then ask for the tool list again.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

async function listTools() {
  const res = await http('GET', '/tools');
  return res.ok && Array.isArray(res.result) ? res.result : [OFFLINE_TOOL];
}

// Images inside a result ({ label, dataURL }) become MCP image blocks, each
// preceded by its label, so the model sees them instead of reading base64.
function toContent(result) {
  const images = Array.isArray(result?.images) ? result.images : [];
  const rest = images.length ? { ...result, images: images.map((x, i) => `[image ${i + 1}] ${x.label}`) } : result;
  const content = [{ type: 'text', text: JSON.stringify(rest, null, 2) }];
  images.forEach((img, i) => {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(img.dataURL || '');
    if (!m) return;
    content.push({ type: 'text', text: `[image ${i + 1}] ${img.label}` });
    content.push({ type: 'image', mimeType: m[1], data: m[2] });
  });
  return content;
}

async function callTool(name, args) {
  const res = await http('POST', '/call', { method: name, params: args || {} });
  if (res.ok) return { content: toContent(res.result) };
  return { isError: true, content: [{ type: 'text', text: `${res.error?.code || 'ERROR'}: ${res.error?.message || 'The call failed.'}` }] };
}

const write = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

async function onMessage(msg) {
  const { id, method, params } = msg;
  const reply = (result) => id !== undefined && write({ jsonrpc: '2.0', id, result });
  const error = (code, message) => id !== undefined && write({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      return reply({
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'storyreel', version: '1.0.0' },
        instructions: 'Operates the StoryReel desktop app. Call storyreel_guide first; it explains the pipeline, the checks to run and the four-attempt rule.',
      });
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: await listTools() });
    if (method === 'tools/call') return reply(await callTool(params?.name, params?.arguments));
    if (typeof method === 'string' && method.startsWith('notifications/')) return undefined;
    return error(-32601, `Method not found: ${method}`);
  } catch (e) {
    return error(-32603, String(e?.message || e));
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (Array.isArray(msg)) msg.forEach(onMessage);
  else onMessage(msg);
});
rl.on('close', () => process.exit(0));
