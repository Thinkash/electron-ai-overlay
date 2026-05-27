const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (messages) => ipcRenderer.send('chat-request', messages),
  onChunk: (callback) => ipcRenderer.on('chat-chunk', (_event, chunk) => callback(chunk)),
  onDone: (callback) => ipcRenderer.on('chat-done', () => callback()),
  onError: (callback) => ipcRenderer.on('chat-error', (_event, msg) => callback(msg)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('chat-chunk');
    ipcRenderer.removeAllListeners('chat-done');
    ipcRenderer.removeAllListeners('chat-error');
  },
  setOpacity: (value) => ipcRenderer.send('set-opacity', value),
  minimize: () => ipcRenderer.send('minimize-window'),
  close: () => ipcRenderer.send('close-window'),
});
