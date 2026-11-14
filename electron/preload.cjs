const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('waraqaWindow', {
  minimize: () => ipcRenderer.send('waraqa:window-minimize'),
  toggleMaximize: () => ipcRenderer.send('waraqa:window-toggle-maximize'),
  close: () => ipcRenderer.send('waraqa:window-close'),
  isMaximized: () => ipcRenderer.invoke('waraqa:window-is-maximized'),
  exportWorkspace: (workspace) => ipcRenderer.invoke('waraqa:workspace-export', workspace),
  getProjectsFolder: () => ipcRenderer.invoke('waraqa:projects-folder-get'),
  chooseProjectsFolder: (language) => ipcRenderer.invoke('waraqa:projects-folder-choose', language),
  readProjectFolders: () => ipcRenderer.invoke('waraqa:projects-folder-read'),
  saveWorkspaceFolder: (workspaceId, archive) => ipcRenderer.invoke('waraqa:workspace-folder-save', { workspaceId, archive }),
  removeWorkspaceFolder: (workspaceId) => ipcRenderer.invoke('waraqa:workspace-folder-remove', workspaceId),
  revealNoteAttachment: (attachment) => ipcRenderer.invoke('waraqa:reveal-note-attachment', attachment),
  openExternalLink: (url) => ipcRenderer.invoke('waraqa:open-external-link', url),
  onMaximizeChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized)
    ipcRenderer.on('waraqa:window-maximize-state', listener)
    return () => ipcRenderer.removeListener('waraqa:window-maximize-state', listener)
  },
})
