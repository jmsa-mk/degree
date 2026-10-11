const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusAlert', {
  onContent: callback => ipcRenderer.on('alert:content', (_,events)=>callback(events)),
  dismiss: ()=>ipcRenderer.send('alert:dismiss'),
  open: ()=>ipcRenderer.send('alert:open'),
  soundFallback: ()=>ipcRenderer.send('alert:sound-fallback'),
});
