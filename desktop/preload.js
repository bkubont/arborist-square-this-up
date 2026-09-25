'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('squareDesktop', {
  getSessionToken: () => ipcRenderer.invoke('session:get'),
  setSessionToken: (token) => ipcRenderer.invoke('session:set', token),
  clearSessionToken: () => ipcRenderer.invoke('session:clear'),
  platform: process.platform,
});
