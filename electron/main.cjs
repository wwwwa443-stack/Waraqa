const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const isDevelopment = !app.isPackaged
const projectFolderConfigPath = () => path.join(app.getPath('userData'), 'projects-folder.json')

async function currentProjectsFolder() {
  try {
    const config = JSON.parse(await fs.readFile(projectFolderConfigPath(), 'utf8'))
    if (typeof config.path === 'string') return config.path
  } catch {}
  return ''
}

function safeSegment(value, fallback = 'project') {
  return String(value || '')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80) || fallback
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'workspace'
}

function readStoredZipEntries(buffer) {
  const bytes = Buffer.from(buffer)
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff)
  let endOffset = -1
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break }
  }
  if (endOffset < 0) throw new Error('Invalid project folder archive.')
  const count = bytes.readUInt16LE(endOffset + 10)
  let cursor = bytes.readUInt32LE(endOffset + 16)
  const entries = new Map()
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid project folder directory.')
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    if (method !== 0 || !(flags & 0x0800)) throw new Error('Unsupported project folder entry.')
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/')
    const localNameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtraLength = bytes.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const normalized = path.posix.normalize(name)
    if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) throw new Error('Unsafe project folder path.')
    entries.set(normalized, bytes.subarray(dataOffset, dataOffset + compressedSize))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function findWorkspaceFolder(root, workspaceId) {
  if (!root || !workspaceId) return null
  let entries
  try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return null }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.waraqa-')) continue
    const folder = path.join(root, entry.name)
    let manifest = null
    let project = null
    try {
      manifest = JSON.parse(await fs.readFile(path.join(folder, 'assets', 'manifest.json'), 'utf8'))
    } catch {}
    try { project = JSON.parse(await fs.readFile(path.join(folder, 'project.json'), 'utf8')) } catch {}
    if (manifest?.workspaceId === workspaceId || project?.workspace?.id === workspaceId) return { folder, manifest: manifest || {} }
  }
  return null
}

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
ipcMain.handle('waraqa:projects-folder-get', currentProjectsFolder)
ipcMain.handle('waraqa:projects-folder-choose', async (event, language) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  const current = await currentProjectsFolder()
  const result = await dialog.showOpenDialog(window, {
    title: language === 'en' ? 'Choose where Waraqa projects are stored' : 'اختر مكان حفظ مشاريع ورقة',
    defaultPath: current || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return ''
  const folder = path.resolve(result.filePaths[0])
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(projectFolderConfigPath(), `${JSON.stringify({ path: folder }, null, 2)}\n`, 'utf8')
  return folder
})
ipcMain.handle('waraqa:projects-folder-read', async () => {
  const root = await currentProjectsFolder()
  if (!root) return []
  let entries
  try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return [] }
  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.waraqa-')) continue
    const folder = path.join(root, entry.name)
    try {
      let bundle
      try { bundle = JSON.parse(await fs.readFile(path.join(folder, 'project.json'), 'utf8')) }
      catch { bundle = JSON.parse(await fs.readFile(path.join(folder, 'workspace.json'), 'utf8')) }
      if (bundle.format !== 'waraqa-workspace' || bundle.formatVersion !== 1 || !bundle.workspace?.id) continue
      const manifest = JSON.parse(await fs.readFile(path.join(folder, 'assets', 'manifest.json'), 'utf8').catch(() => '{"attachments":[]}'))
      const attachments = []
      for (const attachment of manifest.attachments || []) {
        const filePath = path.resolve(folder, ...String(attachment.path || '').replace(/\\/g, '/').split('/'))
        if (!filePath.startsWith(`${path.join(folder, 'assets')}${path.sep}`)) continue
        try { attachments.push({ id: attachment.id, name: attachment.name, type: attachment.type, data: new Uint8Array(await fs.readFile(filePath)) }) } catch {}
      }
      projects.push({ bundle, attachments })
    } catch {}
  }
  return projects
})
ipcMain.handle('waraqa:workspace-folder-remove', async (_event, workspaceId) => {
  if (typeof workspaceId !== 'string') throw new TypeError('Invalid workspace id.')
  const root = await currentProjectsFolder()
  const workspace = await findWorkspaceFolder(root, workspaceId)
  if (!workspace) return false
  const folder = path.resolve(workspace.folder)
  if (path.dirname(folder) !== path.resolve(root)) throw new Error('Refusing to remove a folder outside the projects root.')
  await fs.rm(folder, { recursive: true, force: true })
  return true
})
ipcMain.handle('waraqa:workspace-folder-save', async (_event, request) => {
  if (!request || !(request.archive instanceof ArrayBuffer) || typeof request.workspaceId !== 'string') {
    throw new TypeError('Invalid project folder data.')
  }
  const root = await currentProjectsFolder()
  if (!root) throw new Error('Choose a projects folder first.')
  const entries = readStoredZipEntries(request.archive)
  const projectBytes = entries.get('project.json')
  if (!projectBytes) throw new Error('Project data is missing from the folder archive.')
  const bundle = JSON.parse(projectBytes.toString('utf8'))
  if (bundle.format !== 'waraqa-workspace' || bundle.workspace?.id !== request.workspaceId) {
    throw new TypeError('The project folder data does not match the workspace.')
  }
  const folderName = `${safeSegment(bundle.workspace.title, 'مشروع')}-${safeId(bundle.workspace.id).slice(0, 8)}`
  const target = path.join(root, folderName)
  const staging = path.join(root, `.waraqa-sync-${safeId(bundle.workspace.id)}`)
  const previous = path.join(root, `.waraqa-old-${safeId(bundle.workspace.id)}`)
  const rootPath = path.resolve(root)
  for (const candidate of [target, staging, previous]) {
    if (path.dirname(path.resolve(candidate)) !== rootPath) throw new Error('Invalid project folder destination.')
  }
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })
  for (const [entryName, content] of entries) {
    const destination = path.resolve(staging, ...entryName.split('/'))
    if (destination !== staging && !destination.startsWith(`${staging}${path.sep}`)) throw new Error('Unsafe project folder entry.')
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, content)
  }
  await fs.writeFile(path.join(staging, 'workspace.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
  const assetManifestPath = path.join(staging, 'assets', 'manifest.json')
  const assetManifest = JSON.parse(await fs.readFile(assetManifestPath, 'utf8'))
  await fs.writeFile(assetManifestPath, `${JSON.stringify({ ...assetManifest, workspaceId: bundle.workspace.id }, null, 2)}\n`, 'utf8')
  await fs.rm(previous, { recursive: true, force: true })
  try { await fs.rename(target, previous) } catch (error) { if (error.code !== 'ENOENT') throw error }
  try {
    await fs.rename(staging, target)
    await fs.rm(previous, { recursive: true, force: true })
  } catch (error) {
    try { await fs.rename(previous, target) } catch {}
    throw error
  }
  const rootEntries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.waraqa-')) continue
    const candidate = path.join(root, entry.name)
    if (path.resolve(candidate) === path.resolve(target)) continue
    const projectPath = path.join(candidate, 'project.json')
    try {
      const existing = JSON.parse(await fs.readFile(projectPath, 'utf8'))
      if (existing.workspace?.id === bundle.workspace.id && path.dirname(path.resolve(candidate)) === rootPath) {
        await fs.rm(candidate, { recursive: true, force: true })
      }
    } catch {}
  }
  return target
})
ipcMain.handle('waraqa:reveal-note-attachment', async (_event, attachment) => {
  if (!attachment || typeof attachment.name !== 'string') {
    throw new TypeError('Invalid note attachment.')
  }
  if (typeof attachment.workspaceId === 'string' && typeof attachment.fileId === 'string') {
    const root = await currentProjectsFolder()
    if (root && attachment.data instanceof ArrayBuffer) {
      const workspace = await findWorkspaceFolder(root, attachment.workspaceId)
      const folder = workspace?.folder || path.join(root, `${safeSegment(attachment.workspaceTitle, 'مشروع')}-${safeId(attachment.workspaceId).slice(0, 8)}`)
      const stored = workspace?.manifest?.attachments?.find((item) => item.id === attachment.fileId)
      let filePath = stored?.path
        ? path.resolve(folder, ...stored.path.replace(/\\/g, '/').split('/'))
        : path.join(folder, 'assets', 'attachments', `${safeId(attachment.fileId)}-${safeSegment(attachment.name, 'attachment')}`)
      if (!filePath.startsWith(`${folder}${path.sep}`)) throw new Error('Invalid project attachment path.')
      try { await fs.access(filePath) } catch {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, Buffer.from(attachment.data))
        const manifestPath = path.join(folder, 'assets', 'manifest.json')
        let manifest = workspace?.manifest || { attachments: [] }
        try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch {}
        const attachments = (manifest.attachments || []).filter((item) => item.id !== attachment.fileId)
        attachments.push({ id: attachment.fileId, name: attachment.name, type: attachment.type || 'application/octet-stream', path: path.relative(folder, filePath).replace(/\\/g, '/') })
        await fs.writeFile(manifestPath, `${JSON.stringify({ ...manifest, workspaceId: attachment.workspaceId, attachments }, null, 2)}\n`, 'utf8')
      }
      const error = await shell.openPath(filePath)
      if (!error) return true
    }
  }
  if (!(attachment.data instanceof ArrayBuffer)) throw new TypeError('Attachment bytes are missing.')
  const safeName = path.basename(attachment.name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 140) || 'attachment'
  const folder = path.join(app.getPath('temp'), 'waraqa-open-files')
  const filePath = path.join(folder, `${randomUUID()}-${safeName}`)
  await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(filePath, Buffer.from(attachment.data))
  const error = await shell.openPath(filePath)
  if (error) throw new Error(error)
  return true
})
ipcMain.handle('waraqa:open-external-link', async (_event, value) => {
  if (typeof value !== 'string') throw new TypeError('Invalid external link.')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Invalid external link.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Only HTTP and HTTPS links are allowed.')
  await shell.openExternal(url.toString())
  return true
})
ipcMain.handle('waraqa:workspace-export', async (_event, bundle) => {
  if (!bundle || bundle.format !== 'waraqa-workspace' || bundle.formatVersion !== 1
    || !bundle.workspace || typeof bundle.workspace.id !== 'string'
    || !Array.isArray(bundle.mindMaps) || !Array.isArray(bundle.notes)
    || (bundle.tasks !== undefined && !Array.isArray(bundle.tasks))
    || (bundle.taskLists !== undefined && !Array.isArray(bundle.taskLists))
    || (bundle.uiDesigns !== undefined && !Array.isArray(bundle.uiDesigns))) {
    throw new TypeError('Invalid Waraqa workspace backup.')
  }

  const safeName = (value) => String(value || '')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80) || 'مشروع'
  const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'workspace'
  const folderName = `${safeName(bundle.workspace.title)}-${safeId(bundle.workspace.id).slice(0, 8)}`
  const root = path.join(app.getPath('downloads'), 'warqa')
  const folder = path.join(root, folderName)
  const mapsFolder = path.join(folder, 'mind-maps')
  const notesFolder = path.join(folder, 'notes')
  const tasksFolder = path.join(folder, 'tasks')
  const uiDesignsFolder = path.join(folder, 'ui-designs')
  await fs.mkdir(mapsFolder, { recursive: true })
  await fs.mkdir(notesFolder, { recursive: true })
  await fs.mkdir(tasksFolder, { recursive: true })
  await fs.mkdir(uiDesignsFolder, { recursive: true })

  const writeJson = async (target, value) => fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  const mindMaps = []
  for (const project of bundle.mindMaps) {
    if (!project || typeof project.id !== 'string') throw new TypeError('Invalid mind map in workspace backup.')
    const file = `${safeName(project.title)}-${safeId(project.id)}.json`
    await writeJson(path.join(mapsFolder, file), project)
    mindMaps.push({ id: project.id, title: project.title || '', file: `mind-maps/${file}` })
  }

  const notes = []
  for (const note of bundle.notes) {
    if (!note || typeof note.id !== 'string') throw new TypeError('Invalid note in workspace backup.')
    const file = `${safeName(note.title)}-${safeId(note.id)}.json`
    await writeJson(path.join(notesFolder, file), note)
    notes.push({ id: note.id, title: note.title || '', file: `notes/${file}` })
  }

  const tasks = []
  for (const task of bundle.tasks || []) {
    if (!task || typeof task.id !== 'string' || typeof task.title !== 'string') throw new TypeError('Invalid task in workspace backup.')
    const file = `${safeName(task.title)}-${safeId(task.id)}.json`
    await writeJson(path.join(tasksFolder, file), task)
    tasks.push({ id: task.id, title: task.title, file: `tasks/${file}` })
  }

  const taskLists = []
  for (const list of bundle.taskLists || []) {
    if (!list || typeof list.id !== 'string' || typeof list.title !== 'string') throw new TypeError('Invalid task list in workspace backup.')
    const file = `${safeName(list.title)}-${safeId(list.id)}.json`
    await writeJson(path.join(tasksFolder, file), list)
    taskLists.push({ id: list.id, title: list.title, file: `tasks/${file}` })
  }

  const uiDesigns = []
  for (const design of bundle.uiDesigns || []) {
    if (!design || typeof design.id !== 'string' || !Array.isArray(design.screens)) throw new TypeError('Invalid interface design in workspace backup.')
    const file = `${safeName(design.title)}-${safeId(design.id)}.json`
    await writeJson(path.join(uiDesignsFolder, file), design)
    uiDesigns.push({ id: design.id, title: design.title || '', file: `ui-designs/${file}` })
  }

  await writeJson(path.join(folder, 'manifest.json'), {
    format: bundle.format,
    formatVersion: bundle.formatVersion,
    exportedAt: bundle.exportedAt,
    workspace: bundle.workspace,
    mindMaps,
    notes,
    tasks,
    taskLists,
    uiDesigns,
  })
  await writeJson(path.join(folder, 'workspace.json'), bundle)
  return folder
})

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
