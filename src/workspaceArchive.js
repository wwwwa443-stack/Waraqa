const encoder = new TextEncoder()
const decoder = new TextDecoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

function write16(view, offset, value) { view.setUint16(offset, value, true) }
function write32(view, offset, value) { view.setUint32(offset, value, true) }

export async function createZipArchive(files) {
  const localParts = []
  const centralParts = []
  let localOffset = 0
  const stamp = new Date()
  const dosTime = (stamp.getHours() << 11) | (stamp.getMinutes() << 5) | Math.floor(stamp.getSeconds() / 2)
  const dosDate = ((Math.max(1980, stamp.getFullYear()) - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate()

  for (const file of files) {
    const name = encoder.encode(file.path.replace(/\\/g, '/'))
    const content = file.data instanceof Uint8Array
      ? file.data
      : file.data instanceof Blob
        ? new Uint8Array(await file.data.arrayBuffer())
        : encoder.encode(String(file.data ?? ''))
    const checksum = crc32(content)
    const localHeader = new Uint8Array(30 + name.length)
    const localView = new DataView(localHeader.buffer)
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800)
    write16(localView, 8, 0); write16(localView, 10, dosTime); write16(localView, 12, dosDate)
    write32(localView, 14, checksum); write32(localView, 18, content.length); write32(localView, 22, content.length)
    write16(localView, 26, name.length); write16(localView, 28, 0); localHeader.set(name, 30)
    localParts.push(localHeader, content)

    const centralHeader = new Uint8Array(46 + name.length)
    const centralView = new DataView(centralHeader.buffer)
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20)
    write16(centralView, 8, 0x0800); write16(centralView, 10, 0); write16(centralView, 12, dosTime); write16(centralView, 14, dosDate)
    write32(centralView, 16, checksum); write32(centralView, 20, content.length); write32(centralView, 24, content.length)
    write16(centralView, 28, name.length); write16(centralView, 30, 0); write16(centralView, 32, 0)
    write16(centralView, 34, 0); write16(centralView, 36, 0); write32(centralView, 38, 0); write32(centralView, 42, localOffset)
    centralHeader.set(name, 46)
    centralParts.push(centralHeader)
    localOffset += localHeader.length + content.length
  }

  const centralDirectory = concatBytes(centralParts)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  write32(endView, 0, 0x06054b50); write16(endView, 4, 0); write16(endView, 6, 0)
  write16(endView, 8, files.length); write16(endView, 10, files.length)
  write32(endView, 12, centralDirectory.length); write32(endView, 16, localOffset); write16(endView, 20, 0)
  return new Blob([...localParts, centralDirectory, end], { type: 'application/zip' })
}

export async function readZipArchive(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff)
  let endOffset = -1
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break }
  }
  if (endOffset < 0) throw new Error('Invalid ZIP archive.')
  const entriesCount = view.getUint16(endOffset + 10, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  const entries = new Map()
  let cursor = centralOffset
  for (let index = 0; index < entriesCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.')
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const checksum = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const fileSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, '/')
    cursor += 46 + nameLength + extraLength + commentLength
    if (!name || name.startsWith('/') || name.split('/').includes('..')) throw new Error('Unsafe path in ZIP archive.')
    if (name.endsWith('/')) continue
    if (flags & 1) throw new Error('Encrypted ZIP files are not supported.')
    if (method !== 0) throw new Error('This ZIP uses compression unsupported by this importer. Use a Waraqa ZIP export.')
    if (compressedSize !== fileSize) throw new Error('Invalid ZIP file size.')
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Invalid ZIP file entry.')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const content = bytes.slice(dataStart, dataStart + fileSize)
    if (crc32(content) !== checksum) throw new Error('ZIP file integrity check failed.')
    entries.set(name, content)
  }
  return entries
}

export function decodeZipText(bytes) { return decoder.decode(bytes) }

const safeSegment = (value, fallback = 'untitled') => String(value || fallback)
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  .replace(/\s+/g, ' ')
  .replace(/[. ]+$/g, '')
  .trim()
  .slice(0, 80) || fallback

const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`
const md = (value) => String(value || '').replace(/([\\`*_{}\[\]<>])/g, '\\$1')
const itemFolder = (item, index) => `${String(index + 1).padStart(2, '0')}-${safeSegment(item.title || item.data?.label || item.name)}`

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  const raw = match[2] ? Uint8Array.from(atob(match[3]), (character) => character.charCodeAt(0)) : encoder.encode(decodeURIComponent(match[3]))
  const extension = ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/png': 'png' })[mime] || mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
  return { mime, extension, bytes: raw }
}

function collectImageData(value, path, output, seen) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`
    if (typeof child === 'string' && child.startsWith('data:image/')) {
      if (!seen.has(child)) {
        const decoded = dataUrlToBytes(child)
        if (decoded) {
          const filename = `${String(output.length + 1).padStart(3, '0')}-${safeSegment(key, 'image')}.${decoded.extension}`
          const assetPath = `assets/images/${filename}`
          seen.set(child, assetPath)
          output.push({ path: assetPath, data: decoded.bytes, source: childPath, mime: decoded.mime })
        }
      }
    } else if (child && typeof child === 'object') collectImageData(child, childPath, output, seen)
  }
}

function plainStrings(value, output = [], path = '') {
  if (typeof value === 'string') {
    if (value.trim() && !value.startsWith('data:') && !/^#[0-9a-f]{3,8}$/i.test(value)) output.push({ path, value })
  } else if (Array.isArray(value)) value.forEach((entry, index) => plainStrings(entry, output, `${path}[${index}]`))
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => plainStrings(entry, output, path ? `${path}.${key}` : key))
  return output
}

function mindMapMarkdown(map) {
  const nodes = map.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map(nodes.map((node) => [node.id, []]))
  const hasParent = new Set()
  for (const edge of map.edges || []) { children.get(edge.source)?.push(edge.target); hasParent.add(edge.target) }
  const lines = [`# ${map.title || 'Mind map'}`, '', `Nodes: ${nodes.length} | Connections: ${(map.edges || []).length}`, '']
  const visited = new Set()
  const visit = (nodeId, depth) => {
    if (visited.has(nodeId)) return
    const node = byId.get(nodeId)
    if (!node) return
    visited.add(nodeId)
    const data = node.data || {}
    const label = data.label || data.title || data.text || 'Untitled node'
    lines.push(`${'#'.repeat(Math.min(6, depth + 2))} ${md(label)}`)
    for (const key of ['description', 'note', 'details', 'summary', 'content']) if (typeof data[key] === 'string' && data[key].trim()) lines.push('', data[key].trim())
    for (const childId of children.get(nodeId) || []) visit(childId, depth + 1)
  }
  nodes.filter((node) => !hasParent.has(node.id)).forEach((node) => visit(node.id, 0))
  nodes.forEach((node) => visit(node.id, 0))
  if (!nodes.length) lines.push('_No mind map nodes yet._')
  return `${lines.join('\n')}\n`
}

function flowchartMarkdown(flowchart) {
  const nodes = flowchart.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const lines = [`# ${flowchart.title || 'Engineering design'}`, '', '## Steps', '']
  nodes.forEach((node, index) => {
    const data = node.data || {}
    lines.push(`${index + 1}. **${md(data.label || data.title || data.text || 'Untitled step')}**${data.kind ? ` _(${md(data.kind)})_` : ''}`)
    for (const key of ['description', 'note', 'details']) if (typeof data[key] === 'string' && data[key].trim()) lines.push(`   - ${data[key].trim().replace(/\n/g, '\n   - ')}`)
  })
  lines.push('', '## Connections', '')
  for (const edge of flowchart.edges || []) {
    const from = byId.get(edge.source)?.data?.label || edge.source
    const to = byId.get(edge.target)?.data?.label || edge.target
    lines.push(`- ${md(from)} → ${md(to)}${edge.label ? ` (${md(edge.label)})` : ''}`)
  }
  if (!nodes.length) lines.push('_No flowchart steps yet._')
  return `${lines.join('\n')}\n`
}

function noteMarkdown(note, imagePaths) {
  const lines = [`# ${note.title || 'Note'}`, '']
  const pages = note.pages?.length ? note.pages : [note.content || '']
  pages.forEach((page, index) => {
    lines.push(`## Page ${index + 1}`, '')
    const blocks = note.pageTextBlocks?.[index]
    const text = Array.isArray(blocks) ? blocks.map((block) => block.text).filter(Boolean).join('\n\n') : page
    if (text?.trim()) lines.push(text.trim(), '')
    for (const image of note.pageImages?.[index] || []) {
      const assetPath = imagePaths.get(image.src)
      if (assetPath) lines.push(`![${md(image.name || 'Note image')}](../../${assetPath})`, '')
      else if (image.name) lines.push(`- Image: ${md(image.name)}`, '')
    }
  })
  return `${lines.join('\n')}\n`
}

function taskMarkdown(tasks, lists) {
  const lines = ['# Tasks', '']
  const listNames = new Map((lists || []).map((list) => [list.id, list.title]))
  for (const task of tasks || []) {
    lines.push(`## ${task.completed ? '[x]' : '[ ]'} ${md(task.title || 'Untitled task')}`)
    if (task.description) lines.push('', task.description)
    lines.push('', `- List: ${md(listNames.get(task.listId) || 'Uncategorized')}`)
    if (task.priority) lines.push(`- Priority: ${md(task.priority)}`)
    if (task.dueDate) lines.push(`- Due: ${md(task.dueDate)}`)
    if (task.mentions?.length) lines.push(`- References: ${task.mentions.map((mention) => md(mention.text || mention.title || mention.nodeTitle || '')).filter(Boolean).join(', ')}`)
    lines.push('')
  }
  if (!(tasks || []).length) lines.push('_No tasks yet._')
  return `${lines.join('\n')}\n`
}

function designMarkdown(design) {
  const lines = [`# ${design.title || 'Interface design'}`, '']
  if (design.viewports?.length) {
    lines.push('## Responsive viewport sizes', '')
    for (const viewport of design.viewports) lines.push(`- ${md(viewport.name || viewport.device)}: ${viewport.width} × ${viewport.height}px${viewport.locked ? ' (locked layout)' : ''}`)
    lines.push('')
  }
  for (const [screenIndex, screen] of (design.screens || []).entries()) {
    lines.push(`## ${screenIndex + 1}. ${md(screen.title || 'Screen')}`, '', `Size: ${screen.width} × ${screen.height}px`, `Scrollable: ${screen.scrollEnabled ? 'yes' : 'no'}`, '')
    for (const component of screen.components || []) {
      lines.push(`- **${md(component.type)}**: ${md(component.text || component.name || '')} _(x:${component.x}, y:${component.y}, w:${component.width}, h:${component.height})_`)
    }
    for (const viewport of design.viewports || []) {
      const components = screen.viewportLayouts?.[viewport.id]
      if (!viewport.locked || !Array.isArray(components)) continue
      lines.push('', `### Layout for ${md(viewport.name || viewport.device)} (${viewport.width} × ${viewport.height}px)`, '')
      for (const component of components) lines.push(`- **${md(component.type)}**: ${md(component.text || component.name || '')} _(x:${component.x}, y:${component.y}, w:${component.width}, h:${component.height})_`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

async function getImageDimensions(image) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mime }))
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  } catch {
    return null
  }
}

function interfaceSpecification(design, imagePaths, imageDimensions, previews = [], textDirection = 'rtl') {
  const serializeComponents = (components = []) => {
    const children = new Map()
    components.forEach((component) => {
      if (!component.parentId) return
      if (!children.has(component.parentId)) children.set(component.parentId, [])
      children.get(component.parentId).push(component)
    })
    const serialize = (component) => {
      const { imageData, ...properties } = component
      const imageAsset = imageData ? imagePaths.get(imageData) : null
      return {
        ...properties,
        bounds: { x: component.x, y: component.y, width: component.width, height: component.height },
        renderedSize: { width: component.width, height: component.height },
        ...(component.type === 'icon' ? { iconMetrics: { glyph: component.text || '', fontSize: component.fontSize || 28, boxWidth: component.width, boxHeight: component.height } } : {}),
        ...(imageAsset ? { image: { asset: imageAsset, renderedWidth: component.width, renderedHeight: component.height, intrinsicSize: imageDimensions.get(imageAsset) || null } } : {}),
        children: (children.get(component.id) || []).map(serialize),
      }
    }
    const ids = new Set(components.map((component) => component.id))
    return components.filter((component) => !component.parentId || !ids.has(component.parentId)).map(serialize)
  }
  const fallbackScreen = design.screens?.[0]
  const viewports = design.viewports?.length ? design.viewports : [{ id: 'screen', name: 'Screen size', device: 'screen', width: fallbackScreen?.width || 390, height: fallbackScreen?.height || 844, locked: false }]
  return {
    format: 'waraqa-interface-specification',
    formatVersion: 1,
    textDirection,
    design: { id: design.id, title: design.title, notes: design.notes || '' },
    viewports: viewports.map(({ id, name, device, width, height, locked }) => ({ id, name, device, width, height, locked: Boolean(locked) })),
    screens: (design.screens || []).map((screen) => ({
      id: screen.id,
      title: screen.title,
      size: { width: screen.width, height: screen.height },
      background: screen.background || '#ffffff',
      scrolling: { enabled: Boolean(screen.scrollEnabled), lengthPercent: screen.scrollLengthPercent || 100 },
      components: serializeComponents(screen.components || []),
      viewportLayouts: Object.fromEntries(viewports.filter((viewport) => Array.isArray(screen.viewportLayouts?.[viewport.id])).map((viewport) => [viewport.id, serializeComponents(screen.viewportLayouts[viewport.id])])),
    })),
    exportedPreviews: previews.map((preview) => ({
      screenId: preview.screenId,
      viewportId: preview.viewportId,
      orientation: preview.orientation || 'portrait',
      viewportSize: { width: preview.viewportWidth || preview.width, height: preview.viewportHeight || preview.height },
      logicalImageSize: { width: preview.width, height: preview.height },
      rasterImageSize: { width: preview.width * (preview.pixelRatio || 1), height: preview.height * (preview.pixelRatio || 1) },
      pixelRatio: preview.pixelRatio || 1,
      textDirection: preview.textDirection || textDirection,
    })),
    interactionNotes: 'Elements with targetScreenId navigate to that screen. Nested elements use parentId and coordinates relative to their parent.',
  }
}

export async function createWorkspaceArchive(bundle, attachments = [], designPreviews = []) {
  const files = []
  const addText = (path, content) => files.push({ path, data: typeof content === 'string' ? content : stringify(content) })
  const images = []
  const imagePaths = new Map()
  collectImageData(bundle, '', images, imagePaths)
  const imageDimensions = new Map()
  for (const image of images) {
    const dimensions = await getImageDimensions(image)
    if (dimensions) imageDimensions.set(image.path, dimensions)
  }
  addText('project.json', bundle)
  addText('README.md', `# ${bundle.workspace?.title || 'Waraqa project'}\n\nThis archive contains the complete Waraqa project and its planning artifacts.\n\n## Folders\n- \`mind-maps/\`: project maps and their text outlines.\n- \`notes/\`: notes, pages, and their extracted text.\n- \`engineering-design/\`: flowcharts and task plans.\n- \`interface-design/\`: every screen exported as a PNG for every configured viewport, plus exact component specifications.\n- \`assets/\`: extracted images and note attachments.\n- \`project.json\`: the complete machine-readable Waraqa backup. Import this file into Waraqa to restore the project.\n\nInterface PNGs are organized by design, screen, and viewport. Their filenames show the actual pixel dimensions and match the configured screen size at 1:1 resolution (long pages use their full content height). \`specification.json\` records viewport size, orientation, text direction, canvas and element bounds, icon glyph/font size, and each preview's dimensions. Text alignment values such as \`start\` and \`end\` follow the recorded text direction. \`assets/manifest.json\` lists preview paths and dimensions as well as intrinsic dimensions for extracted images.\n\nUse \`AI_PROMPT.md\` as an instruction when giving this folder to an AI assistant.\n`)
  addText('AI_PROMPT.md', `Read the complete project in this folder before making changes. Start with README.md and project.json. Use the Markdown files for readable project context and the JSON files for exact structure, relationships, coordinates, icon sizes, text direction, and styles. For interface designs, inspect specification.json and every PNG under interface-design/<design>/screens/; exported PNG pixel dimensions match the configured canvas dimensions at 1:1 resolution. Check assets/manifest.json for extracted images, intrinsic image dimensions, and preview paths. Preserve existing requirements and ask before changing ambiguous product decisions.\n`)
  const extractedText = plainStrings(bundle).map(({ path, value }) => `- \`${path}\`: ${value}`)
  addText('extracted-text.md', `# Extracted project text\n\n${extractedText.length ? extractedText.join('\n') : '_No text was found._'}\n`)

  for (const [index, map] of (bundle.mindMaps || []).entries()) {
    const folder = `mind-maps/${itemFolder(map, index)}`
    addText(`${folder}/data.json`, map)
    addText(`${folder}/outline.md`, mindMapMarkdown(map))
  }
  for (const [index, note] of (bundle.notes || []).entries()) {
    const folder = `notes/${itemFolder(note, index)}`
    addText(`${folder}/data.json`, note)
    addText(`${folder}/content.md`, noteMarkdown(note, imagePaths))
  }
  for (const [index, flowchart] of (bundle.flowcharts || []).entries()) {
    const folder = `engineering-design/flowcharts/${itemFolder(flowchart, index)}`
    addText(`${folder}/data.json`, flowchart)
    addText(`${folder}/steps.md`, flowchartMarkdown(flowchart))
  }
  addText('engineering-design/tasks/tasks.json', { taskLists: bundle.taskLists || [], tasks: bundle.tasks || [] })
  addText('engineering-design/tasks/tasks.md', taskMarkdown(bundle.tasks, bundle.taskLists))
  for (const [index, design] of (bundle.uiDesigns || []).entries()) {
    const folder = `interface-design/${itemFolder(design, index)}`
    const safeDesignPreviews = designPreviews.filter((preview) => preview.designId === design.id)
    addText(`${folder}/data.json`, design)
    addText(`${folder}/specification.md`, designMarkdown(design))
    addText(`${folder}/specification.json`, interfaceSpecification(design, imagePaths, imageDimensions, safeDesignPreviews, bundle.textDirection || 'rtl'))
    for (const preview of safeDesignPreviews) {
      const screen = design.screens?.find((item) => item.id === preview.screenId)
      const viewport = design.viewports?.find((item) => item.id === preview.viewportId)
      const screenFolder = `${String((design.screens || []).indexOf(screen) + 1).padStart(2, '0')}-${safeSegment(screen?.title || 'screen')}`
      const viewportFolder = safeSegment(preview.viewportName || viewport?.name || 'viewport')
      const orientation = preview.orientation ? `-${safeSegment(preview.orientation)}` : ''
      files.push({ path: `${folder}/screens/${screenFolder}/${viewportFolder}${orientation}-${preview.width}x${preview.height}.png`, data: preview.data })
    }
  }

  for (const image of images) {
    files.push({ path: image.path, data: image.bytes })
    imagePaths.set(image.source, image.path)
  }
  const attachmentManifest = []
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment?.blob || !attachment.id) continue
    const filename = `${String(index + 1).padStart(3, '0')}-${safeSegment(attachment.name, 'attachment')}`
    const path = `assets/attachments/${filename}`
    files.push({ path, data: attachment.blob })
    attachmentManifest.push({ id: attachment.id, name: attachment.name || filename, type: attachment.type || attachment.blob.type || 'application/octet-stream', path })
  }
  const exportedPreviewManifest = designPreviews.map((preview) => {
    const designIndex = (bundle.uiDesigns || []).findIndex((design) => design.id === preview.designId)
    const design = bundle.uiDesigns?.[designIndex]
    const screen = design?.screens?.find((item) => item.id === preview.screenId)
    const screenIndex = (design?.screens || []).indexOf(screen)
    const designFolder = `interface-design/${itemFolder(design, designIndex)}`
    const screenFolder = `${String(screenIndex + 1).padStart(2, '0')}-${safeSegment(screen?.title || 'screen')}`
    const viewportFolder = safeSegment(preview.viewportName || design?.viewports?.find((item) => item.id === preview.viewportId)?.name || 'viewport')
    const orientation = preview.orientation ? `-${safeSegment(preview.orientation)}` : ''
    return {
      path: `${designFolder}/screens/${screenFolder}/${viewportFolder}${orientation}-${preview.width}x${preview.height}.png`,
      designId: preview.designId,
      screenId: preview.screenId,
      viewportId: preview.viewportId,
      orientation: preview.orientation || 'portrait',
      viewportWidth: preview.viewportWidth || preview.width,
      viewportHeight: preview.viewportHeight || preview.height,
      logicalWidth: preview.width,
      logicalHeight: preview.height,
      pixelWidth: preview.width * (preview.pixelRatio || 1),
      pixelHeight: preview.height * (preview.pixelRatio || 1),
      pixelRatio: preview.pixelRatio || 1,
      textDirection: preview.textDirection || bundle.textDirection || 'rtl',
    }
  })
  addText('assets/manifest.json', { images: images.map(({ path, source, mime }) => ({ path, source, mime, ...(imageDimensions.has(path) ? { width: imageDimensions.get(path).width, height: imageDimensions.get(path).height } : {}) })), previews: exportedPreviewManifest, attachments: attachmentManifest })
  addText('assets/images/README.md', `Image copies extracted from the project data are stored here. The original image data is also embedded in project.json so the Waraqa backup remains self-contained.\n`)
  return createZipArchive(files)
}
