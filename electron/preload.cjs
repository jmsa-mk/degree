const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("degreebee", {
  support: (action,input) => ipcRenderer.invoke('support:request',action,input),
  accountAuth: (kind,input) => ipcRenderer.invoke('account:auth',kind,input),
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  accountSync: () => ipcRenderer.invoke('account:sync'),
  accountRefresh: () => ipcRenderer.invoke('account:refresh'),
  accountDemoActivate: () => ipcRenderer.invoke('account:demo-activate'),
  accountVisibility: (value) => ipcRenderer.invoke('account:visibility',value),
  accountPassword: (input) => ipcRenderer.invoke('account:password',input),
  accountDelete: (password) => ipcRenderer.invoke('account:delete',password),
  state: () => ipcRenderer.invoke("focus:state"),
  settings: (patch) => ipcRenderer.invoke("focus:settings", patch),
  copySummary: (text) => ipcRenderer.invoke("focus:copy-summary", text),
  start: (title) => ipcRenderer.invoke("focus:start", title),
  pause: () => ipcRenderer.invoke("focus:pause"),
  resume: () => ipcRenderer.invoke("focus:resume"),
  finish: () => ipcRenderer.invoke("focus:finish"),
  discard: (id) => ipcRenderer.invoke("focus:discard", id),
  observation: (value) => ipcRenderer.send("focus:observation", value),
  history: () => ipcRenderer.invoke("focus:history"),
  exportReport: (format, id) => ipcRenderer.invoke("focus:export", format, id),
  openFolder: () => ipcRenderer.invoke("focus:folder"),
  compact: (value) => ipcRenderer.invoke("focus:compact", value),
  onUpdate: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on("focus:update", listener);
    return () => ipcRenderer.removeListener("focus:update", listener);
  },
});
