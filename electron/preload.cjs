const { contextBridge, ipcRenderer } = require('electron');

// OS folders the renderer's defaults are built from (read once at startup).
contextBridge.exposeInMainWorld('appPaths', ipcRenderer.sendSync('app-paths'));

// Synchronous bridge to safeStorage in the main process. Payloads are two short
// API-key strings read once at startup, so sendSync is fine here.
contextBridge.exposeInMainWorld('secureStore', {
  available: () => ipcRenderer.sendSync('secure-available'),
  encrypt: (text) => ipcRenderer.sendSync('secure-encrypt', text),
  decrypt: (b64) => ipcRenderer.sendSync('secure-decrypt', b64),
});

// Save generated ComfyUI results (base64 bytes) to a local folder.
contextBridge.exposeInMainWorld('localFiles', {
  saveOutput: (dir, filename, base64) => ipcRenderer.invoke('save-output', { dir, filename, base64 }),
  exportZip: (defaultName, base64) => ipcRenderer.invoke('export-zip', { defaultName, base64 }),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard-write', text),
  resolveProjectDir: (root, projectId, folderName) =>
    ipcRenderer.invoke('resolve-project-dir', { root, projectId, folderName }),
  listStrayProjectDirs: (root, projects) => ipcRenderer.invoke('list-stray-project-dirs', { root, projects }),
  deleteProjectDirs: (root, names) => ipcRenderer.invoke('delete-project-dirs', { root, names }),
  pickDirectory: (current, title) => ipcRenderer.invoke('pick-directory', { current, title }),
  openDirectory: (dir) => ipcRenderer.invoke('open-directory', dir),
});

// ComfyUI requests via the main process (no CORS/Origin restrictions there).
contextBridge.exposeInMainWorld('comfyBridge', {
  request: (opts) => ipcRenderer.invoke('comfy-request', opts),
});

// alert() / confirm() shown by the main process, so the page keeps keyboard
// focus afterwards (see 'dialog-message' in main.cjs).
contextBridge.exposeInMainWorld('nativeDialogs', {
  alert: (message, ok) => ipcRenderer.sendSync('dialog-message', { kind: 'alert', message, ok }),
  confirm: (message, ok, cancel) => ipcRenderer.sendSync('dialog-message', { kind: 'confirm', message, ok, cancel }),
});

// Cloud APIs that send no CORS headers (Kling) via the main process.
contextBridge.exposeInMainWorld('netBridge', {
  request: (opts) => ipcRenderer.invoke('net-request', opts),
});

// FFmpeg timeline rendering in the main process.
contextBridge.exposeInMainWorld('ffmpegBridge', {
  check: () => ipcRenderer.invoke('ffmpeg-check'),
  render: (job) => ipcRenderer.invoke('ffmpeg-render', job),
  cancel: () => ipcRenderer.invoke('ffmpeg-cancel'),
  onProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('ffmpeg-progress', handler);
    return () => ipcRenderer.removeListener('ffmpeg-progress', handler);
  },
});

// AI agent access: the main process runs a local server (agentServer.cjs) and
// relays each call here; the page answers with the tool's result.
contextBridge.exposeInMainWorld('agentBridge', {
  onCall: (cb) => {
    const handler = async (_e, { id, method, params }) => {
      let payload;
      try {
        payload = await cb(method, params);
      } catch (e) {
        payload = { ok: false, error: { code: 'ERROR', message: String(e && e.message ? e.message : e) } };
      }
      ipcRenderer.send('agent-result', { id, payload });
    };
    ipcRenderer.on('agent-call', handler);
    return () => ipcRenderer.removeListener('agent-call', handler);
  },
  configure: (cfg) => ipcRenderer.invoke('agent-configure', cfg),
  info: () => ipcRenderer.invoke('agent-info'),
});
