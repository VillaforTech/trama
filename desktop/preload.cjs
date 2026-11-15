const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => {
    if (typeof value === 'string') callback(value);
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld(
  'tramaDesktop',
  Object.freeze({
    platform: process.platform,
    selectFolder: () => ipcRenderer.invoke('trama:select-folder'),
    openExternal: (url) => ipcRenderer.invoke('trama:open-external', url),
    onOpenFolder: (callback) => subscribe('trama:open-folder', callback),
    onNavigate: (callback) => subscribe('trama:navigate', callback),
  }),
);
