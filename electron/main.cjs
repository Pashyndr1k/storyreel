const { app, BrowserWindow, shell, ipcMain, safeStorage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { comfyRequest } = require('./comfyRequest.cjs');

// All ComfyUI traffic goes through the main process — renderer fetches carry
// an Origin header that ComfyUI rejects with HTTP 403.
ipcMain.handle('comfy-request', (_e, opts) => comfyRequest(opts));

// Write a generated ComfyUI result (video/image, base64) into a local folder
// chosen in the app settings (default D:\Claude work\ComfyUI\Output).
ipcMain.handle('save-output', async (_e, { dir, filename, base64 }) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(filename).replace(/[\\/:*?"<>|]/g, '_');
    const target = path.join(dir, safe);
    fs.writeFileSync(target, Buffer.from(base64, 'base64'));
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// safeStorage bridge: encrypt API keys at rest with the OS keychain/DPAPI.
ipcMain.on('secure-available', (e) => {
  try {
    e.returnValue = safeStorage.isEncryptionAvailable();
  } catch {
    e.returnValue = false;
  }
});
ipcMain.on('secure-encrypt', (e, text) => {
  try {
    e.returnValue = safeStorage.encryptString(String(text)).toString('base64');
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('secure-decrypt', (e, b64) => {
  try {
    e.returnValue = safeStorage.decryptString(Buffer.from(String(b64), 'base64'));
  } catch {
    e.returnValue = null;
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.env.VITE_DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// The local ComfyUI server rejects requests carrying a foreign Origin and
// sends no CORS headers. For loopback requests only: strip the Origin on the
// way out and inject permissive CORS headers on the way back, so the renderer
// can talk to ComfyUI directly. Remote APIs (Anthropic/Gemini) are untouched.
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i;
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    if (LOOPBACK.test(details.url)) {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'origin') delete headers[k];
      }
    }
    cb({ requestHeaders: headers });
  });
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    const headers = details.responseHeaders || {};
    if (LOOPBACK.test(details.url)) {
      headers['access-control-allow-origin'] = ['*'];
      headers['access-control-allow-headers'] = ['*'];
      headers['access-control-allow-methods'] = ['GET,POST,OPTIONS'];
    }
    cb({ responseHeaders: headers });
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
