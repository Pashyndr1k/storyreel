const { app, BrowserWindow, shell, ipcMain, safeStorage, session, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { comfyRequest } = require('./comfyRequest.cjs');
const { ffmpegVersion, renderJob, cancelActive } = require('./ffmpegRender.cjs');
const { resolveProjectDir, listStrayDirs, deleteDirs } = require('./projectDirs.cjs');

// All ComfyUI traffic goes through the main process — renderer fetches carry
// an Origin header that ComfyUI rejects with HTTP 403.
ipcMain.handle('comfy-request', (_e, opts) => comfyRequest(opts));

// FFmpeg assembly engine: renders the Stage-6 timeline into an H.264 mp4 in
// the main process (native binary), streaming progress back to the renderer.
// Renderer clipboard APIs are focus/permission-sensitive; the main-process
// clipboard always works, so the Copy buttons route through here in the app.
ipcMain.handle('clipboard-write', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('ffmpeg-check', () => ({ version: ffmpegVersion() }));
ipcMain.handle('ffmpeg-cancel', () => cancelActive());
ipcMain.handle('ffmpeg-render', (e, job) =>
  renderJob(job, (p) => {
    try {
      e.sender.send('ffmpeg-progress', p);
    } catch {
      /* window gone */
    }
  })
);

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

// One folder per project id (see projectDirs.cjs): renaming a project renames
// its folder instead of leaving a trail of partial-name copies, because the
// mirror runs once per pause while the title is being typed.
ipcMain.handle('resolve-project-dir', async (_e, { root, projectId, folderName }) => {
  try {
    return { ok: true, dir: resolveProjectDir(root, projectId, folderName) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('list-stray-project-dirs', async (_e, { root, projects }) => {
  try {
    return { ok: true, dirs: listStrayDirs(root, projects) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('delete-project-dirs', async (_e, { root, names }) => ({
  ok: true,
  removed: deleteDirs(root, names),
}));

// Folder picker for the projects / outputs directory settings.
ipcMain.handle('pick-directory', async (e, { current, title } = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: title || 'Choose folder',
      defaultPath: current && fs.existsSync(current) ? current : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    return { ok: true, dir: filePaths[0] };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Reveal a folder in Explorer/Finder (creating it first if needed).
ipcMain.handle('open-directory', async (_e, dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Project ZIP export: ask the user where to put the archive, then write it.
ipcMain.handle('export-zip', async (e, { defaultName, base64 }) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export project',
      defaultPath: defaultName || 'project.zip',
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true, path: filePath };
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
  // Packaged builds take the icon from electron-builder; unpackaged runs
  // (npm run app) pick it up from build/, which ships only in the repo.
  const devIcon = path.join(__dirname, '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    ...(fs.existsSync(devIcon) ? { icon: devIcon } : {}),
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
  // Microphone (voice input): grant media once at the session level so each
  // recording doesn't re-trigger an OS permission prompt. macOS still shows
  // its own one-time system prompt, gated by NSMicrophoneUsageDescription.
  const MEDIA = new Set(['media', 'microphone', 'audioCapture']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(MEDIA.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => MEDIA.has(permission));

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
