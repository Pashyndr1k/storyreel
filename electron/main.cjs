const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
