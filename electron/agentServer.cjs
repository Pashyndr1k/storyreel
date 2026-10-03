// Local agent API: a small HTTP server on the loopback interface through which
// an AI agent (Claude Code via agent/storyreel-mcp.mjs, or any HTTP client)
// operates StoryReel. The tools themselves live in the renderer
// (src/lib/agent/api.js); this server only authenticates a request and relays
// it to the page over IPC.
//
// Security: off until the user enables it in Settings; listens on 127.0.0.1
// only; every request needs the bearer token from <userData>/agent.json; the
// Host header must be a loopback name (blocks DNS-rebinding from a web page).
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CALL_TIMEOUT_MS = 75 * 60 * 1000; // a video job may run for an hour
const MAX_BODY = 2 * 1024 * 1024;

function createAgentServer({ app, ipcMain, getWindow }) {
  const file = path.join(app.getPath('userData'), 'agent.json');
  let token = '';
  try {
    token = JSON.parse(fs.readFileSync(file, 'utf8')).token || '';
  } catch {
    /* first run */
  }
  if (!/^[a-f0-9]{48}$/.test(token)) token = crypto.randomBytes(24).toString('hex');

  let server = null;
  let port = 0;
  let lastError = '';
  const pending = new Map();
  let seq = 0;

  const mcpScript = app.isPackaged
    ? path.join(process.resourcesPath, 'agent', 'storyreel-mcp.mjs')
    : path.join(__dirname, '..', 'agent', 'storyreel-mcp.mjs');

  const info = () => ({ running: !!server, port, url: server ? `http://127.0.0.1:${port}` : '', token, file, mcpScript, error: lastError });
  const persist = () => {
    try {
      fs.writeFileSync(file, JSON.stringify({ token, port, url: server ? `http://127.0.0.1:${port}` : '', running: !!server }, null, 2));
    } catch {
      /* best-effort: the Settings page shows the same values */
    }
  };

  ipcMain.on('agent-result', (_e, { id, payload } = {}) => {
    const done = pending.get(id);
    if (done) {
      pending.delete(id);
      done(payload);
    }
  });

  function callPage(method, params) {
    const win = getWindow();
    if (!win || win.isDestroyed()) return Promise.resolve({ ok: false, error: { code: 'APP_NOT_READY', message: 'The StoryReel window is not open.' } });
    const id = ++seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: { code: 'TIMEOUT', message: 'StoryReel did not answer in time.' } });
      }, CALL_TIMEOUT_MS);
      pending.set(id, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      win.webContents.send('agent-call', { id, method, params });
    });
  }

  const send = (res, status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
    res.end(text);
  };
  const authorized = (req) => {
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(got);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const loopbackHost = (req) => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(req.headers.host || ''));

  async function handle(req, res) {
    if (!loopbackHost(req)) return send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Loopback requests only.' } });
    // a browser page must never drive the app: no CORS headers are sent, and a
    // request that carries an Origin is refused outright
    if (req.headers.origin) return send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Browser requests are not accepted.' } });
    if (!authorized(req)) return send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or wrong bearer token.' } });
    const url = String(req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true, result: { name: 'StoryReel', version: app.getVersion() } });
    if (req.method === 'GET' && url === '/tools') return send(res, 200, await callPage('__tools', {}));
    if (req.method === 'POST' && url === '/call') {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return send(res, 413, { ok: false, error: { code: 'TOO_LARGE', message: 'Request body too large.' } });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return send(res, 400, { ok: false, error: { code: 'BAD_JSON', message: 'The body is not valid JSON.' } });
      }
      if (typeof body.method !== 'string') return send(res, 400, { ok: false, error: { code: 'BAD_INPUT', message: 'Expected { "method": "...", "params": { ... } }.' } });
      return send(res, 200, await callPage(body.method, body.params && typeof body.params === 'object' ? body.params : {}));
    }
    return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Routes: GET /health, GET /tools, POST /call.' } });
  }

  function stop() {
    if (server) {
      server.close();
      server = null;
      port = 0;
    }
    persist();
  }

  function configure({ enabled, port: want } = {}) {
    const p = Math.max(1024, Math.min(65535, Math.round(Number(want) || 47821)));
    if (!enabled) {
      lastError = '';
      stop();
      return Promise.resolve(info());
    }
    if (server && port === p) return Promise.resolve(info());
    stop();
    return new Promise((resolve) => {
      const s = http.createServer((req, res) => {
        handle(req, res).catch((e) => send(res, 500, { ok: false, error: { code: 'ERROR', message: String(e && e.message ? e.message : e) } }));
      });
      s.once('error', (e) => {
        lastError = e.code === 'EADDRINUSE' ? `Port ${p} is already in use.` : String(e.message || e);
        server = null;
        port = 0;
        persist();
        resolve(info());
      });
      s.listen(p, '127.0.0.1', () => {
        server = s;
        port = p;
        lastError = '';
        persist();
        resolve(info());
      });
    });
  }

  ipcMain.handle('agent-configure', (_e, cfg) => configure(cfg));
  ipcMain.handle('agent-info', () => info());
  app.on('before-quit', stop);
  return { configure, info, stop };
}

module.exports = { createAgentServer };
