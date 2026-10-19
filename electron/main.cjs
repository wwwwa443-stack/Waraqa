const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')

const isDevelopment = !app.isPackaged

// Keep a single app instance; launching it again focuses the existing window.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()

function focusExistingWindow() {
  const [existing] = BrowserWindow.getAllWindows()
  if (!existing) return
  if (existing.isMinimized()) existing.restore()
  existing.focus()
}

app.on('second-instance', focusExistingWindow)

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f7f4',
    icon: path.join(__dirname, '..', 'build', 'waraqa.ico'),
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const sendMaximizeState = () => window.webContents.send('waraqa:window-maximize-state', window.isMaximized())
  window.on('maximize', sendMaximizeState)
  window.on('unmaximize', sendMaximizeState)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('https://') && !url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (isDevelopment) {
    window.loadURL('http://127.0.0.1:5173')
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.on('waraqa:window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on('waraqa:window-toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
})
ipcMain.on('waraqa:window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
ipcMain.handle('waraqa:window-is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)

app.whenReady().then(() => {
  if (!gotTheLock) return
  app.setAppUserModelId('com.waraqa.mindmap')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
