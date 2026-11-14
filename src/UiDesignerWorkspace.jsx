import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { Copy, FileJson, Image, Laptop, Lock, MessageSquareText, Minus, Monitor, MousePointer2, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, RotateCw, Smartphone, Tablet, Trash2, Type, Unlock, X } from 'lucide-react'
import { createWorkspaceArchive } from './workspaceArchive.js'

const id = () => {
  try {
    const value = globalThis.crypto?.randomUUID?.()
    if (value) return value
  } catch (error) {
    console.warn('Secure random IDs are unavailable; using a local fallback.', error)
  }
  return `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
const timestamp = () => Date.now()
const optimizeImage = async (file) => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare image.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}
const types = [
  { id: 'heading', title: ['عنوان', 'Heading'], defaultText: 'عنوان الشاشة' },
  { id: 'text', title: ['نص', 'Text'], defaultText: 'اكتب وصفًا هنا' },
  { id: 'button', title: ['زر', 'Button'], defaultText: 'ابدأ الآن' },
  { id: 'input', title: ['حقل إدخال', 'Input'], defaultText: 'البريد الإلكتروني' },
  { id: 'image', title: ['صورة', 'Image'], defaultText: 'مساحة صورة' },
  { id: 'logo', title: ['شعار', 'Logo'], defaultText: 'شعارك' },
  { id: 'avatar', title: ['صورة شخصية', 'Avatar'], defaultText: 'صورة شخصية' },
  { id: 'card', title: ['بطاقة', 'Card'], defaultText: 'بطاقة محتوى' },
  { id: 'nav', title: ['شريط تنقل', 'Navigation'], defaultText: 'الرئيسية     البحث     حسابي' },
  { id: 'icon', title: ['أيقونة', 'Icon'], defaultText: '✦' },
  { id: 'divider', title: ['فاصل', 'Divider'], defaultText: '' },
  { id: 'badge', title: ['شارة', 'Badge'], defaultText: 'جديد' },
  { id: 'search', title: ['بحث', 'Search'], defaultText: 'ابحث هنا...' },
  { id: 'checkbox', title: ['مربع اختيار', 'Checkbox'], defaultText: 'تذكرني' },
  { id: 'toggle', title: ['مفتاح تبديل', 'Toggle'], defaultText: 'تفعيل الإشعارات' },
  { id: 'video', title: ['مشغل فيديو', 'Video'], defaultText: 'معاينة الفيديو' },
  { id: 'list', title: ['قائمة', 'List'], defaultText: '• العنصر الأول\n• العنصر الثاني\n• العنصر الثالث' },
  { id: 'progress', title: ['شريط تقدم', 'Progress'], defaultText: 'التقدم' },
  { id: 'quote', title: ['اقتباس', 'Quote'], defaultText: 'أضف اقتباسًا ملهمًا هنا' },
  { id: 'price', title: ['سعر', 'Price'], defaultText: '١٢٩ ر.س' },
  { id: 'rating', title: ['تقييم', 'Rating'], defaultText: '★★★★★  4.8' },
  { id: 'breadcrumb', title: ['مسار تنقل', 'Breadcrumb'], defaultText: 'الرئيسية / المنتجات / التفاصيل' },
  { id: 'tabs', title: ['تبويبات', 'Tabs'], defaultText: 'التفاصيل     المراجعات     المواصفات' },
  { id: 'alert', title: ['تنبيه', 'Alert'], defaultText: 'تم الحفظ بنجاح' },
]
const elementDefaults = {
  heading: { fontSize: 26, fontWeight: 700, textAlign: 'start', borderWidth: 0 },
  text: { fontSize: 15, textAlign: 'start', borderWidth: 0 },
  button: { fontSize: 15, fontWeight: 650, buttonStyle: 'primary', borderRadius: 10, borderWidth: 0 },
  input: { fontSize: 13, borderRadius: 9, borderWidth: 1, borderColor: '#d9e0db' },
  image: { objectFit: 'cover', borderRadius: 9 },
  logo: { objectFit: 'contain', borderRadius: 8 },
  avatar: { objectFit: 'cover', borderRadius: 999 },
  card: { fontSize: 14, textAlign: 'start', borderRadius: 12, shadow: 'soft' },
  nav: { fontSize: 12, borderRadius: 12 },
  icon: { fontSize: 28, textAlign: 'center', borderWidth: 0 },
  divider: { height: 2, background: '#dce5de', borderWidth: 0 },
  badge: { fontSize: 12, fontWeight: 650, borderRadius: 999, background: '#e7f3eb', color: '#287d5b' },
  search: { fontSize: 13, borderRadius: 10, borderWidth: 1, borderColor: '#d9e0db' },
  checkbox: { fontSize: 13, textAlign: 'start', background: 'transparent', borderWidth: 0 },
  toggle: { fontSize: 13, textAlign: 'start', background: 'transparent', borderWidth: 0 },
  video: { fontSize: 13, borderRadius: 12, background: '#26372d', color: '#ffffff' },
  list: { fontSize: 13, textAlign: 'start', background: 'transparent', borderWidth: 0 },
  progress: { fontSize: 12, textAlign: 'start', background: '#e5eee7', borderRadius: 999 },
  quote: { fontSize: 16, textAlign: 'start', background: '#f3f7f4', borderRadius: 10, borderWidth: 0 },
  price: { fontSize: 24, fontWeight: 700, color: '#287d5b', background: 'transparent', borderWidth: 0 },
  rating: { fontSize: 15, fontWeight: 650, color: '#c58b23', background: 'transparent', borderWidth: 0 },
  breadcrumb: { fontSize: 11, color: '#748279', background: 'transparent', borderWidth: 0 },
  tabs: { fontSize: 12, borderRadius: 8, borderWidth: 0 },
  alert: { fontSize: 13, textAlign: 'start', background: '#eaf5ed', color: '#287956', borderColor: '#b8d9c1', borderRadius: 9 },
}
const getElementStyle = (item, scaleX, scaleY) => {
  const defaults = elementDefaults[item.type] || {}
  const borderWidth = item.borderWidth ?? defaults.borderWidth ?? 1
  const fontSize = item.fontSize ?? defaults.fontSize ?? 15
  return {
    boxSizing: 'border-box',
    left: `${item.x * scaleX}px`,
    top: `${item.y * scaleY}px`,
    width: `${item.width * scaleX}px`,
    height: `${item.height * scaleY}px`,
    color: item.color || defaults.color || '#34443a',
    background: item.background ?? defaults.background ?? 'transparent',
    fontSize: `${Math.min(64, Math.max(8, fontSize * Math.min(scaleX, scaleY)))}px`,
    fontWeight: item.fontWeight ?? defaults.fontWeight ?? 500,
    fontFamily: item.fontFamily || 'IBM Plex Sans Arabic, sans-serif',
    textAlign: item.textAlign || defaults.textAlign || 'center',
    lineHeight: item.lineHeight ?? 1.35,
    letterSpacing: `${item.letterSpacing ?? 0}px`,
    textDecoration: item.textDecoration || 'none',
    textTransform: item.textTransform || 'none',
    border: borderWidth ? `${borderWidth}px ${item.borderStyle || 'solid'} ${item.borderColor || defaults.borderColor || '#d5ddd7'}` : 'none',
    borderRadius: `${item.borderRadius ?? defaults.borderRadius ?? 8}px`,
    opacity: item.opacity ?? 1,
    boxShadow: item.shadow === 'soft' || (!item.shadow && defaults.shadow === 'soft') ? '0 4px 14px #1f33251c' : item.shadow === 'medium' ? '0 8px 24px #1f33252e' : 'none',
    padding: `${item.padding ?? 8}px`,
    transform: `rotate(${item.rotation || 0}deg)`,
    zIndex: item.zIndex || 1,
  }
}
const makeScreen = (title, width, height, background = '#f7f8fa') => ({ id: id(), title, width, height, background, components: [] })
const makeDefaultViewports = (screen) => [
  { id: 'phone', name: 'هاتف', device: 'phone', width: 390, height: 844, locked: false },
  { id: 'tablet', name: 'جهاز لوحي', device: 'tablet', width: 820, height: 1080, locked: false },
  { id: 'desktop', name: 'كمبيوتر', device: 'desktop', width: 1280, height: 800, locked: false },
  { id: 'screen', name: 'مقاس التصميم', device: 'screen', width: screen?.width || 390, height: screen?.height || 844, locked: false },
]

function ExportElement({ item, childrenByParent, scaleX, scaleY }) {
  const children = childrenByParent.get(item.id) || []
  let content
  if (['image', 'logo', 'avatar'].includes(item.type) && item.imageData) {
    content = <img src={item.imageData} alt={item.text || ''} style={{ objectFit: item.objectFit || 'cover' }} />
  } else if (item.type === 'input' || item.type === 'search') {
    content = <span className="ui-input-placeholder">{item.type === 'search' ? `?  ${item.text || ''}` : item.text}</span>
  } else if (item.type === 'checkbox') {
    content = <><span className="ui-checkbox-mark">{'\u2713'}</span><span>{item.text}</span></>
  } else if (item.type === 'toggle') {
    content = <><span>{item.text}</span><span className="ui-toggle-mark"><i /></span></>
  } else if (item.type === 'button' || item.type === 'nav' || item.type === 'tabs' || item.type === 'breadcrumb') {
    content = <span>{item.text}</span>
  } else if (item.type === 'video') {
    content = <><span className="ui-video-play"><Play size={15} /></span><span>{item.text}</span></>
  } else if (item.type === 'progress') {
    content = <><span>{item.text}</span><span className="ui-progress-track"><i style={{ width: `${Math.min(100, Math.max(0, item.progress ?? 68))}%` }} /></span></>
  } else if (item.type === 'divider') {
    content = null
  } else if (['image', 'logo', 'avatar'].includes(item.type)) {
    content = <span className="ui-asset-placeholder">{item.type === 'logo' ? '\u0634\u0639\u0627\u0631' : item.type === 'avatar' ? '\u0635\u0648\u0631\u0629' : item.text}</span>
  } else {
    content = <span>{item.text}</span>
  }
  return <div data-element-id={item.id} className={`ui-canvas-element ui-element-${item.type}${children.length ? ' ui-element-container' : ''}${item.type === 'button' ? ` button-style-${item.buttonStyle || 'primary'}` : ''}`} style={getElementStyle(item, scaleX, scaleY)}>
    {content}
    {children.map((child) => <ExportElement key={child.id} item={child} childrenByParent={childrenByParent} scaleX={scaleX} scaleY={scaleY} />)}
  </div>
}

function ExportScreenCanvas({ screen, components, width, height, scaleX, scaleY, direction }) {
  const childrenByParent = new Map()
  components.forEach((item) => {
    if (!item.parentId) return
    if (!childrenByParent.has(item.parentId)) childrenByParent.set(item.parentId, [])
    childrenByParent.get(item.parentId).push(item)
  })
  const componentIds = new Set(components.map((item) => item.id))
  const roots = components.filter((item) => !item.parentId || !componentIds.has(item.parentId))
  return <div className="ui-screen-canvas" dir={direction} style={{ width: `${width}px`, height: `${height}px`, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', background: screen.background || '#ffffff' }}>
    {roots.map((item) => <ExportElement key={item.id} item={item} childrenByParent={childrenByParent} scaleX={scaleX} scaleY={scaleY} />)}
  </div>
}

export async function createDesignPreviews(designs, orientationByViewport = {}, language = 'ar', selection = {}) {
  const previews = []
  let host
  let reactRoot
  try {
    await document.fonts?.ready
    host = document.createElement('div')
    host.dir = language === 'en' ? 'ltr' : 'rtl'
    Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', zIndex: '-1', overflow: 'hidden' })
    document.body.append(host)
    const mount = document.createElement('div')
    host.append(mount)
    reactRoot = createRoot(mount)
    for (const design of designs || []) {
      const exportViewports = design.viewports?.length ? design.viewports : makeDefaultViewports(design.screens?.[0])
      const exportScreens = (design.screens || []).filter((item) => !selection.screenId || item.id === selection.screenId)
      for (const screenItem of exportScreens) {
        for (const viewport of exportViewports.filter((item) => !selection.viewportId || item.id === selection.viewportId)) {
          const landscape = Boolean(orientationByViewport[viewport.id] || viewport.orientation === 'landscape') && ['phone', 'tablet'].includes(viewport.device)
          const width = landscape ? viewport.height : viewport.width
          const height = landscape ? viewport.width : viewport.height
          const contentHeight = screenItem.scrollEnabled ? Math.round(height * (screenItem.scrollLengthPercent || 100) / 100) : height
          const locked = Boolean(viewport.locked && screenItem.viewportLayouts?.[viewport.id])
          const components = locked ? screenItem.viewportLayouts[viewport.id] : screenItem.components || []
          const layoutWidth = locked ? width : screenItem.width || width
          const layoutHeight = locked ? height : screenItem.height || height
          const scaleX = width / layoutWidth
          const scaleY = height / layoutHeight
          flushSync(() => reactRoot.render(<ExportScreenCanvas screen={screenItem} components={components} width={width} height={contentHeight} scaleX={scaleX} scaleY={scaleY} direction={host.dir} />))
          const root = mount.querySelector('.ui-screen-canvas')
          if (!root) throw new Error('Could not render the interface preview.')
          await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)))
          await new Promise((resolve) => window.requestAnimationFrame(resolve))
          const png = await toPng(root, { pixelRatio: 1, cacheBust: true })
          const data = await (await fetch(png)).blob()
          previews.push({ designId: design.id, screenId: screenItem.id, viewportId: viewport.id, viewportName: viewport.name || viewport.device, orientation: landscape ? 'landscape' : 'portrait', viewportWidth: width, viewportHeight: height, width, height: contentHeight, pixelRatio: 1, textDirection: host.dir, data })
        }
      }
    }
    return previews
  } finally {
    reactRoot?.unmount()
    host?.remove()
  }
}

const templates = [
  { id: 'blank', title: ['فارغ', 'Blank'], create: () => [makeScreen('الشاشة الرئيسية', 390, 844)] },
  { id: 'mobile-app', title: ['تطبيق جوال', 'Mobile app'], create: () => {
    const home = makeScreen('الرئيسية', 390, 844)
    home.components = [
      { id: id(), type: 'heading', x: 24, y: 42, width: 320, height: 54, text: 'أهلاً بك 👋', color: '#1f2937', background: 'transparent' },
      { id: id(), type: 'text', x: 24, y: 103, width: 330, height: 48, text: 'اكتشف محتوى جديدًا يناسبك اليوم', color: '#657184', background: 'transparent' },
      { id: id(), type: 'image', x: 24, y: 174, width: 342, height: 205, text: 'صورة مميزة', color: '#526071', background: '#e4eaf2' },
      { id: id(), type: 'heading', x: 24, y: 412, width: 300, height: 40, text: 'مقترح لك', color: '#1f2937', background: 'transparent' },
      { id: id(), type: 'card', x: 24, y: 463, width: 342, height: 116, text: 'عنوان العنصر\nوصف قصير للمحتوى', color: '#334155', background: '#ffffff' },
      { id: id(), type: 'button', x: 24, y: 744, width: 342, height: 54, text: 'استكشف الآن', color: '#ffffff', background: '#287d5b' },
      { id: id(), type: 'nav', x: 24, y: 670, width: 342, height: 52, text: 'الرئيسية       اكتشف       حسابي', color: '#526071', background: '#ffffff' },
    ]
    const login = makeScreen('تسجيل الدخول', 390, 844)
    login.components = [
      { id: id(), type: 'heading', x: 24, y: 120, width: 342, height: 55, text: 'مرحبًا بعودتك', color: '#1f2937', background: 'transparent' },
      { id: id(), type: 'text', x: 24, y: 178, width: 342, height: 48, text: 'سجّل الدخول للمتابعة', color: '#657184', background: 'transparent' },
      { id: id(), type: 'input', x: 24, y: 276, width: 342, height: 54, text: 'البريد الإلكتروني', color: '#657184', background: '#ffffff' },
      { id: id(), type: 'input', x: 24, y: 344, width: 342, height: 54, text: 'كلمة المرور', color: '#657184', background: '#ffffff' },
      { id: id(), type: 'button', x: 24, y: 430, width: 342, height: 54, text: 'تسجيل الدخول', color: '#ffffff', background: '#287d5b' },
    ]
    return [home, login]
  } },
  { id: 'store', title: ['متجر إلكتروني', 'Online store'], create: () => {
    const home = makeScreen('المتجر', 390, 844)
    home.components = [
      { id: id(), type: 'heading', x: 22, y: 28, width: 346, height: 50, text: 'متجري', color: '#17251e', background: 'transparent' },
      { id: id(), type: 'input', x: 22, y: 91, width: 346, height: 48, text: 'ابحث عن منتج', color: '#718078', background: '#ffffff' },
      { id: id(), type: 'heading', x: 22, y: 165, width: 346, height: 42, text: 'منتجات مختارة', color: '#17251e', background: 'transparent' },
      { id: id(), type: 'image', x: 22, y: 219, width: 164, height: 158, text: 'صورة المنتج', color: '#526071', background: '#e8eee9' },
      { id: id(), type: 'image', x: 202, y: 219, width: 166, height: 158, text: 'صورة المنتج', color: '#526071', background: '#e8eee9' },
      { id: id(), type: 'card', x: 22, y: 390, width: 164, height: 80, text: 'منتج مميز\n١٢٥ ر.س', color: '#26372d', background: '#ffffff' },
      { id: id(), type: 'card', x: 202, y: 390, width: 166, height: 80, text: 'منتج جديد\n٨٥ ر.س', color: '#26372d', background: '#ffffff' },
    ]
    return [home, makeScreen('تفاصيل المنتج', 390, 844)]
  } },
  { id: 'portfolio', title: ['ملف أعمال', 'Portfolio'], create: () => {
    const home = makeScreen('ملف الأعمال', 1280, 800, '#ffffff')
    home.components = [
      { id: id(), type: 'nav', x: 48, y: 24, width: 1184, height: 60, text: 'اسمي                 الأعمال                 نبذة                 تواصل', color: '#34443a', background: '#f7f8f7' },
      { id: id(), type: 'heading', x: 100, y: 175, width: 650, height: 100, text: 'أصمم تجارب رقمية\nتترك أثرًا', color: '#1c2d23', background: 'transparent' },
      { id: id(), type: 'text', x: 100, y: 293, width: 540, height: 70, text: 'مصمم واجهات أساعد الفرق على تحويل الأفكار إلى منتجات واضحة وسهلة الاستخدام.', color: '#647168', background: 'transparent' },
      { id: id(), type: 'button', x: 100, y: 397, width: 185, height: 52, text: 'شاهد أعمالي', color: '#ffffff', background: '#287d5b' },
      { id: id(), type: 'image', x: 825, y: 155, width: 330, height: 330, text: 'صورتك أو عملك', color: '#526071', background: '#e6eee8' },
    ]
    return [home, makeScreen('تفاصيل المشروع', 1280, 800, '#ffffff')]
  } },
]

export default function UiDesignerWorkspace({ language, workspaceId, designs, selectedDesignId, onSelectedDesignChange, onDesignsChange }) {
  const en = language === 'en'
  const t = (ar, english) => en ? english : ar
  const [selectedScreenId, setSelectedScreenId] = useState(null)
  const [selectedElementId, setSelectedElementId] = useState(null)
  const [containerTargetId, setContainerTargetId] = useState(null)
  const [selectedViewportIds, setSelectedViewportIds] = useState({})
  const [deviceOrientations, setDeviceOrientations] = useState({})
  const [screenSizeDraft, setScreenSizeDraft] = useState({})
  const [scrollLengthDraft, setScrollLengthDraft] = useState({})
  const [preview, setPreview] = useState(false)
  const [previewStates, setPreviewStates] = useState({})
  const [previewActiveId, setPreviewActiveId] = useState(null)
  const [exportingProject, setExportingProject] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [elementsOpen, setElementsOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 })
  const canvasAreaRef = useRef(null)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const design = designs.find((item) => item.id === selectedDesignId) || designs[0] || null
  const viewports = design?.viewports?.length ? design.viewports : makeDefaultViewports(design?.screens?.[0])
  const screen = design?.screens.find((item) => item.id === selectedScreenId) || design?.screens.find((item) => item.id === design.activeScreenId) || design?.screens[0] || null
  const activeViewport = viewports.find((item) => item.id === selectedViewportIds[design?.id]) || viewports.find((item) => item.id === design?.activeViewportId) || viewports.find((item) => item.device === (screen?.width >= 1000 ? 'screen' : screen?.width >= 600 ? 'tablet' : 'phone')) || viewports[0]
  const device = activeViewport?.device || 'phone'
  const isLandscape = Boolean(deviceOrientations[activeViewport?.id]) && (device === 'phone' || device === 'tablet')
  const portraitWidth = activeViewport?.width || 390
  const portraitHeight = activeViewport?.height || 844
  const canvasWidth = isLandscape ? portraitHeight : portraitWidth
  const canvasHeight = isLandscape ? portraitWidth : portraitHeight
  const contentCanvasHeight = screen?.scrollEnabled ? Math.round(canvasHeight * (screen.scrollLengthPercent || 100) / 100) : canvasHeight
  const layoutWidth = activeViewport?.locked ? (isLandscape ? activeViewport.height : activeViewport.width) : (screen?.width || canvasWidth)
  const layoutHeight = activeViewport?.locked ? (isLandscape ? activeViewport.width : activeViewport.height) : (screen?.height || canvasHeight)
  const viewportLayout = activeViewport?.locked ? screen?.viewportLayouts?.[activeViewport.id] : null
  const layoutComponents = viewportLayout || screen?.components || []
  const element = layoutComponents.find((item) => item.id === selectedElementId) || null
  const designScaleX = canvasWidth / layoutWidth
  const designScaleY = canvasHeight / layoutHeight
  const editableHeight = contentCanvasHeight / designScaleY
  useEffect(() => {
    const area = canvasAreaRef.current
    if (!area) return undefined
    let frame = 0
    let secondFrame = 0
    const measure = () => {
      const rect = area.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setCanvasViewport((current) => current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height })
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    measure()
    frame = window.requestAnimationFrame(() => {
      measure()
      secondFrame = window.requestAnimationFrame(measure)
    })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [design?.id, screen?.id, activeViewport?.id, preview, sidebarOpen, elementsOpen, inspectorOpen])
  const canvasFitScale = Math.min(1, Math.max(0.1, (canvasViewport.height - 32) / canvasHeight), Math.max(0.1, (canvasViewport.width - 32) / canvasWidth))
  const canvasScale = canvasFitScale * canvasZoom
  const canvasFrameStyle = { width: canvasWidth * canvasScale, height: contentCanvasHeight * canvasScale }
  const canvasStyle = { width: canvasWidth, height: contentCanvasHeight, background: screen?.background || '#ffffff', transform: `scale(${canvasScale})`, transformOrigin: 'top left' }
  const updateDesign = (transform) => {
    if (!design) return
    onDesignsChange(designs.map((item) => item.id === design.id ? { ...transform(item), updatedAt: Date.now() } : item))
  }
  const selectViewport = (viewport) => {
    if (!design || !viewport) return
    setSelectedViewportIds((current) => ({ ...current, [design.id]: viewport.id }))
    setSelectedElementId(null); setContainerTargetId(null)
    updateDesign((current) => ({ ...current, activeViewportId: viewport.id }))
  }
  const setDevice = (value) => {
    const viewport = viewports.find((item) => item.device === value)
    if (viewport) selectViewport(viewport)
  }
  const addViewport = () => {
    const width = Number(window.prompt(t('عرض المقاس الجديد بالبكسل', 'New viewport width in pixels'), '1024'))
    if (!Number.isFinite(width) || width < 240) return
    const height = Number(window.prompt(t('ارتفاع المقاس الجديد بالبكسل', 'New viewport height in pixels'), '768'))
    if (!Number.isFinite(height) || height < 320) return
    const viewport = { id: id(), name: `${width} × ${height}`, device: 'custom', width: Math.round(width), height: Math.round(height), locked: false }
    updateDesign((current) => ({ ...current, viewports: [...(current.viewports?.length ? current.viewports : viewports), viewport], activeViewportId: viewport.id }))
    setSelectedViewportIds((current) => ({ ...current, [design.id]: viewport.id }))
    setSelectedElementId(null); setContainerTargetId(null)
  }
  const editViewport = (viewport) => {
    const width = Number(window.prompt(t('عرض المقاس بالبكسل', 'Viewport width in pixels'), String(viewport.width)))
    if (!Number.isFinite(width) || width < 240) return
    const height = Number(window.prompt(t('ارتفاع المقاس بالبكسل', 'Viewport height in pixels'), String(viewport.height)))
    if (!Number.isFinite(height) || height < 320) return
    const nextWidth = Math.round(width)
    const nextHeight = Math.round(height)
    const scaleX = nextWidth / viewport.width
    const scaleY = nextHeight / viewport.height
    updateDesign((current) => ({
      ...current,
      viewports: (current.viewports || viewports).map((item) => item.id === viewport.id ? { ...item, width: nextWidth, height: nextHeight, name: `${nextWidth} × ${nextHeight}` } : item),
      screens: viewport.locked ? current.screens.map((screenItem) => ({
        ...screenItem,
        viewportLayouts: screenItem.viewportLayouts?.[viewport.id]
          ? { ...screenItem.viewportLayouts, [viewport.id]: screenItem.viewportLayouts[viewport.id].map((component) => ({
            ...component,
            x: Math.round(component.x * scaleX), y: Math.round(component.y * scaleY),
            width: Math.round(component.width * scaleX), height: Math.round(component.height * scaleY),
            fontSize: component.fontSize ? Math.round(component.fontSize * Math.min(scaleX, scaleY)) : component.fontSize,
          })) }
          : screenItem.viewportLayouts,
      })) : current.screens,
    }))
  }
  const toggleViewportLock = () => {
    if (!design || !activeViewport) return
    const locking = !activeViewport.locked
    const nextViewports = viewports.map((item) => item.id === activeViewport.id ? { ...item, locked: locking } : item)
    updateDesign((current) => ({
      ...current,
      viewports: nextViewports,
      screens: locking
        ? current.screens.map((item) => {
          const viewportWidth = isLandscape ? activeViewport.height : activeViewport.width
          const viewportHeight = isLandscape ? activeViewport.width : activeViewport.height
          const scaleX = viewportWidth / (item.width || viewportWidth)
          const scaleY = viewportHeight / (item.height || viewportHeight)
          const viewportComponents = (item.components || []).map((component) => ({ ...component, x: Math.round(component.x * scaleX), y: Math.round(component.y * scaleY), width: Math.round(component.width * scaleX), height: Math.round(component.height * scaleY) }))
          return { ...item, viewportLayouts: { ...(item.viewportLayouts || {}), [activeViewport.id]: viewportComponents } }
        })
        : current.screens,
    }))
  }
  const updateCurrentComponents = (components) => {
    if (!screen) return
    if (activeViewport?.locked) updateScreen(screen.id, { viewportLayouts: { ...(screen.viewportLayouts || {}), [activeViewport.id]: components } })
    else updateScreen(screen.id, { components })
  }
  const removeViewport = (viewport) => {
    if (!design || viewport.device !== 'custom' || viewports.length <= 1) return
    const nextViewports = viewports.filter((item) => item.id !== viewport.id)
    updateDesign((current) => ({ ...current, viewports: nextViewports, activeViewportId: current.activeViewportId === viewport.id ? nextViewports[0].id : current.activeViewportId, screens: current.screens.map((item) => { const viewportLayouts = { ...(item.viewportLayouts || {}) }; delete viewportLayouts[viewport.id]; return { ...item, viewportLayouts } }) }))
    if (selectedViewportIds[design.id] === viewport.id) setSelectedViewportIds((current) => ({ ...current, [design.id]: nextViewports[0].id }))
  }
  const createDesign = (templateId) => {
    const template = templates.find((item) => item.id === templateId) || templates[0]
    const screens = template.create()
    const createdAt = timestamp()
    const next = { id: id(), workspaceId, title: template.id === 'blank' ? t('تصميم واجهات جديد', 'New interface design') : template.title[en ? 1 : 0], screens, viewports: makeDefaultViewports(screens[0]), activeScreenId: screens[0]?.id, notes: '', createdAt, updatedAt: createdAt }
    onDesignsChange([next, ...designs])
    onSelectedDesignChange(next.id)
    setSelectedScreenId(screens[0]?.id || null)
    setSelectedElementId(null); setContainerTargetId(null)
    setPreview(false)
  }
  const addTemplatePages = (templateId) => {
    if (!design) return createDesign(templateId)
    const template = templates.find((item) => item.id === templateId) || templates[0]
    const pages = template.create().map((page) => {
      const viewportLayouts = Object.fromEntries(viewports.filter((viewport) => viewport.locked).map((viewport) => {
        const landscape = Boolean(deviceOrientations[viewport.id]) && (viewport.device === 'phone' || viewport.device === 'tablet')
        const targetWidth = landscape ? viewport.height : viewport.width
        const targetHeight = landscape ? viewport.width : viewport.height
        const scaleX = targetWidth / (page.width || targetWidth)
        const scaleY = targetHeight / (page.height || targetHeight)
        const components = page.components.map((component) => ({
          ...component,
          x: Math.round(component.x * scaleX), y: Math.round(component.y * scaleY),
          width: Math.round(component.width * scaleX), height: Math.round(component.height * scaleY),
        }))
        return [viewport.id, components]
      }))
      return { ...page, viewportLayouts: Object.keys(viewportLayouts).length ? viewportLayouts : page.viewportLayouts }
    })
    updateDesign((current) => ({ ...current, screens: [...current.screens, ...pages], activeScreenId: pages[0]?.id || current.activeScreenId }))
    if (pages[0]) setSelectedScreenId(pages[0].id)
    setSelectedElementId(null); setContainerTargetId(null)
    setPreview(false)
  }
  const createScreen = () => {
    if (!design) return
    const nextScreen = makeScreen(t('شاشة جديدة', 'New screen'), screen?.width || 390, screen?.height || 844)
    updateDesign((item) => ({ ...item, screens: [...item.screens, nextScreen], activeScreenId: nextScreen.id }))
    setSelectedScreenId(nextScreen.id)
    setSelectedElementId(null); setContainerTargetId(null)
  }
  const updateScreen = (screenId, changes) => updateDesign((item) => ({ ...item, screens: item.screens.map((entry) => entry.id === screenId ? { ...entry, ...changes } : entry) }))
  const currentScreenSizeDraft = screen ? screenSizeDraft[screen.id] || { width: String(screen.width), height: String(screen.height) } : { width: '', height: '' }
  const currentScrollLengthDraft = screen ? scrollLengthDraft[screen.id] ?? String(screen.scrollLengthPercent || 100) : '100'
  const changeScrollLengthDraft = (value) => screen && setScrollLengthDraft((current) => ({ ...current, [screen.id]: value }))
  const commitScrollLength = () => {
    if (!screen) return
    const value = Number(currentScrollLengthDraft)
    updateScreen(screen.id, { scrollLengthPercent: Math.min(10000, Math.max(100, Number.isFinite(value) && value ? value : 100)) })
    setScrollLengthDraft((current) => { const next = { ...current }; delete next[screen.id]; return next })
  }
  const changeScreenSizeDraft = (field, value) => screen && setScreenSizeDraft((current) => ({ ...current, [screen.id]: { ...(current[screen.id] || { width: String(screen.width), height: String(screen.height) }), [field]: value } }))
  const commitScreenSize = (field) => {
    if (!screen) return
    const minimum = field === 'width' ? 240 : 320
    const value = Number(currentScreenSizeDraft[field])
    const nextValue = Math.max(minimum, Number.isFinite(value) && value ? value : screen[field])
    updateDesign((current) => ({
      ...current,
      screens: current.screens.map((item) => item.id === screen.id ? { ...item, [field]: nextValue } : item),
      viewports: (current.viewports?.length ? current.viewports : viewports).map((item) => item.id === 'screen' && !item.locked ? { ...item, [field]: nextValue } : item),
    }))
    setScreenSizeDraft((current) => { const next = { ...current }; delete next[screen.id]; return next })
  }
  const updateElement = (elementId, changes) => {
    if (!screen) return
    updateCurrentComponents(layoutComponents.map((item) => item.id === elementId ? { ...item, ...changes } : item))
  }
  const addElement = (type) => {
    if (!screen) return
    const item = types.find((entry) => entry.id === type)
    const designWidth = layoutWidth || canvasWidth
    const designHeight = editableHeight || canvasHeight
    const container = layoutComponents.find((entry) => entry.id === containerTargetId) || layoutComponents.find((entry) => entry.id === selectedElementId)
    const containerWidth = container ? Math.max(44, container.width - 24) : designWidth
    const containerHeight = container ? Math.max(32, container.height - 24) : designHeight
    const componentWidth = Math.min(({ image: 220, heading: 270, logo: 130, avatar: 72, icon: 58, divider: 220, badge: 105, search: 230, checkbox: 180, toggle: 200, video: 220, list: 230, progress: 220, quote: 300, price: 145, rating: 160, alert: 240 })[type] || 210, Math.max(44, containerWidth))
    const componentHeight = Math.min(({ image: 140, heading: 64, logo: 54, avatar: 72, icon: 58, divider: 2, badge: 34, search: 46, checkbox: 42, toggle: 42, video: 132, list: 92, progress: 44, quote: 82, price: 48, rating: 38, alert: 52 })[type] || (type === 'text' ? 56 : 48), Math.max(32, containerHeight))
    const containerChildren = container ? layoutComponents.filter((entry) => entry.parentId === container.id) : []
    const childY = 12 + containerChildren.reduce((height, entry) => Math.max(height, entry.y + entry.height + 8), 0)
    const component = {
      id: id(), type,
      x: container ? 12 : Math.max(12, Math.round((designWidth - componentWidth) / 2)),
      y: container ? childY : Math.max(16, Math.round((designHeight - componentHeight) / 2)),
      ...(container ? { parentId: container.id } : {}),
      width: componentWidth, height: componentHeight, text: item.defaultText,
      color: type === 'button' || type === 'video' ? '#ffffff' : '#34443a',
      background: type === 'button' ? '#287d5b' : ['input', 'card', 'search'].includes(type) ? '#ffffff' : type === 'image' || type === 'avatar' ? '#e6eee8' : type === 'video' ? '#26372d' : type === 'alert' ? '#eaf5ed' : 'transparent',
      fontSize: 15, fontWeight: 500, fontFamily: 'IBM Plex Sans Arabic, sans-serif', textAlign: 'center', lineHeight: 1.35, letterSpacing: 0,
      textDecoration: 'none', textTransform: 'none', borderColor: '#d5ddd7', borderWidth: 1, borderStyle: 'solid', borderRadius: 8,
      opacity: 1, shadow: 'none', padding: 8, rotation: 0, zIndex: 1, objectFit: 'cover',
      ...elementDefaults[type],
    }
    const nextComponents = [...layoutComponents, component].map((entry) => entry.id === container?.id ? { ...entry, width: Math.max(entry.width, component.x + component.width + 12), height: Math.max(entry.height, component.y + component.height + 12) } : entry)
    updateCurrentComponents(nextComponents)
    if (container) setContainerTargetId(container.id)
    setSelectedElementId(component.id)
  }
  const deleteScreen = (screenId) => {
    if (!design || design.screens.length < 2) return
    const next = design.screens.filter((item) => item.id !== screenId)
    updateDesign((item) => ({ ...item, screens: next.map((entry) => ({ ...entry, components: entry.components.map((component) => component.targetScreenId === screenId ? { ...component, targetScreenId: null } : component) })), activeScreenId: next[0].id }))
    if (selectedScreenId === screenId) { setSelectedScreenId(next[0].id); setSelectedElementId(null); setContainerTargetId(null) }
  }
  const deleteDesign = () => {
    if (!design || !window.confirm(t(`حذف تصميم «${design.title}»؟`, `Delete “${design.title}”?`))) return
    onDesignsChange(designs.filter((item) => item.id !== design.id))
    onSelectedDesignChange(null)
    setSelectedScreenId(null)
    setSelectedElementId(null); setContainerTargetId(null)
  }
  const duplicateScreen = (source) => {
    const componentIds = new Map()
    const duplicateComponents = (components = []) => {
      components.forEach((item) => { if (!componentIds.has(item.id)) componentIds.set(item.id, id()) })
      return components.map((item) => ({ ...item, id: componentIds.get(item.id), ...(componentIds.has(item.parentId) ? { parentId: componentIds.get(item.parentId) } : {}) }))
    }
    const viewportLayouts = Object.fromEntries(Object.entries(source.viewportLayouts || {}).map(([viewportId, components]) => [viewportId, duplicateComponents(components)]))
    const clone = { ...source, id: id(), title: `${source.title} ${t('نسخة', 'copy')}`, components: duplicateComponents(source.components), ...(Object.keys(viewportLayouts).length ? { viewportLayouts } : {}) }
    updateDesign((item) => ({ ...item, screens: [...item.screens, clone], activeScreenId: clone.id }))
    setSelectedScreenId(clone.id)
    setSelectedElementId(null); setContainerTargetId(null)
  }
  const removeElement = (elementId) => {
    if (!screen) return
    const removedIds = new Set([elementId])
    let changed = true
    while (changed) {
      changed = false
      layoutComponents.forEach((item) => { if (removedIds.has(item.parentId) && !removedIds.has(item.id)) { removedIds.add(item.id); changed = true } })
    }
    updateCurrentComponents(layoutComponents.filter((item) => !removedIds.has(item.id)))
    if (removedIds.has(containerTargetId)) setContainerTargetId(null)
    setSelectedElementId(null); setContainerTargetId(null)
  }
  const duplicateElement = (item) => {
    if (!screen) return
    const descendants = []
    const collect = (parentId) => layoutComponents.filter((entry) => entry.parentId === parentId).forEach((entry) => { descendants.push(entry); collect(entry.id) })
    collect(item.id)
    const copies = [item, ...descendants]
    const ids = new Map(copies.map((entry) => [entry.id, id()]))
    const cloned = copies.map((entry, index) => ({ ...entry, id: ids.get(entry.id), ...(ids.has(entry.parentId) ? { parentId: ids.get(entry.parentId) } : {}), ...(index === 0 ? { x: Math.min(layoutWidth - entry.width, entry.x + 16), y: Math.min(editableHeight - entry.height, entry.y + 16) } : {}) }))
    updateCurrentComponents([...layoutComponents, ...cloned])
    setSelectedElementId(ids.get(item.id))
  }
  const snapValue = (value) => snapToGrid ? Math.round(value / 8) * 8 : Math.round(value)
  const beginMove = (event, item, mode) => {
    if (preview || item.locked) return
    event.stopPropagation()
    event.preventDefault()
    setSelectedElementId(item.id)
    dragRef.current = { pointerId: event.pointerId, itemId: item.id, mode, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y, width: item.width, height: item.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveElement = (event) => {
    const drag = dragRef.current
    if (!drag || !screen) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const scale = rect?.width ? rect.width / canvasWidth : canvasScale
    const dx = (event.clientX - drag.startX) / scale / designScaleX
    const dy = (event.clientY - drag.startY) / scale / designScaleY
    const item = layoutComponents.find((entry) => entry.id === drag.itemId)
    const parent = layoutComponents.find((entry) => entry.id === item?.parentId)
    const boundsWidth = parent?.width || layoutWidth
    const boundsHeight = parent?.height || editableHeight
    if (drag.mode === 'resize') updateElement(drag.itemId, { width: Math.max(44, Math.min(boundsWidth - drag.x, snapValue(drag.width + dx))), height: Math.max(32, Math.min(boundsHeight - drag.y, snapValue(drag.height + dy))) })
    else updateElement(drag.itemId, { x: Math.max(0, Math.min(boundsWidth - 32, snapValue(drag.x + dx))), y: Math.max(0, Math.min(boundsHeight - 24, snapValue(drag.y + dy))) })
  }
  const endMove = () => { dragRef.current = null }
  const dropImageOnCanvas = async (event) => {
    event.preventDefault()
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/'))
    if (!file || !screen || !canvasRef.current) return
    try {
      const imageData = await optimizeImage(file)
      const rect = canvasRef.current.getBoundingClientRect()
      const visualScale = rect.width / canvasWidth || canvasScale
      const width = Math.min(240, layoutWidth - 24)
      const height = Math.min(160, editableHeight - 24)
      const x = Math.max(0, Math.min(layoutWidth - width, snapValue((((event.clientX - rect.left) / visualScale) / designScaleX) - width / 2)))
      const y = Math.max(0, Math.min(editableHeight - height, snapValue((((event.clientY - rect.top) / visualScale) / designScaleY) - height / 2)))
      const item = { id: id(), type: 'image', x, y, width, height, text: file.name, imageData, objectFit: 'cover', borderRadius: 8, borderWidth: 1, borderColor: '#d5ddd7', background: '#e6eee8', color: '#34443a' }
      updateCurrentComponents([...layoutComponents, item])
      setSelectedElementId(item.id)
    } catch (error) { console.error('Could not place image on the interface screen.', error); window.alert(t('تعذر إضافة الصورة إلى الشاشة.', 'Could not add the image to the screen.')) }
  }
  useEffect(() => {
    const onKeyDown = (event) => {
      if (preview || !screen || !element || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateElement(element); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeElement(element.id); return }
      if (event.key === 'Escape') { setSelectedElementId(null); setContainerTargetId(null); return }
      const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const offset = offsets[event.key]
      if (!offset) return
      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      updateElement(element.id, { x: Math.max(0, Math.min(layoutWidth - element.width, element.x + offset[0] * step)), y: Math.max(0, Math.min(editableHeight - element.height, element.y + offset[1] * step)) })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview, screen, element, editableHeight])
  const exportImage = async () => {
    if (!design || !screen || !activeViewport) return
    try {
      const [image] = await createDesignPreviews([design], deviceOrientations, language, { screenId: screen.id, viewportId: activeViewport.id })
      if (!image) throw new Error('No preview image was generated for the selected screen size.')
      const url = URL.createObjectURL(image.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(screen.title || 'screen').replace(/[\\/:*?"<>|]+/g, '-')}-${image.width}x${image.height}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Could not export interface screen.', error)
      window.alert(t('Could not export the screen. Please try again.', 'Could not export the screen. Please try again.'))
    }
  }
  const exportDesign = async () => {
    if (!design || exportingProject) return
    setExportingProject(true)
    try {
      const previews = await createDesignPreviews([design], deviceOrientations, language)
      const bundle = {
        workspace: { id: workspaceId, title: design.title || 'Interface design' },
        textDirection: language === 'en' ? 'ltr' : 'rtl',
        mindMaps: [], notes: [], flowcharts: [], tasks: [], taskLists: [], uiDesigns: [design],
      }
      const archive = await createWorkspaceArchive(bundle, [], previews)
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(design.title || 'interface-design').replace(/[\\/:*?"<>|]+/g, '-')}-project.zip`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Could not export the complete interface design.', error)
      window.alert(t('Could not export the complete project. Please try again.', 'Could not export the complete project. Please try again.'))
    } finally {
      setExportingProject(false)
    }
  }
  const allElements = useMemo(() => layoutComponents, [layoutComponents])
  const childrenByParent = useMemo(() => {
    const result = new Map()
    allElements.forEach((item) => {
      if (!item.parentId) return
      if (!result.has(item.parentId)) result.set(item.parentId, [])
      result.get(item.parentId).push(item)
    })
    return result
  }, [allElements])
  const activatePreviewElement = (item) => {
    if (item.targetScreenId) {
      setSelectedScreenId(item.targetScreenId)
      updateDesign((current) => ({ ...current, activeScreenId: item.targetScreenId }))
      setPreviewStates({})
      setPreviewActiveId(null)
      return
    }
    setPreviewActiveId(item.id)
  }
  const renderElement = (item) => {
    const children = childrenByParent.get(item.id) || []
    const active = previewActiveId === item.id
    const parts = (item.text || '').split(/\s{2,}|\s*\|\s*/).filter(Boolean)
    const content = ['image', 'logo', 'avatar'].includes(item.type) && item.imageData
      ? <img src={item.imageData} alt={item.text} style={{ objectFit: item.objectFit || 'cover' }} />
      : item.type === 'input' || item.type === 'search'
        ? preview
          ? <input className="ui-preview-input" type={item.type === 'search' ? 'search' : 'text'} aria-label={item.text || item.type} placeholder={item.text} value={previewStates[item.id] ?? ''} onChange={(event) => setPreviewStates((current) => ({ ...current, [item.id]: event.target.value }))} onClick={(event) => event.stopPropagation()} />
          : <span className="ui-input-placeholder">{item.type === 'search' ? `?  ${item.text}` : item.text}</span>
        : item.type === 'checkbox'
          ? preview
            ? <label className="ui-preview-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={Boolean(previewStates[item.id])} onChange={(event) => setPreviewStates((current) => ({ ...current, [item.id]: event.target.checked }))} /><span>{item.text}</span></label>
            : <><span className="ui-checkbox-mark">{'\u2713'}</span><span>{item.text}</span></>
          : item.type === 'toggle'
            ? preview
              ? <button type="button" role="switch" aria-checked={Boolean(previewStates[item.id])} className={`ui-preview-toggle${previewStates[item.id] ? ' is-on' : ''}`} onClick={(event) => { event.stopPropagation(); setPreviewStates((current) => ({ ...current, [item.id]: !current[item.id] })) }}><span>{item.text}</span><i /></button>
              : <><span>{item.text}</span><span className="ui-toggle-mark"><i /></span></>
            : item.type === 'button'
              ? preview
                ? <button type="button" className={`ui-preview-button${active ? ' is-activated' : ''}`} onClick={(event) => { event.stopPropagation(); activatePreviewElement(item) }}>{item.text}</button>
                : <span>{item.text}</span>
              : item.type === 'nav' || item.type === 'tabs' || item.type === 'breadcrumb'
                ? preview
                  ? <div className="ui-preview-segments">{(parts.length ? parts : [item.text]).map((part, index) => <button type="button" key={`${item.id}-${index}`} className={previewStates[item.id] === index ? 'is-active' : ''} onClick={(event) => { event.stopPropagation(); if (item.targetScreenId) activatePreviewElement(item); else setPreviewStates((current) => ({ ...current, [item.id]: index })) }}>{part}</button>)}</div>
                  : <span>{item.text}</span>
                : item.type === 'video'
                  ? preview
                    ? <button type="button" className="ui-preview-video" onClick={(event) => { event.stopPropagation(); setPreviewStates((current) => ({ ...current, [item.id]: !current[item.id] })) }}>{previewStates[item.id] ? <Pause size={16} /> : <Play size={16} />}<span>{previewStates[item.id] ? (en ? 'Pause' : '\u0625\u064a\u0642\u0627\u0641') : item.text}</span></button>
                    : <><span className="ui-video-play"><Play size={15} /></span><span>{item.text}</span></>
                  : item.type === 'progress'
                    ? <><span>{item.text}</span><span className="ui-progress-track"><i style={{ width: `${Math.min(100, Math.max(0, previewStates[item.id] ?? item.progress ?? 68))}%` }} /></span></>
                    : item.type === 'divider' ? null
                      : ['image', 'logo', 'avatar'].includes(item.type) ? <span className="ui-asset-placeholder">{item.type === 'logo' ? '\u0634\u0639\u0627\u0631' : item.type === 'avatar' ? '\u0635\u0648\u0631\u0629' : item.text}</span>
                        : <span>{item.text}</span>
    return <div key={item.id} data-element-id={item.id} className={`ui-canvas-element ui-element-${item.type}${children.length ? ' ui-element-container' : ''}${selectedElementId === item.id && !preview ? ' is-selected' : ''}${preview ? ' is-preview-interactive' : ''}${preview && (item.targetScreenId || item.type === 'button') ? ' is-clickable' : ''}${preview && active ? ' is-activated' : ''}${item.type === 'button' ? ` button-style-${item.buttonStyle || 'primary'}` : ''}`} style={getElementStyle(item, designScaleX, designScaleY)} onPointerDown={(event) => !preview && beginMove(event, item, 'move')} onClick={(event) => { event.stopPropagation(); if (preview) activatePreviewElement(item); else { setSelectedElementId(item.id); setContainerTargetId(item.id) } }}>
      {content}
      {children.map(renderElement)}
      {selectedElementId === item.id && !preview && <button type="button" className="ui-resize-handle" aria-label={t('\u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u062d\u062c\u0645', 'Resize')} onPointerDown={(event) => beginMove(event, item, 'resize')} />}
    </div>
  }

  if (!design) return <div className="ui-design-empty-wrap"><section className="ui-design-empty"><span><Monitor size={28} /></span><h1>{t('ابدأ تصميم واجهتك', 'Start designing your interface')}</h1><p>{t('اختر قالبًا جاهزًا أو ابدأ بشاشة فارغة.', 'Choose a template or start with a blank screen.')}</p><div>{templates.map((template) => <button type="button" key={template.id} onClick={() => createDesign(template.id)}><Plus size={15} />{template.title[en ? 1 : 0]}</button>)}</div></section></div>

  return <div className={`ui-designer${en ? ' is-english' : ''}`} dir={en ? 'ltr' : 'rtl'}>
    <aside className={`ui-screens-panel${sidebarOpen ? '' : ' is-collapsed'}`}>
      <header><button type="button" onClick={(event) => { event.stopPropagation(); setSidebarOpen((open) => !open) }} aria-expanded={sidebarOpen} aria-label={sidebarOpen ? t('طي قائمة الشاشات', 'Collapse screens') : t('إظهار الشاشات', 'Show screens')}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>{sidebarOpen && <><strong>{t('الشاشات', 'Screens')}</strong><button type="button" onClick={createScreen} aria-label={t('إضافة شاشة', 'Add screen')}><Plus size={17} /></button></>}</header>
      {sidebarOpen && <><div className="ui-design-project-list"><strong>{t('\u0645\u0634\u0627\u0631\u064a\u0639 \u0627\u0644\u062a\u0635\u0645\u064a\u0645', 'Design projects')}</strong>{designs.map((item) => <button type="button" key={item.id} className={item.id === design.id ? 'is-active' : ''} onClick={() => { onSelectedDesignChange(item.id); setSelectedScreenId(item.activeScreenId || item.screens?.[0]?.id || null); setSelectedElementId(null); setContainerTargetId(null) }}><Monitor size={13} /><span>{item.title || t('\u062a\u0635\u0645\u064a\u0645 \u0628\u062f\u0648\u0646 \u0639\u0646\u0648\u0627\u0646', 'Untitled design')}</span></button>)}</div><div className="ui-screen-list">{design.screens.map((item, index) => <div className={`ui-screen-row${item.id === screen?.id ? ' is-active' : ''}`} key={item.id}><button type="button" onClick={() => { setSelectedScreenId(item.id); setSelectedElementId(null); setContainerTargetId(null); updateDesign((current) => ({ ...current, activeScreenId: item.id })) }}><span>{index + 1}</span><strong>{item.title}</strong></button><button type="button" title={t('تكرار الشاشة', 'Duplicate screen')} onClick={() => duplicateScreen(item)}><Copy size={13} /></button>{design.screens.length > 1 && <button type="button" title={t('حذف الشاشة', 'Delete screen')} onClick={() => deleteScreen(item.id)}><Trash2 size={13} /></button>}</div>)}</div>
      <section className="ui-template-shortcuts"><strong>{t('قوالب صفحات سريعة', 'Quick page templates')}</strong>{templates.filter((item) => item.id !== 'blank').map((item) => <button type="button" key={item.id} onClick={() => addTemplatePages(item.id)}>{item.title[en ? 1 : 0]}</button>)}</section></>}
    </aside>
    <main className="ui-designer-main">
      <header className="ui-designer-heading"><div><Monitor size={18} /><input aria-label={t('اسم التصميم', 'Design name')} value={design.title} onChange={(event) => updateDesign((item) => ({ ...item, title: event.target.value }))} /><span>{screen?.title}</span></div><div className="ui-designer-actions"><button type="button" onClick={() => setNotesOpen(true)}><MessageSquareText size={15} />{t('ملاحظات التصميم', 'Design notes')}</button><button type="button" onClick={() => setPreview(!preview)}><MousePointer2 size={15} />{preview ? t('تحرير', 'Edit') : t('معاينة', 'Preview')}</button><button type="button" onClick={exportImage}><Image size={15} />{t('تصدير صورة', 'Export image')}</button><button type="button" onClick={exportDesign} disabled={exportingProject}><FileJson size={15} />{exportingProject ? t('جاري تجهيز كل الشاشات...', 'Exporting all screens...') : t('تصدير المشروع', 'Export project')}</button><button type="button" className="ui-design-new" onClick={() => createDesign('blank')}><Plus size={15} />{t('تصميم جديد', 'New design')}</button><button type="button" title={t('حذف التصميم', 'Delete design')} onClick={deleteDesign}><Trash2 size={15} /></button></div></header>
      <div className="ui-device-toolbar"><span>{t('معاينة الجهاز', 'Device preview')}</span><div className="ui-panel-toggles"><button type="button" className={elementsOpen && !preview ? 'is-active' : ''} aria-expanded={elementsOpen && !preview} onClick={() => setElementsOpen((open) => !open)}><Type size={14} />{t('العناصر', 'Elements')}</button></div><div className="ui-zoom-controls"><button type="button" title={t('تصغير', 'Zoom out')} aria-label={t('تصغير', 'Zoom out')} disabled={canvasZoom <= 1} onClick={() => setCanvasZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}><Minus size={13} /></button><button type="button" className="ui-zoom-level" title={t('ملاءمة الشاشة', 'Fit to view')} onClick={() => setCanvasZoom(1)}>{Math.round(canvasScale * 100)}%</button><button type="button" title={t('تكبير', 'Zoom in')} aria-label={t('تكبير', 'Zoom in')} disabled={canvasZoom >= 4} onClick={() => setCanvasZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}><Plus size={13} /></button></div><button type="button" className={`ui-grid-snap${snapToGrid ? ' is-active' : ''}`} aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)}>{snapToGrid ? t('شبكة 8px', 'Grid 8px') : t('شبكة حرة', 'Free move')}</button>{[['phone', Smartphone, t('هاتف', 'Phone')], ['tablet', Tablet, t('جهاز لوحي', 'Tablet')], ['desktop', Laptop, t('كمبيوتر', 'Desktop')], ['screen', Monitor, t('مقاس الشاشة', 'Screen size')]].map(([value, Icon, label]) => <button type="button" key={value} className={device === value ? 'is-active' : ''} onClick={() => setDevice(value)}><Icon size={15} />{label}</button>)}{screen && <div className="ui-screen-size-fields"><strong>{t('مقاس التصميم', 'Design size')}</strong><label>{t('عرض', 'W')}<input type="number" min="240" max="2560" value={currentScreenSizeDraft.width} onChange={(event) => changeScreenSizeDraft('width', event.target.value)} onBlur={() => commitScreenSize('width')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label><span>×</span><label>{t('ارتفاع', 'H')}<input type="number" min="320" value={currentScreenSizeDraft.height} onChange={(event) => changeScreenSizeDraft('height', event.target.value)} onBlur={() => commitScreenSize('height')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label></div>}</div>
      <div className="ui-viewport-toolbar"><strong>{t('مقاسات التصميم', 'Design sizes')}</strong>{viewports.map((viewport) => <div className={`ui-viewport-chip${viewport.id === activeViewport?.id ? ' is-active' : ''}`} key={viewport.id}><button type="button" onClick={() => selectViewport(viewport)} title={`${viewport.name}: ${viewport.width} × ${viewport.height}px`}><span>{viewport.name}{viewport.locked && <Lock size={10} />}</span><small>{viewport.width} × {viewport.height}</small></button>{viewport.device === 'custom' && <><button type="button" title={t('تعديل المقاس', 'Edit size')} onClick={() => editViewport(viewport)}>✎</button><button type="button" title={t('حذف المقاس', 'Delete size')} onClick={() => removeViewport(viewport)}>×</button></>}</div>)}<button type="button" className="ui-add-viewport" onClick={addViewport}><Plus size={14} />{t('مقاس جديد', 'Add size')}</button><button type="button" className={`ui-lock-viewport${activeViewport?.locked ? ' is-active' : ''}`} aria-pressed={Boolean(activeViewport?.locked)} onClick={toggleViewportLock}>{activeViewport?.locked ? <Lock size={14} /> : <Unlock size={14} />}{activeViewport?.locked ? t('التصميم ثابت لهذا المقاس', 'Layout locked to this size') : t('تثبيت التصميم لهذا المقاس', 'Lock layout to this size')}</button></div>
      <section className={`ui-editor-body${preview ? ' is-preview' : ''}${!elementsOpen ? ' elements-collapsed' : ''}${!inspectorOpen ? ' inspector-collapsed' : ''}`}>
        {!preview && elementsOpen && <aside className="ui-elements-panel"><div className="ui-panel-title"><strong>{t('العناصر', 'Elements')}</strong><small>{(layoutComponents.some((item) => item.id === selectedElementId) || layoutComponents.some((item) => item.id === containerTargetId)) ? t('\u0633\u064a\u0636\u0627\u0641 \u0627\u0644\u0639\u0646\u0635\u0631 \u062f\u0627\u062e\u0644 \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u062d\u062f\u062f', 'New elements will be added inside the selected element') : t('\u0627\u0636\u063a\u0637 \u0644\u0625\u0636\u0627\u0641\u0629 \u0639\u0646\u0635\u0631', 'Click to add')}</small></div>{types.map((item) => <button type="button" key={item.id} onClick={() => addElement(item.id)}><span>{item.id === 'heading' ? <Type size={16} /> : item.id === 'text' ? <MessageSquareText size={16} /> : item.id === 'image' ? <Image size={16} /> : <Plus size={16} />}</span>{item.title[en ? 1 : 0]}</button>)}</aside>}
        <div ref={canvasAreaRef} className={`ui-canvas-area${preview ? ' is-preview' : ''}${screen?.scrollEnabled ? ' is-scrollable' : ''}${canvasZoom > 1 ? ' is-zoomed' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={dropImageOnCanvas} onPointerMove={moveElement} onPointerUp={endMove} onPointerCancel={endMove} onClick={(event) => { if (event.target === event.currentTarget) { setSelectedElementId(null); setContainerTargetId(null) } }}>
          <div className={`ui-canvas-frame device-${device}${device === 'phone' ? ' is-phone' : ''}${isLandscape ? ' is-landscape' : ''}`} style={canvasFrameStyle}>
            <div ref={canvasRef} className="ui-screen-canvas" style={canvasStyle} onClick={(event) => { if (event.target === event.currentTarget) { setSelectedElementId(null); setContainerTargetId(null) } }}>
              {allElements.filter((item) => !item.parentId || !allElements.some((parent) => parent.id === item.parentId)).map(renderElement)}
              {!preview && !allElements.length && <div className="ui-canvas-placeholder"><Plus size={20} />{t('أضف عناصر من القائمة لبدء التصميم', 'Add elements from the panel to start designing')}</div>}
            </div>
          </div>
        </div>
        {!preview && <aside className={`ui-inspector${inspectorOpen ? '' : ' is-collapsed'}`}><div className="ui-panel-title"><button type="button" className="ui-inspector-toggle" aria-expanded={inspectorOpen} aria-label={inspectorOpen ? t('طي الخصائص', 'Collapse properties') : t('إظهار الخصائص', 'Show properties')} title={inspectorOpen ? t('طي الخصائص', 'Collapse properties') : t('إظهار الخصائص', 'Show properties')} onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}</button>{inspectorOpen && <strong>{t('خصائص', 'Properties')}</strong>}{inspectorOpen && element && <><button type="button" onClick={() => duplicateElement(element)} title={t('نسخ العنصر (Ctrl+D)', 'Duplicate element (Ctrl+D)')}><Copy size={14} /></button><button type="button" onClick={() => updateElement(element.id, { locked: !element.locked })} title={element.locked ? t('إلغاء القفل', 'Unlock element') : t('قفل العنصر', 'Lock element')}>{element.locked ? <Lock size={14} /> : <Unlock size={14} />}</button><button type="button" onClick={() => removeElement(element.id)} title={t('حذف العنصر', 'Delete element')}><Trash2 size={14} /></button></>}</div>{inspectorOpen && (element ? <div className="ui-inspector-fields">
          <strong className="ui-inspector-section-title">{t('محاذاة العنصر', 'Align element')}</strong>
          <div className="ui-align-tools"><button type="button" onClick={() => updateElement(element.id, { x: 0 })}>{t('يسار', 'Left')}</button><button type="button" onClick={() => updateElement(element.id, { x: Math.round((layoutWidth - element.width) / 2) })}>{t('وسط أفقي', 'Center X')}</button><button type="button" onClick={() => updateElement(element.id, { x: layoutWidth - element.width })}>{t('يمين', 'Right')}</button><button type="button" onClick={() => updateElement(element.id, { y: 0 })}>{t('أعلى', 'Top')}</button><button type="button" onClick={() => updateElement(element.id, { y: Math.round((editableHeight - element.height) / 2) })}>{t('وسط رأسي', 'Center Y')}</button><button type="button" onClick={() => updateElement(element.id, { y: editableHeight - element.height })}>{t('أسفل', 'Bottom')}</button></div>
          <label>{t('النص', 'Text')}<textarea value={element.text} onChange={(event) => updateElement(element.id, { text: event.target.value })} /></label>
          {['image', 'logo', 'avatar'].includes(element.type) && <label>{element.type === 'logo' ? t('صورة الشعار', 'Logo image') : element.type === 'avatar' ? t('الصورة الشخصية', 'Avatar image') : t('الصورة', 'Image')}<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const imageData = await optimizeImage(file); updateElement(element.id, { imageData }) } catch (error) { console.error('Could not load interface image.', error); window.alert(t('تعذر فتح الصورة.', 'Could not open the image.')) } }} /></label>}
          <div className="ui-size-fields"><label>X<input type="number" value={element.x} onChange={(event) => updateElement(element.id, { x: Number(event.target.value) })} /></label><label>Y<input type="number" value={element.y} onChange={(event) => updateElement(element.id, { y: Number(event.target.value) })} /></label></div>
          <div className="ui-size-fields"><label>{t('العرض', 'Width')}<input type="number" min="44" value={element.width} onChange={(event) => updateElement(element.id, { width: Number(event.target.value) })} /></label><label>{t('الارتفاع', 'Height')}<input type="number" min="32" value={element.height} onChange={(event) => updateElement(element.id, { height: Number(event.target.value) })} /></label></div>
          <label>{t('لون النص', 'Text color')}<input type="color" value={element.color === 'transparent' ? '#34443a' : element.color} onChange={(event) => updateElement(element.id, { color: event.target.value })} /></label>
          <label>{t('لون الخلفية', 'Background')}<div className="ui-color-field"><input type="color" value={element.background === 'transparent' ? '#ffffff' : element.background} onChange={(event) => updateElement(element.id, { background: event.target.value })} /><button type="button" onClick={() => updateElement(element.id, { background: 'transparent' })}>{t('شفاف', 'Transparent')}</button></div></label>
          {!['image', 'logo', 'avatar', 'divider'].includes(element.type) && <>
            <div className="ui-size-fields"><label>{t('حجم الخط', 'Font size')}<input type="number" min="8" max="96" value={element.fontSize ?? elementDefaults[element.type]?.fontSize ?? 15} onChange={(event) => updateElement(element.id, { fontSize: Math.min(96, Math.max(8, Number(event.target.value) || 8)) })} /></label><label>{t('سماكة الخط', 'Weight')}<select value={element.fontWeight ?? elementDefaults[element.type]?.fontWeight ?? 500} onChange={(event) => updateElement(element.id, { fontWeight: Number(event.target.value) })}><option value="400">{t('عادي', 'Regular')}</option><option value="500">{t('متوسط', 'Medium')}</option><option value="600">{t('شبه عريض', 'Semi-bold')}</option><option value="650">{t('عريض متوسط', 'Strong')}</option><option value="700">{t('عريض جدًا', 'Bold')}</option></select></label></div>
            <label>{t('نوع الخط', 'Font family')}<select value={element.fontFamily || 'IBM Plex Sans Arabic, sans-serif'} onChange={(event) => updateElement(element.id, { fontFamily: event.target.value })}><option value="IBM Plex Sans Arabic, sans-serif">IBM Plex Sans Arabic</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="monospace">Monospace</option></select></label>
            <div className="ui-size-fields"><label>{t('محاذاة النص', 'Text align')}<select value={element.textAlign || 'center'} onChange={(event) => updateElement(element.id, { textAlign: event.target.value })}><option value="start">{t('بداية', 'Start')}</option><option value="center">{t('وسط', 'Center')}</option><option value="end">{t('نهاية', 'End')}</option></select></label><label>{t('ارتفاع السطر', 'Line height')}<input type="number" min="0.8" max="3" step="0.1" value={element.lineHeight || 1.35} onChange={(event) => updateElement(element.id, { lineHeight: Math.min(3, Math.max(0.8, Number(event.target.value) || 1)) })} /></label></div>
            <div className="ui-size-fields"><label>{t('تباعد الحروف', 'Letter spacing')}<input type="number" min="-3" max="20" step="0.5" value={element.letterSpacing || 0} onChange={(event) => updateElement(element.id, { letterSpacing: Number(event.target.value) })} /></label><label>{t('تنسيق النص', 'Text style')}<select value={element.textDecoration || 'none'} onChange={(event) => updateElement(element.id, { textDecoration: event.target.value })}><option value="none">{t('عادي', 'None')}</option><option value="underline">{t('تحته خط', 'Underline')}</option><option value="line-through">{t('يتوسطه خط', 'Strike')}</option></select></label></div>
            <label>{t('حالة الأحرف', 'Text case')}<select value={element.textTransform || 'none'} onChange={(event) => updateElement(element.id, { textTransform: event.target.value })}><option value="none">{t('كما كُتبت', 'As typed')}</option><option value="uppercase">{t('أحرف كبيرة', 'Uppercase')}</option><option value="lowercase">{t('أحرف صغيرة', 'Lowercase')}</option><option value="capitalize">{t('أول كل كلمة كبيرة', 'Capitalize')}</option></select></label>
          </>}
          <div className="ui-size-fields"><label>{t('سُمك الحد', 'Border width')}<input type="number" min="0" max="20" value={element.borderWidth ?? 1} onChange={(event) => updateElement(element.id, { borderWidth: Math.min(20, Math.max(0, Number(event.target.value) || 0)) })} /></label><label>{t('نمط الحد', 'Border style')}<select value={element.borderStyle || 'solid'} onChange={(event) => updateElement(element.id, { borderStyle: event.target.value })}><option value="solid">{t('متصل', 'Solid')}</option><option value="dashed">{t('متقطع', 'Dashed')}</option><option value="dotted">{t('منقط', 'Dotted')}</option><option value="double">{t('مزدوج', 'Double')}</option></select></label></div>
          <label>{t('لون الحد', 'Border color')}<input type="color" value={element.borderColor || '#d5ddd7'} onChange={(event) => updateElement(element.id, { borderColor: event.target.value })} /></label>
          <div className="ui-size-fields"><label>{t('استدارة الزوايا', 'Corner radius')}<input type="number" min="0" max="999" value={element.borderRadius ?? 8} onChange={(event) => updateElement(element.id, { borderRadius: Math.max(0, Number(event.target.value) || 0) })} /></label><label>{t('المسافة الداخلية', 'Padding')}<input type="number" min="0" max="80" value={element.padding ?? 8} onChange={(event) => updateElement(element.id, { padding: Math.min(80, Math.max(0, Number(event.target.value) || 0)) })} /></label></div>
          <label>{t('الظل', 'Shadow')}<select value={element.shadow || 'none'} onChange={(event) => updateElement(element.id, { shadow: event.target.value })}><option value="none">{t('بدون', 'None')}</option><option value="soft">{t('خفيف', 'Soft')}</option><option value="medium">{t('واضح', 'Strong')}</option></select></label>
          <div className="ui-size-fields"><label>{t('التدوير', 'Rotation')}<input type="number" min="-180" max="180" value={element.rotation || 0} onChange={(event) => updateElement(element.id, { rotation: Math.min(180, Math.max(-180, Number(event.target.value) || 0)) })} /></label><label>{t('ترتيب الطبقة', 'Layer')}<input type="number" min="0" max="99" value={element.zIndex ?? 1} onChange={(event) => updateElement(element.id, { zIndex: Math.min(99, Math.max(0, Number(event.target.value) || 0)) })} /></label></div>
          <div className="ui-layer-tools"><button type="button" onClick={() => updateElement(element.id, { zIndex: Math.min(99, (element.zIndex ?? 1) + 1) })}>{t('إحضار للأمام', 'Bring forward')}</button><button type="button" onClick={() => updateElement(element.id, { zIndex: Math.max(0, (element.zIndex ?? 1) - 1) })}>{t('إرسال للخلف', 'Send backward')}</button></div>
          <label className="ui-range-field">{t('الشفافية', 'Opacity')}<input type="range" min="0.1" max="1" step="0.05" value={element.opacity ?? 1} onChange={(event) => updateElement(element.id, { opacity: Number(event.target.value) })} /><small>{Math.round((element.opacity ?? 1) * 100)}%</small></label>
          {element.type === 'button' && <label>{t('شكل الزر', 'Button style')}<select value={element.buttonStyle || 'primary'} onChange={(event) => { const buttonStyle = event.target.value; updateElement(element.id, { buttonStyle, borderRadius: buttonStyle === 'pill' ? 999 : buttonStyle === 'square' ? 2 : buttonStyle === 'rounded' ? 14 : 10, borderWidth: buttonStyle === 'outline' ? 2 : 0, background: buttonStyle === 'outline' || buttonStyle === 'ghost' ? 'transparent' : '#287d5b', color: buttonStyle === 'outline' ? '#287d5b' : '#ffffff' }) }}><option value="primary">{t('ممتلئ', 'Filled')}</option><option value="rounded">{t('مستدير', 'Rounded')}</option><option value="pill">{t('كبسولة', 'Pill')}</option><option value="square">{t('مربع', 'Square')}</option><option value="outline">{t('إطار', 'Outline')}</option><option value="ghost">{t('شفاف', 'Ghost')}</option></select></label>}
          {['image', 'logo', 'avatar'].includes(element.type) && <label>{t('ملاءمة الصورة', 'Image fit')}<select value={element.objectFit || 'cover'} onChange={(event) => updateElement(element.id, { objectFit: event.target.value })}><option value="cover">{t('ملء الإطار', 'Cover')}</option><option value="contain">{t('احتواء كامل', 'Contain')}</option><option value="fill">{t('تمديد', 'Fill')}</option></select></label>}
          {element.type === 'progress' && <label>{t('نسبة الإنجاز', 'Progress')}<input type="range" min="0" max="100" value={element.progress ?? 68} onChange={(event) => updateElement(element.id, { progress: Number(event.target.value) })} /></label>}
          <label>{t('يفتح الشاشة', 'Opens screen')}<select value={element.targetScreenId || ''} onChange={(event) => updateElement(element.id, { targetScreenId: event.target.value || null })}><option value="">{t('بدون رابط', 'No link')}</option>{design.screens.filter((item) => item.id !== screen.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label className="ui-note-field">{t('ملاحظة على العنصر', 'Element note')}<textarea value={element.note || ''} placeholder={t('سجّل فكرة أو تعليقًا...', 'Add an idea or comment...')} onChange={(event) => updateElement(element.id, { note: event.target.value })} /></label>
        </div> : screen ? <div className="ui-inspector-fields">
          <label>{t('اسم الشاشة', 'Screen name')}<input value={screen.title} onChange={(event) => updateScreen(screen.id, { title: event.target.value })} /></label>
          {(device === 'phone' || device === 'tablet') && activeViewport && <button type="button" className="ui-orientation-toggle" aria-pressed={isLandscape} onClick={() => setDeviceOrientations((current) => ({ ...current, [activeViewport.id]: !current[activeViewport.id] }))}><RotateCw size={15} /><span>{isLandscape ? t('الوضع العرضي', 'Landscape') : t('الوضع الطولي', 'Portrait')}</span><small>{t('تغيير الاتجاه', 'Change orientation')}</small></button>}
          <label className="ui-scroll-setting"><span>{t('صفحة قابلة للتمرير', 'Scrollable page')}<small>{t('ابدأ من 100% وزوّد النسبة حسب طول الصفحة', 'Start at 100% and increase it to lengthen the page')}</small></span><input type="checkbox" checked={Boolean(screen.scrollEnabled)} onChange={(event) => updateScreen(screen.id, { scrollEnabled: event.target.checked, scrollLengthPercent: screen.scrollLengthPercent || 100 })} /></label>
          {screen.scrollEnabled && <section className="ui-scroll-length"><label>{t('طول الشاشة', 'Screen length')}<span className="ui-scroll-percent">{currentScrollLengthDraft}%</span><input type="range" min="100" max="1000" step="10" value={Math.min(1000, Math.max(100, Number(currentScrollLengthDraft) || 100))} onChange={(event) => { changeScrollLengthDraft(event.target.value); updateScreen(screen.id, { scrollLengthPercent: Number(event.target.value) }) }} /></label><label>{t('النسبة المئوية', 'Length percent')}<input type="number" min="100" max="10000" value={currentScrollLengthDraft} onChange={(event) => changeScrollLengthDraft(event.target.value)} onBlur={commitScrollLength} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label></section>}
          <label>{t('خلفية الشاشة', 'Screen background')}<input type="color" value={screen.background || '#ffffff'} onChange={(event) => updateScreen(screen.id, { background: event.target.value })} /></label>
          <small className="ui-screen-dimensions-summary">{screen.width} × {screen.height} px</small>
          <div className="ui-inspector-empty"><MousePointer2 size={20} /><span>{t('اختر عنصرًا لتعديل خصائصه', 'Select an element to edit its properties')}</span></div>
        </div> : <div className="ui-inspector-empty"><MousePointer2 size={20} /><span>{t('اختر عنصرًا لتعديل خصائصه', 'Select an element to edit its properties')}</span></div>)}</aside>}
      </section>
      {notesOpen && <div className="ui-design-notes-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNotesOpen(false) }}><section className="ui-design-notes-dialog" role="dialog" aria-modal="true" aria-label={t('ملاحظات التصميم', 'Design notes')}><header><div><MessageSquareText size={18} /><strong>{t('ملاحظات التصميم', 'Design notes')}</strong></div><button type="button" onClick={() => setNotesOpen(false)} aria-label={t('إغلاق', 'Close')}><X size={17} /></button></header><p>{t('سجّل الأفكار والتعليقات العامة على التصميم.', 'Keep general ideas and comments about this design here.')}</p><textarea autoFocus value={design.notes || ''} placeholder={t('اكتب ملاحظات التصميم هنا...', 'Write design notes here...')} onChange={(event) => updateDesign((item) => ({ ...item, notes: event.target.value }))} /></section></div>}
    </main>
  </div>
}
