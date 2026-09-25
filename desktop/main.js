'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { getSessionToken, setSessionToken, clearSessionToken } = require('./session-store');

/** Dev: load Vite. Packaged: load built UI from extraResources. */
const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173';

function uiIndexPath() {
  if (isDev) return null;
  return path.join(process.resourcesPath, 'ui', 'index.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Square This Up',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(uiIndexPath());
  }

  return win;
}

app.whenReady().then(() => {
  ipcMain.handle('session:get', () => getSessionToken());
  ipcMain.handle('session:set', (_event, token) => {
    setSessionToken(token);
  });
  ipcMain.handle('session:clear', () => {
    clearSessionToken();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
