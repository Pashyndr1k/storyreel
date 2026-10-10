// Text generation through the locally installed Claude Code CLI (the user's
// console agent and its subscription) instead of an API key: one headless
// `claude -p` run per request. Nothing of Claude Code's own context is loaded
// (--bare, our system prompt only, no tools), so the call costs exactly the
// prompt and the answer. Kept free of electron imports.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIN = process.platform === 'win32';
const CLI = WIN ? 'claude.cmd' : 'claude';

// `claude --version` → { ok, version } (or the error)
function claudeCliCheck() {
  return new Promise((resolve) => {
    execFile(CLI, ['--version'], { shell: WIN, timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: String(stderr || err.message || err).trim().slice(0, 300) });
      resolve({ ok: true, version: String(stdout || '').trim().split('\n')[0] });
    });
  });
}

// One request: { system, user, model, maxTokens, timeoutMs } → { ok, text }
// or { ok: false, error }. The system prompt travels in a temp file (it is
// long), the user prompt on stdin.
function claudeCliRun({ system = '', user = '', model = '', timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyreel-cli-'));
    const sysFile = path.join(dir, 'system.txt');
    fs.writeFileSync(sysFile, String(system || 'You answer with valid JSON only.'), 'utf8');
    // no --bare: it would also drop the stored Claude login (the subscription).
    // What keeps the context small instead: our own system prompt, no tools,
    // no MCP servers (an empty strict config), no user / project settings
    // (plugins, hooks, skills), and the temp dir as cwd (no project CLAUDE.md).
    const mcpFile = path.join(dir, 'mcp.json');
    fs.writeFileSync(mcpFile, '{"mcpServers":{}}', 'utf8');
    const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--max-turns', '1', '--tools', '', '--system-prompt-file', sysFile, '--mcp-config', mcpFile, '--strict-mcp-config', '--setting-sources', 'project'];
    if (model) args.push('--model', model);
    let out = '';
    let errText = '';
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* temp */
      }
      resolve(res);
    };
    let child;
    try {
      // This mode is the console login (the subscription). An ANTHROPIC_API_KEY
      // / AUTH_TOKEN in the user's environment would make the CLI bill (or
      // fail on) that key instead, so the child never sees them.
      const env = { ...process.env, CLAUDECODE: '' };
      for (const k of Object.keys(env)) if (/^ANTHROPIC_(API_KEY|AUTH_TOKEN)$/i.test(k)) delete env[k];
      child = spawn(CLI, args, { cwd: dir, shell: WIN, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return finish({ ok: false, error: `Claude Code CLI could not be started: ${e.message}` });
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* gone */
      }
      finish({ ok: false, error: `Claude Code CLI did not answer within ${Math.round(timeoutMs / 60000)} minutes.` });
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (errText += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      finish({ ok: false, error: `Claude Code CLI could not be started (${e.message}). Is "claude" installed and on PATH?` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let data = null;
      try {
        // the JSON result is the last JSON object on stdout
        const i = out.lastIndexOf('\n{');
        data = JSON.parse(i >= 0 ? out.slice(i + 1) : out);
      } catch {
        /* not JSON */
      }
      if (data && typeof data.result === 'string' && !data.is_error) return finish({ ok: true, text: data.result, usage: data.usage || null, cost: data.total_cost_usd ?? null, model: Object.keys(data.modelUsage || {})[0] || model || null });
      let msg = String((data && (data.result || data.error)) || errText.trim() || out.trim() || `exit code ${code}`).slice(0, 600);
      // the CLI took a key from an apiKeyHelper / its own settings and it was refused
      if (/invalid api key|external api key/i.test(msg)) msg += ' — the console used an API key of its own instead of the login. In a terminal run "claude", then /login, and remove any apiKeyHelper from ~/.claude/settings.json.';
      else if (/not logged in|login/i.test(msg) && !/valid/i.test(msg)) msg += ' — in a terminal run "claude" and /login once.';
      finish({ ok: false, error: `Claude Code CLI: ${msg}` });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(String(user || ''), 'utf8');
  });
}

module.exports = { claudeCliCheck, claudeCliRun };
