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
