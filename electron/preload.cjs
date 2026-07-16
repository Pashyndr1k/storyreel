const { contextBridge, ipcRenderer } = require('electron');

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
});

// ComfyUI requests via the main process (no CORS/Origin restrictions there).
contextBridge.exposeInMainWorld('comfyBridge', {
  request: (opts) => ipcRenderer.invoke('comfy-request', opts),
});

// FFmpeg timeline rendering in the main process.
contextBridge.exposeInMainWorld('ffmpegBridge', {
  check: () => ipcRenderer.invoke('ffmpeg-check'),
  render: (job) => ipcRenderer.invoke('ffmpeg-render', job),
  onProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('ffmpeg-progress', handler);
    return () => ipcRenderer.removeListener('ffmpeg-progress', handler);
  },
});
