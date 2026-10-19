const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('waraqaWindow', {
  minimize: () => ipcRenderer.send('waraqa:window-minimize'),
  toggleMaximize: () => ipcRenderer.send('waraqa:window-toggle-maximize'),
  close: () => ipcRenderer.send('waraqa:window-close'),
  isMaximized: () => ipcRenderer.invoke('waraqa:window-is-maximized'),
  onMaximizeChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized)
    ipcRenderer.on('waraqa:window-maximize-state', listener)
    return () => ipcRenderer.removeListener('waraqa:window-maximize-state', listener)
  },
})
