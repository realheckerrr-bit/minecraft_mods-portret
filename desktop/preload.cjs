const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modPorter', Object.freeze({
  browseInput: () => ipcRenderer.invoke('browse-input'),
  browseOutput: () => ipcRenderer.invoke('browse-output'),
  versions: (options) => ipcRenderer.invoke('versions', options),
  analyze: (inputPath) => ipcRenderer.invoke('analyze', inputPath),
  port: (request) => ipcRenderer.invoke('port', request),
  verify: (request) => ipcRenderer.invoke('verify', request),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
}));
