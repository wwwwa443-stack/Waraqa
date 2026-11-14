import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Eraser, ExternalLink, FileText, GripVertical, ImagePlus, Link2, MousePointer2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Paperclip, Pencil, Plus, Search, StickyNote, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-react'
import { NOTES_STORAGE_KEY } from './noteStorage.js'
import { readNoteAttachment, saveNoteAttachment } from './noteAttachments.js'

const NOTE_PAGE_WIDTH = 1100
const NOTE_PAGE_HEIGHT = 720

function drawStrokes(canvas, strokes) {
  const context = canvas.getContext('2d')
  if (!context) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * ratio)
  canvas.height = Math.round(rect.height * ratio)
  context.clearRect(0, 0, canvas.width, canvas.height)

  strokes.forEach((stroke) => {
    if (!Array.isArray(stroke.points) || !stroke.points.length) return
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    context.strokeStyle = stroke.color || '#263b32'
    context.lineWidth = (stroke.size || 3) * ratio
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height)
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height))
    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x * canvas.width + 0.1, stroke.points[0].y * canvas.height + 0.1)
    }
    context.stroke()
  })
  context.globalCompositeOperation = 'source-over'
}

async function prepareDroppedImage(file, position) {
  if (!file.type.startsWith('image/')) throw new Error('not-image')
  if (file.size > 20 * 1024 * 1024) throw new Error('image-too-large')
  if (typeof createImageBitmap !== 'function') throw new Error('image-processing-unavailable')

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('image-processing-failed')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const src = canvas.toDataURL('image/webp', 0.82)
    return {
      id: globalThis.crypto?.randomUUID?.() || `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      src,
      name: file.name,
      aspectRatio: bitmap.height / bitmap.width,
      x: position.x,
      y: position.y,
      width: 0.32,
    }
  } finally {
    bitmap.close()
  }
}

function NotesImagesLayer({ images, onChange, onSelect, selectedImageId, label, direction, className = '' }) {
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const [dragPosition, setDragPosition] = useState(null)
  const [resizeWidth, setResizeWidth] = useState(null)
  const layerRef = useRef(null)
  const text = (arabic, english) => direction === 'ltr' ? english : arabic
  const imageHalfHeight = (image, width, rect = layerRef.current.getBoundingClientRect()) => (
    Math.min(width * (image.aspectRatio || 0.75) * rect.width / rect.height, 0.6) / 2
  )
  const fitImagePosition = (image, width, position) => {
    const rect = layerRef.current.getBoundingClientRect()
    const halfWidth = width / 2
    const halfHeight = imageHalfHeight(image, width, rect)
    return {
      x: Math.max(halfWidth, Math.min(1 - halfWidth, position.x)),
      y: Math.max(halfHeight, Math.min(1 - halfHeight, position.y)),
    }
  }

  const beginImageMove = (event, image) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(image.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    const layerRect = layerRef.current.getBoundingClientRect()
    dragRef.current = {
      id: image.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: { x: image.x, y: image.y },
      position: { x: image.x, y: image.y },
      layerRect,
      halfWidth: image.width / 2,
      halfHeight: imageHalfHeight(image, image.width, layerRect),
    }
  }

  const moveImage = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const position = {
      x: Math.max(drag.halfWidth, Math.min(1 - drag.halfWidth, drag.startPosition.x + (event.clientX - drag.startX) / drag.layerRect.width)),
      y: Math.max(drag.halfHeight, Math.min(1 - drag.halfHeight, drag.startPosition.y + (event.clientY - drag.startY) / drag.layerRect.height)),
    }
    drag.position = position
    setDragPosition({ id: drag.id, ...position })
  }

  const finishImageMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onChange(images.map((image) => image.id === drag.id ? { ...image, ...drag.position } : image))
    dragRef.current = null
    setDragPosition(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const beginImageResize = (event, image) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(image.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      id: image.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: image.width,
      layerWidth: layerRef.current.getBoundingClientRect().width,
      direction: getComputedStyle(layerRef.current).direction === 'rtl' ? -1 : 1,
      width: image.width,
    }
  }

  const moveImageResize = (event) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    resize.width = Math.max(0.12, Math.min(0.85, resize.startWidth + ((event.clientX - resize.startX) / resize.layerWidth) * resize.direction))
    setResizeWidth({ id: resize.id, width: resize.width })
  }

  const finishImageResize = (event) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onChange(images.map((image) => {
      if (image.id !== resize.id) return image
      return { ...image, width: resize.width, ...fitImagePosition(image, resize.width, image) }
    }))
    resizeRef.current = null
    setResizeWidth(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div ref={layerRef} className={`notes-images-layer${className ? ` ${className}` : ''}`} aria-label={label}>
      {images.map((image) => {
        const position = dragPosition?.id === image.id ? dragPosition : image
        const selected = image.id === selectedImageId
        const width = resizeWidth?.id === image.id ? resizeWidth.width : image.width
        return (
          <div
            key={image.id}
            className={`notes-image-item${selected ? ' is-selected' : ''}`}
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${width * 100}%` }}
            onPointerDown={(event) => {
              beginImageMove(event, image)
            }}
            onPointerMove={moveImage}
            onPointerUp={finishImageMove}
            onPointerCancel={finishImageMove}
          >
            <img src={image.src} alt={image.name || label} draggable="false" />
            {selected && <div className="notes-image-controls">
              <button
                type="button"
                aria-label={label}
                title={label}
                onPointerDown={(event) => beginImageMove(event, image)}
                onPointerMove={moveImage}
                onPointerUp={finishImageMove}
                onPointerCancel={finishImageMove}
              >
                <GripVertical size={13} />
              </button>
              <button
                type="button"
                aria-label={text('حذف الصورة', 'Remove image')}
                title={text('حذف الصورة', 'Remove image')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onChange(images.filter((item) => item.id !== image.id))
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>}
            {selected && <button
              type="button"
              className="notes-image-resize-handle"
              aria-label={text('تغيير حجم الصورة', 'Resize image')}
              title={text('تغيير حجم الصورة', 'Resize image')}
              onPointerDown={(event) => beginImageResize(event, image)}
              onPointerMove={moveImageResize}
              onPointerUp={finishImageResize}
              onPointerCancel={finishImageResize}
            />}
          </div>
        )
      })}
    </div>
  )
}


function NoteDrawingCanvas({ strokes, onChange, tool, color, size, onSizeChange, label }) {
  const canvasRef = useRef(null)
  const activeStrokeRef = useRef(null)
  const wheelStateRef = useRef({ tool, size, onSizeChange })
  const [cursorPosition, setCursorPosition] = useState(null)

  useLayoutEffect(() => {
    wheelStateRef.current = { tool, size, onSizeChange }
  }, [tool, size, onSizeChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const redraw = () => drawStrokes(canvas, strokes)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [strokes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const handleWheel = (event) => {
      const current = wheelStateRef.current
      if (!event.ctrlKey || (current.tool !== 'pen' && current.tool !== 'eraser')) return
      event.preventDefault()
      current.onSizeChange(current.size + (event.deltaY < 0 ? 1 : -1) * (current.tool === 'eraser' ? 3 : 1))
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }

  const handlePointerDown = (event) => {
    if (tool === 'text') return
    setCursorPosition(pointFromEvent(event))
    event.currentTarget.setPointerCapture(event.pointerId)
    activeStrokeRef.current = {
      tool,
      color,
      size,
      points: [pointFromEvent(event)],
    }
    drawStrokes(event.currentTarget, [...strokes, activeStrokeRef.current])
  }

  const handlePointerMove = (event) => {
    const point = pointFromEvent(event)
    setCursorPosition(point)
    if (activeStrokeRef.current) {
      activeStrokeRef.current.points.push(point)
      drawStrokes(event.currentTarget, [...strokes, activeStrokeRef.current])
    }
  }

  const finishStroke = (event) => {
    if (!activeStrokeRef.current) return
    const completedStroke = activeStrokeRef.current
    activeStrokeRef.current = null
    onChange([...strokes, completedStroke])
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`notes-drawing-canvas${tool === 'pen' || tool === 'eraser' ? '' : ' is-inactive'}`}
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={() => {
          if (!activeStrokeRef.current) setCursorPosition(null)
        }}
      />
      {(tool === 'pen' || tool === 'eraser') && cursorPosition && <span
        className={`notes-brush-cursor is-${tool}`}
        aria-hidden="true"
        style={{
          left: `${cursorPosition.x * 100}%`,
          top: `${cursorPosition.y * 100}%`,
          width: `${size}px`,
          height: `${size}px`,
          '--brush-color': color,
        }}
      />}
    </>
  )
}

function NoteTextLayer({ blocks, direction, tool, label, defaultFontSize, selectedBlockId, onSelectionChange, onChange, projects, tasks, flowcharts, noteDocuments, onOpenMention, registerFileMentionAction, registerLinkMentionAction }) {
  const textareasRef = useRef(new Map())
  const textBoxesRef = useRef(new Map())
  const filePickerRef = useRef(null)
  const pendingFileInsertionRef = useRef(null)
  const pendingFocusIdRef = useRef(null)
  const pendingSelectionRef = useRef(null)
  const dragRef = useRef(null)
  const [dragPosition, setDragPosition] = useState(null)
  const [mentionPicker, setMentionPicker] = useState(null)
  const [fileError, setFileError] = useState('')
  const [editingBlockId, setEditingBlockId] = useState(null)
  const text = (arabic, english) => direction === 'ltr' ? english : arabic
  const touchTextEditing = tool === 'text'
    && (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches)

  useLayoutEffect(() => {
    let textLayer = null
    textareasRef.current.forEach((textarea) => {
      textLayer ||= textarea.closest('.notes-text-layer')
      const layerRect = textLayer?.getBoundingClientRect()
      const availableHeight = layerRect
        ? Math.max(26, layerRect.bottom - textarea.getBoundingClientRect().top)
        : textarea.scrollHeight
      textarea.style.height = 'auto'
      textarea.style.maxHeight = `${availableHeight}px`
      textarea.style.height = `${Math.min(textarea.scrollHeight, availableHeight)}px`
    })
    const pendingId = pendingFocusIdRef.current
    if (pendingId) {
      textareasRef.current.get(pendingId)?.focus()
      pendingFocusIdRef.current = null
    }
    const pendingSelection = pendingSelectionRef.current
    if (pendingSelection) {
      const textarea = textareasRef.current.get(pendingSelection.blockId)
      textarea?.focus()
      textarea?.setSelectionRange(pendingSelection.position, pendingSelection.position)
      pendingSelectionRef.current = null
    }
    if (!textLayer) return undefined
    const resizeObserver = new ResizeObserver(() => {
      textareasRef.current.forEach((textarea) => {
        const layerRect = textLayer.getBoundingClientRect()
        const availableHeight = Math.max(26, layerRect.bottom - textarea.getBoundingClientRect().top)
        textarea.style.maxHeight = `${availableHeight}px`
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, availableHeight)}px`
      })
    })
    resizeObserver.observe(textLayer)
    return () => resizeObserver.disconnect()
  }, [blocks, editingBlockId])

  const beginEditingTextBlock = (blockId) => {
    setEditingBlockId(blockId)
    onSelectionChange(blockId)
    pendingFocusIdRef.current = blockId
  }

  const createTextBlock = (event) => {
    if (event.target !== event.currentTarget || tool !== 'text') return
    const rect = event.currentTarget.getBoundingClientRect()
    const isRightToLeft = direction === 'rtl'
    const x = isRightToLeft
      ? (rect.right - event.clientX) / rect.width
      : (event.clientX - rect.left) / rect.width
    const textBlock = {
      id: globalThis.crypto?.randomUUID?.() || `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: '',
      fontSize: defaultFontSize,
      x: Math.max(0.01, Math.min(0.98, x)),
      y: Math.max(0.01, Math.min(0.92, (event.clientY - rect.top) / rect.height)),
    }
    pendingFocusIdRef.current = textBlock.id
    setEditingBlockId(textBlock.id)
    onSelectionChange(textBlock.id)
    onChange([...blocks, textBlock])
  }

  const updateTextBlock = (id, value) => {
    onChange(blocks.map((block) => block.id === id ? { ...block, text: value } : block))
  }

  const updateTextBlockFromInput = (id, value, caret) => {
    const block = blocks.find((item) => item.id === id)
    if (block) {
      const mentions = (block.mentions || []).filter((mention) => value.includes(mention.text))
      onChange(blocks.map((item) => item.id === id ? { ...item, text: value, mentions } : item))
    }

    if (mentionPicker?.blockId === id) {
      const query = value.slice(mentionPicker.queryStart, caret)
      if (caret < mentionPicker.queryStart || query.includes('\n')) {
        setMentionPicker(null)
      } else {
        setMentionPicker({ ...mentionPicker, end: caret, query })
      }
    } else if (value[caret - 1] === '@') {
      setMentionPicker({
        blockId: id,
        start: caret - 1,
        queryStart: caret,
        end: caret,
        step: 'type',
        kind: null,
        containerId: null,
        query: '',
      })
    }
  }

  const selectMentionKind = (kind) => {
    if (!mentionPicker) return
    const block = blocks.find((item) => item.id === mentionPicker.blockId)
    if (!block) return
    const nextText = `${block.text.slice(0, mentionPicker.start + 1)}${block.text.slice(mentionPicker.end)}`
    updateTextBlock(mentionPicker.blockId, nextText)
    const queryStart = mentionPicker.start + 1
    pendingSelectionRef.current = { blockId: mentionPicker.blockId, position: queryStart }
    setMentionPicker({ ...mentionPicker, step: kind === 'task' || kind === 'note' ? 'item' : 'container', kind, containerId: null, queryStart, end: queryStart, query: '' })
  }

  const selectMentionContainer = (container) => {
    const picker = mentionPicker
    const block = blocks.find((item) => item.id === picker?.blockId)
    if (!picker || !block) return
    const nextText = `${block.text.slice(0, picker.start + 1)}${block.text.slice(picker.end)}`
    updateTextBlock(picker.blockId, nextText)
    const queryStart = picker.start + 1
    pendingSelectionRef.current = { blockId: picker.blockId, position: queryStart }
    setMentionPicker({
      ...picker,
      queryStart,
      end: queryStart,
      step: 'item',
      containerId: container.id,
      query: '',
    })
  }

  const goBackMentionPicker = () => {
    const picker = mentionPicker
    const block = blocks.find((item) => item.id === picker?.blockId)
    if (!picker || !block) return
    const previousStep = picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? 'container' : 'type'
    const nextText = `${block.text.slice(0, picker.start + 1)}${block.text.slice(picker.end)}`
    updateTextBlock(picker.blockId, nextText)
    const queryStart = picker.start + 1
    pendingSelectionRef.current = { blockId: picker.blockId, position: queryStart }
    setMentionPicker({ ...picker, step: previousStep, kind: previousStep === 'type' ? null : picker.kind, containerId: previousStep === 'type' ? null : picker.containerId, queryStart, end: queryStart, query: '' })
  }

  const selectMentionItem = (item) => {
    const picker = mentionPicker
    const block = blocks.find((item) => item.id === picker?.blockId)
    if (!picker || !block) return
    const container = picker.kind === 'mind-map' ? projects.find((project) => project.id === picker.containerId)
      : picker.kind === 'flowchart' ? flowcharts.find((flowchart) => flowchart.id === picker.containerId) : null
    if (!['task', 'note'].includes(picker.kind) && !container) return
    const itemTitle = picker.kind === 'task'
      ? (item.title || text('مهمة بدون عنوان', 'Untitled task'))
      : picker.kind === 'note'
        ? (item.title || text('ملاحظة بدون عنوان', 'Untitled note'))
        : (item.data?.label || text('بدون عنوان', 'Untitled item'))
    const containerTitle = container?.title || ''
    const prefix = picker.kind === 'mind-map' ? '🧠' : picker.kind === 'task' ? '✓' : picker.kind === 'note' ? '📝' : '↗'
    const mentionText = `@${prefix} ${containerTitle ? `${containerTitle} / ` : ''}${itemTitle}`
    const nextText = `${block.text.slice(0, picker.start)}${mentionText}${block.text.slice(picker.end)}`
    const mention = picker.kind === 'mind-map'
      ? { type: 'mind-map-node', projectId: container.id, nodeId: item.id, projectTitle: containerTitle, nodeTitle: itemTitle, text: mentionText }
      : picker.kind === 'task'
        ? { type: 'task', taskId: item.id, taskTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
        : picker.kind === 'note'
          ? { type: 'note', noteId: item.id, noteTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
          : { type: 'flowchart-node', flowchartId: container.id, flowchartTitle: containerTitle, nodeId: item.id, nodeTitle: itemTitle, workspaceId: container.workspaceId, text: mentionText }
    const mentions = [...(block.mentions || []), mention]
    onChange(blocks.map((item) => item.id === picker.blockId
      ? { ...item, text: nextText, mentions }
      : item))
    pendingSelectionRef.current = { blockId: picker.blockId, position: picker.start + mentionText.length }
    setMentionPicker(null)
  }

  const getMentionOptions = (picker) => {
    if (!picker) return []
    const query = picker.query.toLocaleLowerCase()
    if (picker.step === 'type') return [
      { optionType: 'type', id: 'mind-map', title: text('خريطة ذهنية', 'Mind map'), detail: text(`${projects.length} خريطة`, `${projects.length} maps`) },
      { optionType: 'type', id: 'task', title: text('مهمة', 'Task'), detail: text(`${tasks.length} مهمة`, `${tasks.length} tasks`) },
      { optionType: 'type', id: 'note', title: text('ملاحظة', 'Note'), detail: text(`${noteDocuments.length} ملاحظة`, `${noteDocuments.length} notes`) },
      { optionType: 'type', id: 'flowchart', title: text('مخطط انسيابي', 'Flowchart'), detail: text(`${flowcharts.length} مخطط`, `${flowcharts.length} flowcharts`) },
    ].filter((option) => `${option.title} ${option.detail}`.toLocaleLowerCase().includes(query))
    if (picker.step === 'container') return (picker.kind === 'mind-map' ? projects : flowcharts)
      .filter((item) => (item.title || '').toLocaleLowerCase().includes(query))
      .map((item) => ({ optionType: 'container', id: item.id, title: item.title || text('بدون عنوان', 'Untitled'), detail: picker.kind === 'mind-map'
        ? text(`${item.nodes?.length || 0} عقدة`, `${item.nodes?.length || 0} nodes`)
        : text(`${item.nodes?.length || 0} شكل`, `${item.nodes?.length || 0} shapes`), value: item }))
    const items = picker.kind === 'mind-map'
      ? (projects.find((project) => project.id === picker.containerId)?.nodes || [])
      : picker.kind === 'task'
        ? tasks
        : picker.kind === 'note'
          ? noteDocuments
          : (flowcharts.find((flowchart) => flowchart.id === picker.containerId)?.nodes || [])
    return items.filter((item) => `${picker.kind === 'task' || picker.kind === 'note' ? item.title || '' : `${item.data?.label || ''} ${picker.kind === 'mind-map' ? item.data?.note || '' : ''}`}`.toLocaleLowerCase().includes(query))
      .map((item) => ({ optionType: 'item', id: item.id, title: picker.kind === 'task' ? item.title || text('مهمة بدون عنوان', 'Untitled task') : picker.kind === 'note' ? item.title || text('ملاحظة بدون عنوان', 'Untitled note') : item.data?.label || text('بدون عنوان', 'Untitled item'), detail: picker.kind === 'mind-map' ? item.data?.note : '', value: item }))
  }

  const chooseFileForBlock = (event, block) => {
    if (!((event.ctrlKey || event.metaKey) && event.shiftKey) || event.key.toLowerCase() !== 'f') return false
    event.preventDefault()
    event.stopPropagation()
    pendingFileInsertionRef.current = {
      blockId: block.id,
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
      keepEditing: true,
    }
    setFileError('')
    if (filePickerRef.current) {
      filePickerRef.current.value = ''
      filePickerRef.current.click()
    }
    return true
  }

  const resumeTextEditing = (blockId) => {
    if (!blockId) return
    setEditingBlockId(blockId)
    requestAnimationFrame(() => textareasRef.current.get(blockId)?.focus())
  }

  const addPickedFile = async (event) => {
    const file = event.currentTarget.files?.[0]
    const pending = pendingFileInsertionRef.current
    event.currentTarget.value = ''
    if (!file || !pending) {
      if (pending) {
        pendingFileInsertionRef.current = null
        if (pending.keepEditing && !pending.newBlock) resumeTextEditing(pending.blockId)
      }
      return
    }
    const block = pending.newBlock || blocks.find((item) => item.id === pending.blockId)
    if (!block) return

    try {
      const attachment = await saveNoteAttachment(file)
      const token = `📎${file.name}`
      const nextText = `${block.text.slice(0, pending.start)}${token}${block.text.slice(pending.end)}`
      const mention = {
        type: 'file',
        fileId: attachment.id,
        fileName: attachment.name,
        fileType: attachment.type,
        fileSize: attachment.size,
        text: token,
      }
      if (pending.keepEditing) {
        pendingSelectionRef.current = { blockId: block.id, position: pending.start + token.length }
        setEditingBlockId(block.id)
      } else {
        setEditingBlockId(null)
      }
      onSelectionChange(block.id)
      setMentionPicker(null)
      setFileError('')
      const updatedBlock = { ...block, text: nextText, mentions: [...(block.mentions || []), mention] }
      onChange(pending.newBlock
        ? [...blocks, updatedBlock]
        : blocks.map((item) => item.id === block.id ? updatedBlock : item))
    } catch (error) {
      console.error('Could not attach file to note.', error)
      setFileError(text('تعذر إرفاق الملف. قد تكون مساحة التخزين ممتلئة.', 'Could not attach the file. Browser storage may be full.'))
      if (pending.keepEditing) resumeTextEditing(block.id)
    } finally {
      pendingFileInsertionRef.current = null
    }
  }

  const cancelFilePicker = () => {
    const pending = pendingFileInsertionRef.current
    pendingFileInsertionRef.current = null
    if (pending?.keepEditing && !pending.newBlock) resumeTextEditing(pending.blockId)
  }

  const requestFileMentionFromToolbar = () => {
    let block = blocks.find((item) => item.id === selectedBlockId)
    let newBlock = null
    if (!block) {
      newBlock = {
        id: globalThis.crypto?.randomUUID?.() || `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: '',
        fontSize: defaultFontSize,
        x: 0.5,
        y: 0.5,
      }
      block = newBlock
    }
    const textarea = textareasRef.current.get(block.id)
    pendingFileInsertionRef.current = {
      blockId: block.id,
      start: textarea?.selectionStart ?? block.text.length,
      end: textarea?.selectionEnd ?? block.text.length,
      newBlock,
      keepEditing: true,
    }
    setFileError('')
    filePickerRef.current?.click()
  }

  const requestLinkMentionFromToolbar = () => {
    const enteredUrl = window.prompt(text('اكتب الرابط الذي تريد إضافته', 'Enter the link to insert'))
    if (!enteredUrl?.trim()) return
    const rawUrl = enteredUrl.trim()
    let url
    try {
      url = new URL(/^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link protocol')
    } catch {
      setFileError(text('الرابط غير صالح. استخدم رابط ويب يبدأ بـ http أو https.', 'Invalid link. Use a web address with http or https.'))
      return
    }

    let block = blocks.find((item) => item.id === selectedBlockId)
    let newBlock = null
    if (!block) {
      newBlock = {
        id: globalThis.crypto?.randomUUID?.() || `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: '',
        fontSize: defaultFontSize,
        x: 0.5,
        y: 0.5,
      }
      block = newBlock
    }
    const textarea = textareasRef.current.get(block.id)
    const start = textarea?.selectionStart ?? block.text.length
    const end = textarea?.selectionEnd ?? block.text.length
    const token = `🔗${url.toString()}`
    const mention = { type: 'link', url: url.toString(), text: token }
    const updatedBlock = {
      ...block,
      text: `${block.text.slice(0, start)}${token}${block.text.slice(end)}`,
      mentions: [...(block.mentions || []), mention],
    }
    pendingSelectionRef.current = { blockId: block.id, position: start + token.length }
    setEditingBlockId(block.id)
    onSelectionChange(block.id)
    setMentionPicker(null)
    setFileError('')
    onChange(newBlock ? [...blocks, updatedBlock] : blocks.map((item) => item.id === block.id ? updatedBlock : item))
  }

  useEffect(() => {
    registerFileMentionAction?.(requestFileMentionFromToolbar)
    return () => registerFileMentionAction?.(null)
  }, [blocks, defaultFontSize, registerFileMentionAction, selectedBlockId])

  useEffect(() => {
    registerLinkMentionAction?.(requestLinkMentionFromToolbar)
    return () => registerLinkMentionAction?.(null)
  }, [blocks, defaultFontSize, registerLinkMentionAction, selectedBlockId, direction])

  const revealNoteAttachment = async (mention) => {
    try {
      const attachment = await readNoteAttachment(mention.fileId)
      if (!attachment?.blob) throw new Error('Attachment is missing from this device.')
      if (window.waraqaWindow?.revealNoteAttachment) {
        await window.waraqaWindow.revealNoteAttachment({
          workspaceId: workspaceId || mention.workspaceId,
          workspaceTitle,
          fileId: mention.fileId,
          name: attachment.name || mention.fileName,
          type: attachment.type || mention.fileType,
          data: await attachment.blob.arrayBuffer(),
        })
      } else {
        const url = URL.createObjectURL(attachment.blob)
        const download = document.createElement('a')
        download.href = url
        download.download = attachment.name || mention.fileName || 'attachment'
        download.rel = 'noopener'
        document.body.append(download)
        download.click()
        download.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      setFileError('')
    } catch (error) {
      console.error('Could not reveal note attachment.', error)
      setFileError(text('تعذر إظهار موقع الملف المرفق.', 'Could not reveal this attachment.'))
    }
  }

  const handleTextKeyDown = (event, block) => {
    if (chooseFileForBlock(event, block)) return
    if (event.key === 'Escape' && mentionPicker?.blockId === block.id) {
      setMentionPicker(null)
    }
  }

  const renderTextWithMentions = (block) => {
    let searchFrom = 0
    const mentions = (block.mentions || [])
      .filter((mention) => mention.text)
      .map((mention) => {
        const index = block.text.indexOf(mention.text, searchFrom)
        if (index >= 0) searchFrom = index + mention.text.length
        return { ...mention, index }
      })
      .filter((mention) => mention.index >= 0)
    const parts = []
    let cursor = 0
    mentions.forEach((mention, index) => {
      if (mention.index < cursor) return
      if (mention.index > cursor) parts.push(block.text.slice(cursor, mention.index))
      parts.push(mention.type === 'link' ? (
        <button
          type="button"
          key={`link-${mention.url}-${index}`}
          className="notes-inline-link-mention"
          title={mention.url}
          aria-label={text(`فتح الرابط ${mention.url}`, `Open link ${mention.url}`)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            const openLink = window.waraqaWindow?.openExternalLink
            if (openLink) void openLink(mention.url)
            else window.open(mention.url, '_blank', 'noopener,noreferrer')
          }}
        >
          <Link2 size={13} />
          <span>{(() => { try { return new URL(mention.url).hostname } catch { return mention.url } })()}</span>
          <ExternalLink size={11} />
        </button>
      ) : mention.type === 'file' ? (
        <button
          type="button"
          key={`file-${mention.fileId}-${index}`}
          className="notes-inline-file-mention"
          title={window.waraqaWindow?.revealNoteAttachment
            ? text(`إظهار موقع الملف ${mention.fileName}`, `Show ${mention.fileName} in folder`)
            : text(`تنزيل الملف ${mention.fileName}`, `Download ${mention.fileName}`)}
          aria-label={window.waraqaWindow?.revealNoteAttachment
            ? text(`إظهار موقع الملف ${mention.fileName}`, `Show ${mention.fileName} in folder`)
            : text(`تنزيل الملف ${mention.fileName}`, `Download ${mention.fileName}`)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            revealNoteAttachment(mention)
          }}
        >
          <span className="notes-inline-file-icon"><FileText size={13} /></span>
          <span className="notes-inline-file-name">{mention.fileName}</span>
        </button>
      ) : mention.type === 'task' ? (
        <button
          type="button"
          key={`task-${mention.taskId}-${index}`}
          className="notes-inline-mention notes-inline-task-mention"
          title={text('فتح المهمة', 'Open task')}
          aria-label={text(`فتح المهمة ${mention.taskTitle}`, `Open task ${mention.taskTitle}`)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onOpenMention(mention) }}
        >{mention.taskTitle}</button>
      ) : mention.type === 'note' ? (
        <button type="button" key={`note-${mention.noteId}-${index}`} className="notes-inline-mention notes-inline-note-mention" title={text('فتح الملاحظة', 'Open note')} aria-label={text(`فتح الملاحظة ${mention.noteTitle}`, `Open note ${mention.noteTitle}`)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenMention(mention) }}>{mention.noteTitle}</button>
      ) : mention.type === 'flowchart-node' ? (
        <button
          type="button"
          key={`flowchart-${mention.flowchartId}-${mention.nodeId}-${index}`}
          className="notes-inline-mention notes-inline-flowchart-mention"
          title={mention.flowchartTitle}
          aria-label={text(`فتح الشكل ${mention.nodeTitle} في ${mention.flowchartTitle}`, `Open ${mention.nodeTitle} in ${mention.flowchartTitle}`)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onOpenMention(mention) }}
        >{mention.nodeTitle}</button>
      ) : (
        <button
          type="button"
          key={`${mention.projectId}-${mention.nodeId}-${index}`}
          className="notes-inline-mention"
          title={mention.projectTitle}
          aria-label={text(`فتح العقدة ${mention.nodeTitle} من مشروع ${mention.projectTitle}`, `Open node ${mention.nodeTitle} from project ${mention.projectTitle}`)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onOpenMention(mention)
          }}
        >
          {mention.nodeTitle}
        </button>
      ))
      cursor = mention.index + mention.text.length
    })
    if (cursor < block.text.length) parts.push(block.text.slice(cursor))
    return parts
  }

  const removeEmptyTextBlock = (block) => {
    if (block.text.trim()) return
    onChange(blocks.filter((item) => item.id !== block.id))
    if (selectedBlockId === block.id) onSelectionChange(null)
  }

  const startMovingTextBlock = (event, block) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectionChange(block.id)
    event.currentTarget.setPointerCapture(event.pointerId)
    const layerRect = event.currentTarget.closest('.notes-text-layer').getBoundingClientRect()
    const boxRect = event.currentTarget.closest('.notes-text-box').getBoundingClientRect()
    const otherBoxes = blocks.filter((item) => item.id !== block.id).flatMap((item) => {
      const element = textBoxesRef.current.get(item.id)
      if (!element) return []
      const rect = element.getBoundingClientRect()
      return [{
        x: direction === 'rtl' ? (layerRect.right - rect.right) / layerRect.width : (rect.left - layerRect.left) / layerRect.width,
        y: (rect.top - layerRect.top) / layerRect.height,
        width: rect.width / layerRect.width,
        height: rect.height / layerRect.height,
      }]
    })
    dragRef.current = {
      id: block.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: { x: block.x, y: Math.min(block.y, 0.92) },
      position: { x: block.x, y: Math.min(block.y, 0.92) },
      layerRect,
      boxWidth: boxRect.width / layerRect.width,
      boxHeight: boxRect.height / layerRect.height,
      otherBoxes,
    }
  }

  const moveTextBlock = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const directionMultiplier = direction === 'rtl' ? -1 : 1
    const maxX = Math.max(0, 1 - drag.boxWidth)
    const maxY = Math.max(0, Math.min(0.92, 1 - drag.boxHeight))
    const rawX = Math.max(0, Math.min(maxX, drag.startPosition.x + ((event.clientX - drag.startX) / drag.layerRect.width) * directionMultiplier))
    const rawY = Math.max(0, Math.min(maxY, drag.startPosition.y + (event.clientY - drag.startY) / drag.layerRect.height))
    const stepX = Math.min(1, 24 / drag.layerRect.width)
    const stepY = Math.min(1, 24 / drag.layerRect.height)
    const snapToGrid = (value, max, step) => Math.max(0, Math.min(max, Math.round(value / step) * step))
    const initial = { x: snapToGrid(rawX, maxX, stepX), y: snapToGrid(rawY, maxY, stepY) }
    const gapX = 8 / drag.layerRect.width
    const gapY = 8 / drag.layerRect.height
    const overlapsAnotherBox = (position) => drag.otherBoxes.some((other) => (
      position.x < other.x + other.width + gapX
      && position.x + drag.boxWidth + gapX > other.x
      && position.y < other.y + other.height + gapY
      && position.y + drag.boxHeight + gapY > other.y
    ))
    let position = initial
    if (overlapsAnotherBox(position)) {
      let bestPosition = null
      const maxColumns = Math.ceil(maxX / stepX)
      const maxRows = Math.ceil(maxY / stepY)
      const maxRadius = Math.max(maxColumns, maxRows)
      for (let radius = 1; radius <= maxRadius && !bestPosition; radius += 1) {
        let bestDistance = Infinity
        for (let row = -radius; row <= radius; row += 1) {
          for (let column = -radius; column <= radius; column += 1) {
            if (Math.max(Math.abs(row), Math.abs(column)) !== radius) continue
            const candidate = {
              x: snapToGrid(initial.x + column * stepX, maxX, stepX),
              y: snapToGrid(initial.y + row * stepY, maxY, stepY),
            }
            if (overlapsAnotherBox(candidate)) continue
            const dx = (candidate.x - rawX) * drag.layerRect.width
            const dy = (candidate.y - rawY) * drag.layerRect.height
            const distance = dx * dx + dy * dy
            if (distance < bestDistance) {
              bestPosition = candidate
              bestDistance = distance
            }
          }
        }
      }
      position = bestPosition || drag.position
    }
    drag.position = position
    setDragPosition({ id: drag.id, ...position, snapGuideX: position.x, snapGuideY: position.y })
  }

  const finishMovingTextBlock = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onChange(blocks.map((block) => block.id === drag.id ? { ...block, ...drag.position } : block))
    dragRef.current = null
    setDragPosition(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      className={`notes-text-layer${tool === 'text' ? '' : ' is-inactive'}`}
      aria-label={label}
      dir={direction}
    >
      <div className="notes-text-create-surface" onClick={createTextBlock} />
      {tool === 'text' && blocks.length === 0 && (
        <span className="notes-text-empty-hint">
          {text('اضغط على الورقة لبدء الكتابة', 'Tap the page to start writing')}
        </span>
      )}
      <input
        ref={filePickerRef}
        className="notes-hidden-file-input"
        type="file"
        accept="*/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={addPickedFile}
        onCancel={cancelFilePicker}
      />
      {fileError && <span className="notes-file-error" role="alert">{fileError}</span>}
      {dragPosition?.snapGuideX != null && <span className="notes-snap-guide is-vertical" aria-hidden="true" style={{ [direction === 'rtl' ? 'right' : 'left']: `${dragPosition.snapGuideX * 100}%` }} />}
      {dragPosition?.snapGuideY != null && <span className="notes-snap-guide is-horizontal" aria-hidden="true" style={{ top: `${dragPosition.snapGuideY * 100}%` }} />}
      {blocks.map((block) => {
        const position = dragPosition?.id === block.id ? dragPosition : block
        const isSelected = selectedBlockId === block.id
        return (
          <div
            key={block.id}
            className={`notes-text-box${isSelected ? ' is-selected' : ''}${dragPosition?.id === block.id ? ' is-moving' : ''}`}
            onPointerDown={() => onSelectionChange(block.id)}
            ref={(element) => {
              if (element) textBoxesRef.current.set(block.id, element)
              else textBoxesRef.current.delete(block.id)
            }}
            style={{
              top: `${position.y * 100}%`,
              maxHeight: `calc(100% - ${position.y * 100}%)`,
              width: 'fit-content',
              maxWidth: `min(320px, calc(100% - ${position.x * 100}%))`,
              ...(direction === 'rtl' ? { right: `${position.x * 100}%` } : { left: `${position.x * 100}%` }),
            }}
          >
            {isSelected && <button
              type="button"
              className="notes-text-drag-handle"
              aria-label={direction === 'rtl' ? 'تحريك صندوق النص' : 'Move text box'}
              title={direction === 'rtl' ? 'اسحب لتحريك النص' : 'Drag to move text'}
              onPointerDown={(event) => startMovingTextBlock(event, block)}
              onPointerMove={moveTextBlock}
              onPointerUp={finishMovingTextBlock}
              onPointerCancel={finishMovingTextBlock}
            >
              <GripVertical size={13} />
            </button>}
            {editingBlockId === block.id || touchTextEditing ? <textarea
              ref={(element) => {
                if (element) textareasRef.current.set(block.id, element)
                else textareasRef.current.delete(block.id)
              }}
              className="notes-text-block"
              aria-label={label}
              aria-selected={isSelected}
              dir={direction}
              rows={1}
              inputMode="text"
              enterKeyHint="done"
              autoCapitalize="sentences"
              spellCheck
              style={{ fontSize: `${block.fontSize || 13}px`, maxHeight: '100%' }}
              placeholder={blocks.length === 1 && !block.text ? label : undefined}
              value={block.text}
              onFocus={() => {
                setEditingBlockId(block.id)
                onSelectionChange(block.id)
                if (mentionPicker?.blockId !== block.id) setMentionPicker(null)
              }}
              onBlur={() => {
                if (pendingFileInsertionRef.current?.blockId === block.id) return
                removeEmptyTextBlock(block)
                setMentionPicker((current) => current?.blockId === block.id ? null : current)
                setEditingBlockId((current) => current === block.id ? null : current)
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-keyshortcuts="Control+Shift+F Meta+Shift+F"
              onKeyDown={(event) => handleTextKeyDown(event, block)}
              onChange={(event) => updateTextBlockFromInput(block.id, event.target.value, event.target.selectionStart)}
            /> : <div
              className="notes-text-block notes-text-display"
              role="textbox"
              aria-label={label}
              aria-selected={isSelected}
              dir={direction}
              style={{ fontSize: `${block.fontSize || 13}px`, maxHeight: '100%' }}
              tabIndex={0}
              onClick={() => beginEditingTextBlock(block.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  beginEditingTextBlock(block.id)
                }
              }}
            >
              {block.text ? renderTextWithMentions(block) : blocks.length === 1 ? <span className="notes-text-placeholder">{label}</span> : null}
            </div>}
            {mentionPicker?.blockId === block.id && (
              <div className={`notes-mention-picker${position.y > 0.62 ? ' is-above' : ''}`} role="listbox" aria-label={text('اختيار عنصر للربط', 'Choose an item to mention')} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
                <div className="notes-mention-heading">
                  <strong>{mentionPicker.step === 'type'
                    ? text('اختر نوع العنصر', 'Choose item type')
                    : mentionPicker.step === 'container'
                      ? text(mentionPicker.kind === 'mind-map' ? 'اختر الخريطة' : 'اختر المخطط', mentionPicker.kind === 'mind-map' ? 'Choose a mind map' : 'Choose a flowchart')
                      : text(mentionPicker.kind === 'mind-map' ? 'اختر العقدة' : mentionPicker.kind === 'task' ? 'اختر المهمة' : mentionPicker.kind === 'note' ? 'اختر الملاحظة' : 'اختر الشكل', mentionPicker.kind === 'mind-map' ? 'Choose a node' : mentionPicker.kind === 'task' ? 'Choose a task' : mentionPicker.kind === 'note' ? 'Choose a note' : 'Choose a shape')}</strong>
                  {mentionPicker.step !== 'type' && <button type="button" onClick={goBackMentionPicker}>{text('رجوع', 'Back')}</button>}
                </div>
                <div className="notes-mention-options">
                  {getMentionOptions(mentionPicker).map((option) => <button type="button" role="option" key={option.id} onClick={() => {
                    if (option.optionType === 'type') selectMentionKind(option.id)
                    else if (option.optionType === 'container') selectMentionContainer(option.value)
                    else selectMentionItem(option.value)
                  }}><strong>{option.title}</strong>{option.detail && <small>{option.detail}</small>}</button>)}
                  {!getMentionOptions(mentionPicker).length && <span className="notes-mention-empty">{text('لا توجد نتائج مطابقة', 'No matching results')}</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatUpdatedAt(timestamp, language) {
  return new Date(timestamp).toLocaleString(language === 'en' ? 'en-GB' : 'ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function NotesWorkspace({ language, notes, workspaceId, workspaceTitle, onNotesChange, selectedNoteId, onSelectNote, projects = [], tasks = [], flowcharts = [], noteDocuments = notes, onOpenMention }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [storageError, setStorageError] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageDragActive, setImageDragActive] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState(null)
  const [listCollapsed, setListCollapsed] = useState(() => localStorage.getItem('waraqa-notes-list-collapsed') === 'true')
  const [pagesCollapsed, setPagesCollapsed] = useState(() => localStorage.getItem('waraqa-pages-list-collapsed') === 'true')
  const [pagePosition, setPagePosition] = useState({ noteId: null, index: 0 })
  const [pageScale, setPageScale] = useState(1)
  const [pageZoom, setPageZoom] = useState(1)
  const [activeTool, setActiveTool] = useState('text')
  const [penColor, setPenColor] = useState('#263b32')
  const [penSize, setPenSize] = useState(3)
  const [eraserSize, setEraserSize] = useState(22)
  const [defaultFontSize, setDefaultFontSize] = useState(16)
  const [selectedTextBlockId, setSelectedTextBlockId] = useState(null)
  const notesRef = useRef(notes)
  const pageAreaRef = useRef(null)
  const pageSidebarRef = useRef(null)
  const imagePickerRef = useRef(null)
  const fileMentionActionRef = useRef(null)
  const linkMentionActionRef = useRef(null)
  const registerFileMentionAction = useCallback((action) => {
    fileMentionActionRef.current = action
  }, [])
  const registerLinkMentionAction = useCallback((action) => {
    linkMentionActionRef.current = action
  }, [])
  const workspaceNotes = workspaceId
    ? notes.filter((note) => note.workspaceId === workspaceId)
    : notes
  useLayoutEffect(() => {
    notesRef.current = notes
  }, [notes])
  useLayoutEffect(() => {
    const pageArea = pageAreaRef.current
    if (!pageArea) return undefined

    const updatePageScale = () => {
      const availableWidth = pageArea.clientWidth - 2
      const availableHeight = pageArea.clientHeight - 2
      if (availableWidth <= 0 || availableHeight <= 0) return
      const nextScale = Math.min(1, availableWidth / NOTE_PAGE_WIDTH, availableHeight / NOTE_PAGE_HEIGHT)
      setPageScale((currentScale) => Math.abs(currentScale - nextScale) > 0.001 ? nextScale : currentScale)
    }

    updatePageScale()
    const observer = new ResizeObserver(updatePageScale)
    observer.observe(pageArea)
    if (pageSidebarRef.current) observer.observe(pageSidebarRef.current)
    window.addEventListener('resize', updatePageScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePageScale)
    }
  }, [pagesCollapsed, selectedNoteId])
  const text = (arabic, english) => language === 'en' ? english : arabic
  const currentSelectedId = selectedNoteId || null
  const selectedNote = workspaceNotes.find((note) => note.id === currentSelectedId) || null
  const selectNote = (noteId) => {
    setActiveTool('text')
    setSelectedImageId(null)
    setSelectedTextBlockId(null)
    onSelectNote(noteId)
  }
  const pages = selectedNote?.pages?.length ? selectedNote.pages : ['']
  const pageIndex = pagePosition.noteId === currentSelectedId ? pagePosition.index : 0
  const currentPageIndex = Math.min(pageIndex, pages.length - 1)
  const visiblePageScale = pageScale * pageZoom
  const pageStrokes = Array.isArray(selectedNote?.pageDrawings?.[currentPageIndex])
    ? selectedNote.pageDrawings[currentPageIndex]
    : []
  const pageImages = Array.isArray(selectedNote?.pageImages?.[currentPageIndex])
    ? selectedNote.pageImages[currentPageIndex]
    : []
  const savedPageTextBlocks = selectedNote?.pageTextBlocks?.[currentPageIndex]
  const pageTextBlocks = Array.isArray(savedPageTextBlocks)
    ? savedPageTextBlocks.filter((block) => typeof block.text === 'string'
      && (block.text.trim() || block.id === selectedTextBlockId))
      .map((block) => ({ ...block, y: Math.max(0, Math.min(0.92, Number(block.y) || 0)) }))
    : pages[currentPageIndex]
      ? [{
        id: `legacy-${selectedNote.id}-${currentPageIndex}`,
        text: pages[currentPageIndex],
        x: 0.02,
        y: 0.02,
      }]
      : []
  const selectedTextBlock = pageTextBlocks.find((block) => block.id === selectedTextBlockId) || null
  const filteredNotes = workspaceNotes
    .filter((note) => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()))
    .sort((first, second) => second.updatedAt - first.updatedAt)

  const saveNotes = (nextNotes) => {
    const currentNotes = notesRef.current
    const containsOtherWorkspaces = workspaceId && nextNotes.some((note) => note.workspaceId !== workspaceId)
    const allNotes = workspaceId && !containsOtherWorkspaces
      ? [...currentNotes.filter((note) => note.workspaceId !== workspaceId), ...nextNotes]
      : nextNotes
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(allNotes))
      notesRef.current = allNotes
      setStorageError(false)
    } catch (error) {
      console.error('Could not save notes.', error)
      setStorageError(true)
      return false
    }
    onNotesChange(allNotes)
    return true
  }

  const toggleList = () => {
    setListCollapsed((collapsed) => {
      const next = !collapsed
      try {
        localStorage.setItem('waraqa-notes-list-collapsed', String(next))
      } catch (error) {
        console.error('Could not save the notes list preference.', error)
      }
      return next
    })
  }

  const togglePages = () => {
    setPagesCollapsed((collapsed) => {
      const next = !collapsed
      try {
        localStorage.setItem('waraqa-pages-list-collapsed', String(next))
      } catch (error) {
        console.error('Could not save the pages list preference.', error)
      }
      return next
    })
  }

  const createNote = () => {
    const note = {
      id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: text('ملاحظة جديدة', 'New note'),
      content: '',
      pages: [''],
      ...(workspaceId ? { workspaceId } : {}),
      updatedAt: Date.now(),
    }
    saveNotes([note, ...workspaceNotes])
    selectNote(note.id)
    setSearchQuery('')
  }

  const updateSelectedNote = (changes) => {
    if (!selectedNote) return
    const nextNotes = workspaceNotes.map((note) => note.id === selectedNote.id
      ? { ...note, ...changes, content: changes.pages?.join('\n') ?? note.content, updatedAt: Date.now() }
      : note)
    saveNotes(nextNotes)
  }

  const updateCurrentTextBlocks = (textBlocks) => {
    const pageTextBlocksToSave = Array.from({ length: pages.length }, (_, index) => (
      index === currentPageIndex
        ? textBlocks
        : Array.isArray(selectedNote.pageTextBlocks?.[index])
          ? selectedNote.pageTextBlocks[index]
          : pages[index]
            ? [{ id: `legacy-${selectedNote.id}-${index}`, text: pages[index], x: 0.02, y: 0.02 }]
            : []
    ))
    const nextPages = pageTextBlocksToSave.map((blocks) => blocks.map((block) => block.text).filter(Boolean).join('\n'))
    updateSelectedNote({ pageTextBlocks: pageTextBlocksToSave, pages: nextPages })
  }

  const changeSelectedTextFontSize = (size) => {
    setDefaultFontSize(size)
    if (!selectedTextBlock) return
    updateCurrentTextBlocks(pageTextBlocks.map((block) => (
      block.id === selectedTextBlock.id ? { ...block, fontSize: size } : block
    )))
  }

  const updateCurrentDrawing = (strokes) => {
    const pageDrawings = Array.from({ length: pages.length }, (_, index) => (
      Array.isArray(selectedNote.pageDrawings?.[index]) ? selectedNote.pageDrawings[index] : []
    ))
    pageDrawings[currentPageIndex] = strokes
    updateSelectedNote({ pageDrawings })
  }

  const updateNotePageImages = (noteId, pageIndexForImages, updateImages) => {
    const currentNotes = notesRef.current
    const note = currentNotes.find((item) => item.id === noteId)
    if (!note) return
    const pageImagesToSave = Array.from({ length: note.pages.length }, (_, index) => (
      Array.isArray(note.pageImages?.[index]) ? note.pageImages[index] : []
    ))
    pageImagesToSave[pageIndexForImages] = updateImages(pageImagesToSave[pageIndexForImages] || [])
    const nextNotes = currentNotes.map((item) => item.id === noteId
      ? { ...item, pageImages: pageImagesToSave, updatedAt: Date.now() }
      : item)
    if (!saveNotes(nextNotes)) {
      setImageError(text('تعذر حفظ الصورة. قد تكون مساحة التخزين ممتلئة.', 'Could not save the image. Browser storage may be full.'))
    }
  }

  const addDroppedImages = async (files, position) => {
    setImageError('')
    const validFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!validFiles.length) {
      setImageError(text('اسحب ملف صورة مثل PNG أو JPG إلى الصفحة.', 'Drop an image file such as PNG or JPG onto the page.'))
      return
    }
    const targetNoteId = selectedNote.id
    const targetPageIndex = currentPageIndex
    const droppedImages = []
    for (const [index, file] of validFiles.entries()) {
      try {
        const offset = index * 0.035
        const imagePosition = {
          x: Math.max(0.16, Math.min(0.84, position.x + offset)),
          y: Math.max(0.12, Math.min(0.88, position.y + offset)),
        }
        droppedImages.push(await prepareDroppedImage(file, imagePosition))
      } catch (error) {
        console.error('Could not process dropped image.', error)
        const message = error.message === 'image-too-large'
          ? text('حجم الصورة يتجاوز 20 ميجابايت.', 'Image size exceeds 20 MB.')
          : error.message === 'not-image'
            ? text('الملف ليس صورة مدعومة.', 'The file is not a supported image.')
            : text('تعذر قراءة الصورة أو تجهيزها.', 'Could not read or process the image.')
        setImageError(message)
      }
    }
    if (!droppedImages.length) return
    updateNotePageImages(targetNoteId, targetPageIndex, (images) => [...images, ...droppedImages])
    setSelectedImageId(droppedImages.at(-1).id)
    setActiveTool('pointer')
  }

  const handleImagePickerChange = (event) => {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (files.length) addDroppedImages(files, { x: 0.5, y: 0.5 })
  }

  const handleImageDragOver = (event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setImageDragActive(true)
  }

  const handleImageDrop = (event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    setImageDragActive(false)
    const rect = event.currentTarget.getBoundingClientRect()
    const position = {
      x: Math.max(0.16, Math.min(0.84, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.12, Math.min(0.88, (event.clientY - rect.top) / rect.height)),
    }
    addDroppedImages(Array.from(event.dataTransfer.files), position)
  }

  const selectTool = (tool) => {
    setActiveTool(tool)
  }

  const addPage = () => {
    const pageTitles = Array.from({ length: pages.length }, (_, index) => selectedNote.pageTitles?.[index] || '')
    updateSelectedNote({ pages: [...pages, ''], pageTitles: [...pageTitles, ''] })
    setPagePosition({ noteId: selectedNote.id, index: pages.length })
  }

  const updateCurrentPageTitle = (title) => {
    const pageTitles = Array.from({ length: pages.length }, (_, index) => selectedNote.pageTitles?.[index] || '')
    pageTitles[currentPageIndex] = title
    updateSelectedNote({ pageTitles })
  }

  const deleteNote = () => {
    const nextNotes = workspaceNotes.filter((note) => note.id !== pendingDeleteId)
    saveNotes(nextNotes)
    if (currentSelectedId === pendingDeleteId) selectNote(nextNotes[0]?.id || null)
    setPendingDeleteId(null)
  }

  return (
    <section className="notes-workspace" aria-label={text('مساحة الملاحظات', 'Notes workspace')}>
      <aside className={`notes-list-panel${listCollapsed ? ' is-collapsed' : ''}`}>
        <div className="notes-list-heading">
          <button type="button" className="notes-list-toggle" aria-label={listCollapsed ? text('إظهار قائمة الملاحظات', 'Show workspace list') : text('طي قائمة الملاحظات', 'Collapse workspace list')} title={listCollapsed ? text('إظهار قائمة الملاحظات', 'Show workspace list') : text('طي قائمة الملاحظات', 'Collapse workspace list')} aria-expanded={!listCollapsed} onClick={toggleList}>
            {listCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
          <div>
            <span className="notes-kicker">{text('مساحة العمل', 'Workspace')}</span>
            <h1><StickyNote size={16} />{text('الملاحظات', 'Notes')}</h1>
          </div>
          <button type="button" className="notes-create-button" aria-label={text('إنشاء ملاحظة', 'Create note')} title={text('إنشاء ملاحظة', 'Create note')} onClick={createNote}>
            <Plus size={18} />
          </button>
        </div>
        <div className="notes-list-content" aria-hidden={listCollapsed} inert={listCollapsed}>
        <label className="notes-search">
          <Search size={16} />
          <input
            type="search"
            aria-label={text('البحث في الملاحظات', 'Search notes')}
            placeholder={text('ابحث في الملاحظات...', 'Search notes...')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <div className="notes-list" aria-label={text('قائمة الملاحظات', 'Notes list')}>
          {filteredNotes.map((note) => <div className={`notes-list-row${currentSelectedId === note.id ? ' is-active' : ''}`} key={note.id}>
            <button
              type="button"
              className={`notes-list-item${currentSelectedId === note.id ? ' is-active' : ''}`}
              aria-current={currentSelectedId === note.id ? 'true' : undefined}
              onClick={() => selectNote(note.id)}
            >
              <strong>{note.title || text('بدون عنوان', 'Untitled')}</strong>
              <span>{note.pages.join(' ').trim() || text('لا يوجد محتوى بعد', 'No content yet')}</span>
              <time dateTime={new Date(note.updatedAt).toISOString()}>{formatUpdatedAt(note.updatedAt, language)}</time>
            </button>
            <button type="button" className="notes-list-delete" aria-label={`${text('حذف الملاحظة', 'Delete note')} ${note.title || ''}`} title={text('حذف الملاحظة', 'Delete note')} onClick={() => setPendingDeleteId(note.id)}><Trash2 size={15} /></button>
          </div>)}
          {!filteredNotes.length && (
            <div className="notes-list-empty">
              <StickyNote size={22} />
              <span>{searchQuery ? text('لا توجد نتائج مطابقة.', 'No matching results.') : text('لا توجد ملاحظات بعد.', 'No notes yet.')}</span>
            </div>
          )}
        </div>
        </div>
      </aside>

      <div className="notes-editor">
        <div className="notes-editor-toolbar">
          <div className="notes-editor-actions">
            {selectedNote && <span role={storageError ? 'alert' : undefined}>{storageError ? text('تعذر حفظ التغييرات', 'Could not save changes') : text('تُحفظ التغييرات تلقائيًا', 'Changes are saved automatically')}</span>}
          </div>
          {selectedNote && <div className="notes-tools" role="toolbar" aria-label={text('أدوات الصفحة', 'Page tools')}>
            <button type="button" className={`notes-tool-button${activeTool === 'pointer' ? ' is-active' : ''}`} aria-label={text('الماوس وتحديد الصور', 'Mouse and select images')} aria-pressed={activeTool === 'pointer'} title={text('الماوس وتحديد الصور فقط', 'Mouse: select images only')} onClick={() => selectTool('pointer')}><MousePointer2 size={16} /><span>{text('ماوس', 'Mouse')}</span></button>
            <button type="button" className={`notes-tool-button${activeTool === 'text' ? ' is-active' : ''}`} aria-label={text('الكتابة', 'Text')} aria-pressed={activeTool === 'text'} title={text('الكتابة', 'Text')} onClick={() => selectTool('text')}><Type size={16} /><span>{text('كتابة', 'Text')}</span></button>
            <button type="button" className={`notes-tool-button${activeTool === 'pen' ? ' is-active' : ''}`} aria-label={text('القلم', 'Pen')} aria-pressed={activeTool === 'pen'} title={text('القلم', 'Pen')} onClick={() => selectTool('pen')}><Pencil size={16} /><span>{text('قلم', 'Pen')}</span></button>
            <button type="button" className={`notes-tool-button${activeTool === 'eraser' ? ' is-active' : ''}`} aria-label={text('الممحاة', 'Eraser')} aria-pressed={activeTool === 'eraser'} title={text('الممحاة', 'Eraser')} onClick={() => selectTool('eraser')}><Eraser size={16} /><span>{text('ممحاة', 'Eraser')}</span></button>
            <button type="button" className="notes-tool-button notes-attach-file-button" aria-label={text('إرفاق ملف في النص', 'Insert file mention')} title={text('إرفاق ملف (Ctrl+Shift+F)', 'Insert file (Ctrl+Shift+F)')} onPointerDown={(event) => event.preventDefault()} onClick={() => fileMentionActionRef.current?.()}><Paperclip size={16} /><span>{text('ملف', 'File')}</span></button>
            <button type="button" className="notes-tool-button notes-attach-link-button" aria-label={text('إضافة رابط في النص', 'Insert link')} title={text('إضافة رابط', 'Insert link')} onPointerDown={(event) => event.preventDefault()} onClick={() => linkMentionActionRef.current?.()}><Link2 size={16} /><span>{text('رابط', 'Link')}</span></button>
            <button type="button" className="notes-tool-button notes-add-image-button" aria-label={text('إضافة صورة إلى الصفحة', 'Add image to page')} title={text('إضافة صورة', 'Add image')} onPointerDown={(event) => event.preventDefault()} onClick={() => imagePickerRef.current?.click()}><ImagePlus size={16} /><span>{text('صورة', 'Image')}</span></button>
            {(activeTool === 'text' || activeTool === 'pen' || activeTool === 'eraser') && <>
            <span className="notes-tool-divider" />
            <label className="notes-font-size-control">
              <Type size={14} />
              <select
                aria-label={text('حجم الخط', 'Font size')}
                title={text('حجم الخط', 'Font size')}
                value={selectedTextBlock?.fontSize || (selectedTextBlock ? 13 : defaultFontSize)}
                onChange={(event) => changeSelectedTextFontSize(Number(event.target.value))}
              >
                {[12, 13, 14, 16, 18, 20, 24, 28, 32, 40].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span className="notes-tool-divider" />
            {['#263b32', '#287e63', '#c65245', '#3568a8'].map((color) => (
              <button
                type="button"
                key={color}
                className={`notes-color-button${penColor === color ? ' is-active' : ''}`}
                style={{ '--note-pen-color': color }}
                aria-label={text(`لون القلم ${color}`, `Pen color ${color}`)}
                aria-pressed={penColor === color}
                title={text('لون القلم', 'Pen color')}
                onClick={() => { setPenColor(color); selectTool('pen') }}
              />
            ))}
            <span className="notes-brush-size" title={text('اضغط Ctrl مع عجلة الماوس لتغيير الحجم', 'Ctrl + mouse wheel changes size')}>
              {activeTool === 'eraser' ? eraserSize : penSize}px
            </span>
            <button type="button" className="notes-tool-button notes-clear-drawing" aria-label={text('مسح الرسم من الصفحة', 'Clear drawing on page')} title={text('مسح الرسم من الصفحة', 'Clear drawing on page')} onClick={() => updateCurrentDrawing([])} disabled={!pageStrokes.length}><Trash2 size={15} /></button>
            </>}
          </div>}
          {selectedNote && <button
            type="button"
            className="notes-delete-button"
            aria-label={text('حذف الملاحظة', 'Delete note')}
            title={text('حذف الملاحظة', 'Delete note')}
            onClick={() => setPendingDeleteId(selectedNote.id)}
          >
            <Trash2 size={17} />
          </button>}
        </div>
        {selectedNote ? (
          <>
            <div className="notes-page-area" ref={pageAreaRef}>
              <div className="notes-page-layout">
                <aside ref={pageSidebarRef} className={`notes-pages-sidebar${pagesCollapsed ? ' is-collapsed' : ''}`} aria-label={text('صفحات الملاحظة', 'Note pages')}>
                  <div className="notes-pages-heading">
                      <span className="notes-pages-heading-title">{text('الصفحات', 'Pages')}</span>
                      <button type="button" className="notes-page-add-compact" aria-label={text('إضافة صفحة', 'Add page')} title={text('إضافة صفحة', 'Add page')} onClick={addPage}><Plus size={15} /></button>
                    <button type="button" className="notes-pages-toggle" aria-label={pagesCollapsed ? text('إظهار قائمة الصفحات', 'Expand page list') : text('طي قائمة الصفحات', 'Collapse page list')} title={pagesCollapsed ? text('إظهار قائمة الصفحات', 'Expand page list') : text('طي قائمة الصفحات', 'Collapse page list')} aria-expanded={!pagesCollapsed} onClick={togglePages}>
                      {pagesCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                    </button>
                  </div>
                  <div className="notes-pages-list">
                    {pages.map((_, index) => {
                      const pageTitle = selectedNote.pageTitles?.[index]?.trim()
                      return (
                        <button
                          type="button"
                          key={`${selectedNote.id}-page-${index}`}
                          className={`notes-page-item${index === currentPageIndex ? ' is-active' : ''}`}
                          aria-current={index === currentPageIndex ? 'page' : undefined}
                          onClick={() => setPagePosition({ noteId: selectedNote.id, index })}
                        >
                          <span className="notes-page-item-number">{index + 1}</span>
                          <span className="notes-page-item-title">{pageTitle || `${text('صفحة', 'Page')} ${index + 1}`}</span>
                        </button>
                      )
                    })}
                  </div>
                </aside>
                <div className="notes-page-scale" style={{ width: NOTE_PAGE_WIDTH * visiblePageScale, height: NOTE_PAGE_HEIGHT * visiblePageScale }}>
                <article className="notes-page" style={{ transform: `scale(${visiblePageScale})` }} aria-label={`${text('صفحة', 'Page')} ${currentPageIndex + 1}`}>
                  <input
                    className="standalone-note-title"
                    aria-label={text('عنوان الملاحظة', 'Note title')}
                    placeholder={text('عنوان الملاحظة', 'Note title')}
                    value={selectedNote.title}
                    onChange={(event) => updateSelectedNote({ title: event.target.value })}
                  />
                  <input
                    className="standalone-note-page-title"
                    aria-label={`${text('عنوان الصفحة', 'Page title')} ${currentPageIndex + 1}`}
                    placeholder={text('عنوان الصفحة', 'Page title')}
                    value={selectedNote.pageTitles?.[currentPageIndex] || ''}
                    onChange={(event) => updateCurrentPageTitle(event.target.value)}
                  />
                  <div
                    className={`notes-page-content${imageDragActive ? ' is-image-dragging' : ''}`}
                    onPointerDown={(event) => {
                      if (event.target.closest('.notes-image-item, .notes-text-box')) return
                      setSelectedImageId(null)
                      setSelectedTextBlockId(null)
                    }}
                    onDragEnter={handleImageDragOver}
                    onDragOver={handleImageDragOver}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setImageDragActive(false)
                    }}
                    onDrop={handleImageDrop}
                  >
                    <input
                      ref={imagePickerRef}
                      className="notes-hidden-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={handleImagePickerChange}
                    />
                    <NoteDrawingCanvas
                      strokes={pageStrokes}
                      onChange={updateCurrentDrawing}
                      tool={activeTool}
                      color={penColor}
                      size={activeTool === 'eraser' ? eraserSize : penSize}
                      onSizeChange={(size) => {
                        if (activeTool === 'eraser') setEraserSize(Math.max(6, Math.min(80, size)))
                        else setPenSize(Math.max(1, Math.min(30, size)))
                      }}
                      label={text('طبقة الرسم', 'Drawing layer')}
                    />
                    <NotesImagesLayer
                      className={activeTool === 'pointer' ? '' : 'is-inactive'}
                      images={pageImages}
                      onChange={(updateImages) => updateNotePageImages(selectedNote.id, currentPageIndex, () => updateImages)}
                      onSelect={setSelectedImageId}
                      selectedImageId={selectedImageId}
                      label={text('تحريك الصورة', 'Move image')}
                      direction={language === 'en' ? 'ltr' : 'rtl'}
                    />
                    {imageDragActive && <div className="notes-image-drop-overlay" aria-hidden="true">
                      {text('أفلت الصور هنا', 'Drop images here')}
                    </div>}
                    {imageError && <div className="notes-image-error" role="alert">{imageError}</div>}
                    <NoteTextLayer
                      key={`${selectedNote.id}-${currentPageIndex}-${activeTool}`}
                      blocks={pageTextBlocks}
                      direction={language === 'en' ? 'ltr' : 'rtl'}
                      tool={activeTool}
                      label={text('اكتب ملاحظتك هنا...', 'Write your note here...')}
                      defaultFontSize={defaultFontSize}
                      selectedBlockId={selectedTextBlockId}
                      onSelectionChange={setSelectedTextBlockId}
                      onChange={updateCurrentTextBlocks}
                      registerFileMentionAction={registerFileMentionAction}
                      registerLinkMentionAction={registerLinkMentionAction}
                      projects={projects}
                      tasks={tasks}
                      flowcharts={flowcharts}
                      noteDocuments={noteDocuments}
                      onOpenMention={onOpenMention}
                    />
                  </div>
                </article>
                </div>
              </div>
            </div>
            <nav className="notes-page-navigation" aria-label={text('التنقل بين الصفحات', 'Page navigation')}>
              <div className="notes-page-zoom-controls" role="group" aria-label={text('تكبير وتصغير الورقة', 'Page zoom controls')}>
                <button type="button" className="notes-page-zoom-button" aria-label={text('تصغير الورقة', 'Zoom out')} title={text('تصغير الورقة', 'Zoom out')} onClick={() => setPageZoom((zoom) => Math.max(0.5, Number((zoom / 1.2).toFixed(2))))} disabled={pageZoom <= 0.5}><ZoomOut size={15} /></button>
                <button type="button" className="notes-page-zoom-level" aria-label={text('إعادة ملاءمة الورقة للشاشة', 'Fit page to screen')} title={text('إعادة ملاءمة الورقة للشاشة', 'Fit page to screen')} onClick={() => setPageZoom(1)}>{Math.round(pageZoom * 100)}%</button>
                <button type="button" className="notes-page-zoom-button" aria-label={text('تكبير الورقة', 'Zoom in')} title={text('تكبير الورقة', 'Zoom in')} onClick={() => setPageZoom((zoom) => Math.min(4, Number((zoom * 1.2).toFixed(2))))} disabled={pageZoom >= 4}><ZoomIn size={15} /></button>
              </div>
              <button type="button" className="notes-page-button" onClick={() => setPagePosition({ noteId: selectedNote.id, index: Math.max(0, currentPageIndex - 1) })} disabled={currentPageIndex === 0}>
                <ArrowRight size={16} /> {text('السابقة', 'Previous')}
              </button>
              <span>{text('صفحة', 'Page')} {currentPageIndex + 1} {text('من', 'of')} {pages.length}</span>
              <button type="button" className="notes-page-button" onClick={() => setPagePosition({ noteId: selectedNote.id, index: Math.min(pages.length - 1, currentPageIndex + 1) })} disabled={currentPageIndex >= pages.length - 1}>
                {text('التالية', 'Next')} <ArrowLeft size={16} />
              </button>
              <button type="button" className="notes-add-page-button" onClick={addPage}>
                <Plus size={15} /> {text('إضافة صفحة', 'Add page')}
              </button>
            </nav>
          </>
        ) : (
          <div className="notes-editor-empty">
            <StickyNote size={32} />
            <h2>{searchQuery ? text('لا توجد نتائج', 'No results') : text('ابدأ ملاحظة جديدة', 'Start a new note')}</h2>
            <p>{searchQuery ? text('جرّب البحث بكلمات مختلفة.', 'Try different search terms.') : text('أنشئ ملاحظة مستقلة واحفظ أفكارك هنا.', 'Create a standalone note and save your ideas here.')}</p>
            {!searchQuery && <button type="button" className="notes-create-button" onClick={createNote}><Plus size={17} /> {text('ملاحظة جديدة', 'New note')}</button>}
          </div>
        )}
      </div>

      {pendingDeleteId && (
        <div className="notes-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="notes-delete-title">
          <div>
            <h2 id="notes-delete-title">{text('حذف الملاحظة؟', 'Delete note?')}</h2>
            <p>{text('لن تتمكن من استعادة هذه الملاحظة بعد حذفها.', 'You will not be able to recover this note after deleting it.')}</p>
          </div>
          <button type="button" onClick={() => setPendingDeleteId(null)}>{text('إلغاء', 'Cancel')}</button>
          <button type="button" className="is-danger" onClick={deleteNote}>{text('حذف', 'Delete')}</button>
        </div>
      )}
    </section>
  )
}
