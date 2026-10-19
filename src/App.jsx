import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleHelp,
  ClipboardPaste,
  ChevronsDownUp,
  Copy,
  FileText,
  GitBranch,
  Image,
  Lightbulb,
  Link2,
  Map as MapIcon,
  Minus,
  Moon,
  MoveLeft,
  MoveRight,
  MousePointer2,
  Network,
  Pencil,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  Square,
  Spline,
  StickyNote,
  Sun,
  Trash2,
  Undo2,
  Workflow,
  X,
} from 'lucide-react'
import { toPng, toSvg } from 'html-to-image'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'
import { emojiDataUrl } from './emojiAssets.js'

const STORAGE_KEY = 'waraqa-mind-map'
const PROJECTS_KEY = 'waraqa-projects'
const WARAQA_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#176b50"/><path d="M32 18v12M20 42V32h24v10" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/><circle cx="32" cy="16" r="5" fill="#fff"/><circle cx="18" cy="46" r="5" fill="#fff"/><circle cx="46" cy="46" r="5" fill="#fff"/></svg>'
const newProjectId = () => crypto.randomUUID()
const currentTimestamp = () => Date.now()
const englishTranslations = {
  'مشروع جديد': 'New project', 'فكرة': 'Idea', 'إبداع': 'Creativity', 'هدف': 'Goal', 'تفكير': 'Thinking', 'حل': 'Solution', 'اتجاه': 'Direction', 'خريطة': 'Map', 'تعلم': 'Learning', 'قراءة': 'Reading', 'ملاحظة': 'Note', 'بحث': 'Search', 'استكشاف': 'Explore', 'تجربة علمية': 'Experiment', 'علوم': 'Science', 'مهم': 'Important', 'قيمة': 'Value', 'نمو': 'Growth', 'مكتمل': 'Completed', 'سريع': 'Quick', 'نقاش': 'Discussion', 'تعاون': 'Collaboration', 'فريق': 'Team', 'إعداد': 'Settings', 'عمل': 'Work', 'تثبيت': 'Pin', 'انطلاق': 'Launch', 'خواطر': 'Thoughts', 'رابط': 'Link', 'بيانات': 'Data', 'موعد': 'Appointment', 'خطة زمنية': 'Timeline', 'مدة': 'Duration', 'تنبيه': 'Reminder', 'إنجاز': 'Achievement', 'مرحلة': 'Stage', 'تحذير': 'Warning', 'متوقف': 'Paused', 'تقدم': 'Progress', 'تصنيف': 'Category', 'تقنية': 'Technology', 'سحابة': 'Cloud',
  'خريطة بدون عنوان': 'Untitled map', 'بدون عنوان': 'Untitled', 'يمينًا': 'on the right', 'يسارًا': 'on the left', 'افتح ملاحظة العقدة': 'Open node note', 'اسم العقدة': 'Node name', 'تحرير اسم العقدة': 'Edit node name', 'ملاحظة جديدة': 'New note', 'فكرة فرعية': 'Sub-idea', 'فكرتي الجديدة': 'My new idea',
  'تعذر تصدير الصورة. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.': 'Could not export the image. Try again after the map has fully loaded.', 'تعذر تصدير SVG. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.': 'Could not export SVG. Try again after the map has fully loaded.', '- لا توجد عقد': '- No nodes', '- لا توجد روابط': '- No links', 'خريطة مستوردة': 'Imported map', 'الملف غير صالح أو لا يحتوي على خريطة محفوظة.': 'The file is invalid or does not contain a saved map.',
  'إعدادات البرنامج': 'App settings', 'غيّر لغة الواجهة ومظهر البرنامج.': 'Change the app language and appearance.', 'اللغة': 'Language', 'العربية': 'Arabic', 'المظهر': 'Appearance', 'نهاري': 'Light', 'ليلي': 'Dark', 'إغلاق الإعدادات': 'Close settings',
  'حفظ تغييرات المشروع؟': 'Save project changes?', 'المشروع': 'the project', 'قبل إغلاقه؟': 'before closing it?', 'حفظ وإغلاق': 'Save and close', 'إغلاق بدون حفظ': 'Close without saving', 'إلغاء': 'Cancel', 'كل المشاريع': 'All projects', 'ورقة': 'Waraqa', 'مساحة مشاريعك': 'Your projects', 'الوضع النهاري': 'Light mode', 'الوضع الليلي': 'Dark mode', 'استيراد مشروع': 'Import project', 'مساحة العمل': 'Workspace', 'مشاريعك': 'Your projects', 'كل خرائطك الذهنية في مكان واحد.': 'All your mind maps in one place.', 'ابدأ أول مشروع لك': 'Start your first project', 'أنشئ خريطة ذهنية جديدة أو استورد مشروعًا محفوظًا.': 'Create a new mind map or import a saved project.', 'إنشاء مشروع': 'Create project', 'حذف المشروع؟': 'Delete project?', '؟ سيتم حذف المشروع نهائيًا.': '? This project will be deleted permanently.', 'حذف المشروع': 'Delete project',
  'قائمة التطبيق': 'Application menu', 'ملف': 'File', 'حفظ المشروع': 'Save project', 'إعادة تسمية المشروع...': 'Rename project...', 'استيراد خريطة...': 'Import map...', 'تصدير صورة PNG': 'Export PNG image', 'تصدير صورة SVG': 'Export SVG image', 'تصدير Markdown': 'Export Markdown', 'تصدير JSON': 'Export JSON', 'تحرير': 'Edit', 'تراجع': 'Undo', 'إعادة': 'Redo', 'نسخ الفرع وفروعه': 'Copy branch and descendants', 'نسخ العقدة وفروعها': 'Copy node and descendants', 'لصق الفرع وفروعه': 'Paste branch and descendants', 'لصق العقدة': 'Paste node', 'تكرار العقدة': 'Duplicate node', 'حذف المحدد': 'Delete selected', 'عرض': 'View', 'بحث في الخريطة...': 'Search the map...', 'إخفاء شريط الأدوات': 'Hide tools panel', 'إظهار شريط الأدوات': 'Show tools panel', 'إخفاء الخريطة المصغرة': 'Hide minimap', 'إظهار الخريطة المصغرة': 'Show minimap', 'ترتيب الخريطة': 'Arrange map',
  'الأدوات': 'Tools', 'أضف إلى الخريطة': 'Add to map', 'إخفاء الخريطة': 'Hide map', 'إظهار الخريطة': 'Show map', 'فكرة جديدة': 'New idea', 'فرع يمين': 'Branch right', 'فرع يسار': 'Branch left', 'إدراج فرع يمين': 'Insert branch right', 'إدراج فرع يسار': 'Insert branch left', 'تنظيم الخريطة': 'Organize map', 'ترتيب الخريطة للأمام': 'Arrange map forward', 'ربط الأفكار': 'Connect ideas', 'اسحب من النقطة على طرف العقدة إلى عقدة أخرى لربطهما. اضغط كليك يمين على السهم لحذفه.': 'Drag from a node handle to another node to connect them. Right-click a connector to delete it.', 'شكل السهم': 'Connector style', 'متدرج': 'Smooth step', 'منحني': 'Curved', 'مستقيم': 'Straight', 'لون وسُمك السهم': 'Connector color and width', 'رفيع': 'Thin', 'متوسط': 'Medium', 'عريض': 'Thick', 'عريض جدًا': 'Extra thick', 'رأس السهم': 'Arrowhead', 'ممتلئ': 'Filled', 'مفتوح': 'Open', 'بدون رأس': 'None', 'تنسيق العقدة': 'Node appearance', 'لون العقدة الجديدة': 'New node color', 'نص العقدة المحددة': 'Selected node text', 'اختيار لون العقدة الجديدة': 'Choose new node color', 'اختيار لون مخصص': 'Choose a custom color', 'تحكم سريع': 'Quick controls', 'فتح': 'Expand', 'طي': 'Collapse', 'تكرار': 'Duplicate', 'حذف': 'Delete', 'ربط المحدد': 'Connect selected', 'كل فكرة تبدأ من هنا': 'Every idea starts here', 'مساحة أفكارك مفتوحة': 'Your idea space is ready', 'أضف فكرتك الأولى، ثم دع الأفكار تتفرع وتتصل ببعضها.': 'Add your first idea, then let it branch out and connect to others.', 'أضف أول فكرة': 'Add your first idea', 'مساحة الرسم': 'Canvas', 'اسحب العقد لترتيبها': 'Drag nodes to arrange them', 'ملاحظة العقدة': 'Node note', 'إيموجي العقدة': 'Node emoji', 'الرسومات من Twemoji': 'Emoji artwork by Twemoji', 'لون العقدة': 'Node color', 'تُحفظ الملاحظة مع هذه العقدة تلقائيًا': 'This note is saved with the node automatically', 'تنظيم مشاريعك': 'Organize your projects', 'ما اسم مشروعك؟': 'What is your project called?', 'اختر اسمًا واضحًا يسهل عليك الوصول إليه لاحقًا.': 'Choose a clear name so you can find it easily later.', 'اسم المشروع': 'Project name', 'حفظ الاسم': 'Save name', 'مساعدة': 'Help', 'مسح التحديد': 'Clear selection', 'إغلاق البحث': 'Close search', 'العودة إلى قائمة المشاريع': 'Back to all projects', 'شريط النافذة': 'Window bar', 'أزرار النافذة': 'Window controls', 'تصغير': 'Minimize', 'تصغير النافذة': 'Minimize window', 'استعادة': 'Restore', 'تكبير': 'Maximize', 'استعادة النافذة': 'Restore window', 'تكبير النافذة': 'Maximize window', 'إغلاق': 'Close', 'إغلاق النافذة': 'Close window',
  'مشروع بدون عنوان': 'Untitled project', 'عقدة بدون عنوان': 'Untitled node', 'اكتب ملاحظتك هنا...': 'Write your note here...',
  'لوحة الأدوات': 'Tools panel', 'إخفاء الملاحظة': 'Hide note', 'ملاحظة العقدة المحددة': 'Selected node note', 'اختيار إيموجي للعقدة': 'Choose node emoji', 'بدون إيموجي': 'No emoji', 'لون العقدة المحددة': 'Selected node color', 'لون مخصص للعقدة': 'Custom node color',
  'اضغط لطي أو فتح الفروع يمينًا': 'Click to collapse or expand branches on the right', 'اضغط لطي أو فتح الفروع يسارًا': 'Click to collapse or expand branches on the left',
}
function translateToEnglish(value) {
  const trimmed = value.trim()
  if (englishTranslations[trimmed]) return `${value.slice(0, value.indexOf(trimmed))}${englishTranslations[trimmed]}${value.slice(value.indexOf(trimmed) + trimmed.length)}`
  const nodeCount = trimmed.match(/^(\d+) عقدة$/)
  if (nodeCount) return `${nodeCount[1]} nodes`
  const linkCount = trimmed.match(/^(\d+) رابط$/)
  if (linkCount) return `${linkCount[1]} links`
  const selectedCount = trimmed.match(/^(\d+) عقد محددة$/)
  if (selectedCount) return `${selectedCount[1]} nodes selected`
  const projectCounts = trimmed.match(/^(\d+) عقدة · (\d+) رابط$/)
  if (projectCounts) return `${projectCounts[1]} nodes · ${projectCounts[2]} links`
  const tone = trimmed.match(/^لون (.+)$/)
  if (tone) return `Color ${tone[1]}`
  const emoji = trimmed.match(/^إيموجي (.+)$/)
  if (emoji) return `Emoji ${emoji[1]}`
  if (trimmed.startsWith('آخر تعديل: ')) return `Last edited: ${trimmed.slice('آخر تعديل: '.length)}`
  if (trimmed.startsWith('إغلاق ')) return `Close ${trimmed.slice('إغلاق '.length)}`
  return value
}
function LocalizedContent({ language, children }) {
  if (language !== 'en') return children
  const translateNode = (node) => {
    if (typeof node === 'string') return translateToEnglish(node)
    if (Array.isArray(node)) return node.map(translateNode)
    if (!isValidElement(node)) return node
    const props = { ...node.props }
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
      if (typeof props[attribute] === 'string') props[attribute] = translateToEnglish(props[attribute])
    }
    props.children = Children.map(props.children, translateNode)
    return cloneElement(node, props)
  }
  return translateNode(children)
}
function runPageTransition(update) {
  if (document.startViewTransition) document.startViewTransition(() => flushSync(update))
  else {
    document.documentElement.classList.add('fallback-transition')
    update()
    window.setTimeout(() => document.documentElement.classList.remove('fallback-transition'), 420)
  }
}
function readProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null')
    if (Array.isArray(projects)) return projects
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return legacy ? [{ id: newProjectId(), updatedAt: Date.now(), ...legacy }] : []
  } catch { return [] }
}
function readProjectFromStorage(id, fallback) {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    return Array.isArray(projects) ? projects.find((project) => project.id === id) || fallback : fallback
  } catch { return fallback }
}
function createProjectSavePoint(project) {
  const clean = (value, transientKeys) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !transientKeys.has(key)),
  )
  return {
    title: project.title || 'مشروع جديد',
    nodes: (project.nodes || []).map((node) => clean(node, new Set(['selected', 'dragging', 'measured', 'positionAbsolute']))),
    edges: (project.edges || []).map((edge) => clean(edge, new Set(['selected']))),
    edgeStyle: project.edgeStyle || 'smoothstep',
    edgeColor: project.edgeColor || '#9aaea4',
    edgeWidth: project.edgeWidth || 2,
    arrowHead: project.arrowHead || 'closed',
  }
}
const toneColors = {
  mint: '#bce7d5',
  blue: '#c5ddf4',
  coral: '#f4c8bd',
  lavender: '#ddd0f2',
  yellow: '#f2e4a7',
  teal: '#b8e3e4',
  peach: '#f4d1a7',
  rose: '#f2c4d2',
  slate: '#d4dce4',
}
const tones = Object.keys(toneColors)
const nodeEmojis = [
  { emoji: '💡', label: 'فكرة' },
  { emoji: '🪄', label: 'إبداع' },
  { emoji: '🎯', label: 'هدف' },
  { emoji: '🧠', label: 'تفكير' },
  { emoji: '🧩', label: 'حل' },
  { emoji: '🧭', label: 'اتجاه' },
  { emoji: '🗺️', label: 'خريطة' },
  { emoji: '📚', label: 'تعلم' },
  { emoji: '📖', label: 'قراءة' },
  { emoji: '📝', label: 'ملاحظة' },
  { emoji: '🔍', label: 'بحث' },
  { emoji: '🔬', label: 'استكشاف' },
  { emoji: '🧪', label: 'تجربة علمية' },
  { emoji: '🧬', label: 'علوم' },
  { emoji: '⭐', label: 'مهم' },
  { emoji: '💎', label: 'قيمة' },
  { emoji: '🌱', label: 'نمو' },
  { emoji: '✅', label: 'مكتمل' },
  { emoji: '⚡', label: 'سريع' },
  { emoji: '💬', label: 'نقاش' },
  { emoji: '🤝', label: 'تعاون' },
  { emoji: '👥', label: 'فريق' },
  { emoji: '🎨', label: 'إبداع' },
  { emoji: '⚙️', label: 'إعداد' },
  { emoji: '🛠️', label: 'عمل' },
  { emoji: '📌', label: 'تثبيت' },
  { emoji: '🚀', label: 'انطلاق' },
  { emoji: '💭', label: 'خواطر' },
  { emoji: '🔗', label: 'رابط' },
  { emoji: '📊', label: 'بيانات' },
  { emoji: '📅', label: 'موعد' },
  { emoji: '🗓️', label: 'خطة زمنية' },
  { emoji: '⏳', label: 'مدة' },
  { emoji: '🔔', label: 'تنبيه' },
  { emoji: '🏆', label: 'إنجاز' },
  { emoji: '🏁', label: 'مرحلة' },
  { emoji: '⚠️', label: 'تحذير' },
  { emoji: '⛔', label: 'متوقف' },
  { emoji: '📈', label: 'تقدم' },
  { emoji: '🗂️', label: 'تصنيف' },
  { emoji: '💻', label: 'تقنية' },
  { emoji: '☁️', label: 'سحابة' },
]
function EmojiGlyph({ emoji }) {
  const assetUrl = emojiDataUrl(emoji)
  return <span className="emoji-glyph" aria-hidden="true"><span>{emoji}</span>{assetUrl && <img src={assetUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />}</span>
}
const isHexColor = (color) => /^#[\da-f]{6}$/i.test(color || '')
const arrowHeads = { closed: MarkerType.ArrowClosed, open: MarkerType.Arrow }

function getMarkerEnd(arrowHead, color) {
  return arrowHead === 'none' ? undefined : { type: arrowHeads[arrowHead] || MarkerType.ArrowClosed, color }
}

function getDescendantIds(rootId, edges) {
  const descendants = new Set()
  const pending = [rootId]
  while (pending.length) {
    const current = pending.shift()
    edges.forEach((edge) => {
      if (edge.source === current && !descendants.has(edge.target)) {
        descendants.add(edge.target)
        pending.push(edge.target)
      }
    })
  }
  return descendants
}

function isIdeaConnectedToIdeaBranch(firstNode, secondNode, nodes, edges) {
  const ideaNode = firstNode?.data.kind === 'idea' ? firstNode : secondNode?.data.kind === 'idea' ? secondNode : null
  const branchNode = firstNode?.data.kind === 'branch' ? firstNode : secondNode?.data.kind === 'branch' ? secondNode : null
  if (!ideaNode || !branchNode) return false
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return edges.some((edge) => edge.target === branchNode.id && nodesById.get(edge.source)?.data.kind === 'idea')
}

function compareBranchOrder(left, right) {
  const leftOrder = left.data.order
  const rightOrder = right.data.order
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  return left.position.y - right.position.y
}

function isSameBranchSide(firstEdge, secondEdge) {
  const firstSide = firstEdge?.sourceHandle === 'source-left' ? 'left' : 'right'
  const secondSide = secondEdge?.sourceHandle === 'source-left' ? 'left' : 'right'
  return firstSide === secondSide
}

function arrangeMapForward(nodes, edges, preserveRootPositions = false) {
  const visibleNodes = nodes.filter((node) => !node.hidden)
  if (!visibleNodes.length) return nodes
  const nodesById = new Map(visibleNodes.map((node) => [node.id, node]))
  const parentById = new Map()
  const directionByChild = new Map()
  edges.forEach((edge) => {
    if (edge.source !== edge.target && nodesById.has(edge.source) && nodesById.has(edge.target) && !parentById.has(edge.target)) {
      parentById.set(edge.target, edge.source)
      directionByChild.set(edge.target, edge.sourceHandle === 'source-left' ? 'left' : 'right')
    }
  })
  const childrenById = new Map(visibleNodes.map((node) => [node.id, []]))
  parentById.forEach((parentId, childId) => childrenById.get(parentId)?.push(childId))
  childrenById.forEach((children) => children.sort((leftId, rightId) => compareBranchOrder(nodesById.get(leftId), nodesById.get(rightId))))

  const heightOf = (node) => Math.max(node.data.kind === 'idea' ? 76 : 50, node.measured?.height ?? node.height ?? 64)
  const widthOf = (node) => Math.max(node.data.kind === 'idea' ? 190 : 150, node.measured?.width ?? node.width ?? 190)
  const childGap = 48
  const levelGap = 150
  const measurements = new Map()
  const groupHeight = (children) => children.reduce((total, childId) => total + measure(childId), 0)
    + Math.max(0, children.length - 1) * childGap
  const measure = (id, path = new Set()) => {
    if (measurements.has(id)) return measurements.get(id).height
    const node = nodesById.get(id)
    if (!node || path.has(id)) return node ? heightOf(node) : 0
    const nextPath = new Set(path).add(id)
    const children = (childrenById.get(id) || []).filter((childId) => !nextPath.has(childId))
    const leftChildren = children.filter((childId) => directionByChild.get(childId) === 'left')
    const rightChildren = children.filter((childId) => directionByChild.get(childId) !== 'left')
    const nodeHeight = heightOf(node)
    const rightHeight = groupHeight(rightChildren)
    const leftHeight = groupHeight(leftChildren)
    const rightTop = (nodeHeight - rightHeight) / 2
    const leftTop = (nodeHeight - leftHeight) / 2
    const minOffset = Math.min(0, rightTop, leftTop)
    const maxOffset = Math.max(
      nodeHeight,
      rightTop + rightHeight,
      leftTop + leftHeight,
    )
    const measurement = { height: maxOffset - minOffset, minOffset }
    measurements.set(id, measurement)
    return measurement.height
  }

  const roots = visibleNodes.filter((node) => !parentById.has(node.id)).sort(compareBranchOrder)
  if (!roots.length) roots.push(visibleNodes[0])
  const startX = Math.min(...visibleNodes.map((node) => node.position.x))
  let cursorY = Math.min(...visibleNodes.map((node) => node.position.y))
  const positions = new Map()
  const placed = new Set()

  const place = (id, x, top, path = new Set()) => {
    const node = nodesById.get(id)
    if (!node || placed.has(id) || path.has(id)) return
    placed.add(id)
    const measurement = measurements.get(id) || { minOffset: 0 }
    const height = heightOf(node)
    const y = top - measurement.minOffset
    positions.set(id, { x, y })

    const children = (childrenById.get(id) || []).filter((childId) => !placed.has(childId))
    const nextPath = new Set(path).add(id)
    const leftChildren = children.filter((childId) => directionByChild.get(childId) === 'left')
    const rightChildren = children.filter((childId) => directionByChild.get(childId) !== 'left')
    let rightTop = y + height / 2 - groupHeight(rightChildren) / 2
    let leftTop = y + height / 2 - groupHeight(leftChildren) / 2
    const leftColumnX = leftChildren.length
      ? x - Math.max(...leftChildren.map((childId) => widthOf(nodesById.get(childId)))) - levelGap
      : x
    children.forEach((childId) => {
      const isLeft = directionByChild.get(childId) === 'left'
      const childX = isLeft ? leftColumnX : x + widthOf(node) + levelGap
      const childTop = isLeft ? leftTop : rightTop
      place(childId, childX, childTop, nextPath)
      if (isLeft) leftTop += measure(childId) + childGap
      else rightTop += measure(childId) + childGap
    })
  }

  roots.forEach((root) => {
    const rootHeight = measure(root.id)
    if (preserveRootPositions) {
      const rootMetrics = measurements.get(root.id) || { minOffset: 0 }
      place(root.id, root.position.x, root.position.y + rootMetrics.minOffset)
    } else {
      place(root.id, startX, cursorY)
      cursorY += rootHeight + childGap * 2
    }
  })
  visibleNodes.forEach((node) => {
    if (placed.has(node.id)) return
    const height = measure(node.id)
    if (preserveRootPositions) {
      const nodeMetrics = measurements.get(node.id) || { minOffset: 0 }
      place(node.id, node.position.x, node.position.y + nodeMetrics.minOffset)
    } else {
      place(node.id, startX, cursorY)
      cursorY += height + childGap * 2
    }
  })

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) || node.position }))
}

function arrangeSiblingBranches(nodes, edges, parentId, orderedIds) {
  const parent = nodes.find((node) => node.id === parentId)
  if (!parent) return nodes

  const orderedSiblings = orderedIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node) => node && !node.hidden && edges.some((edge) => edge.source === parentId && edge.target === node.id))
  const visibleNodeIds = new Set(nodes.filter((node) => !node.hidden).map((node) => node.id))
  const visibleEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  const orderById = new Map(orderedSiblings.map((node, index) => [node.id, index]))
  const parentCenterY = parent.position.y + Math.max(parent.data.kind === 'idea' ? 76 : 50, parent.measured?.height ?? parent.height ?? 64) / 2
  const levelGap = 150
  const siblingGap = 48
  const deltas = new Map()

  for (const side of ['left', 'right']) {
    const siblings = orderedSiblings.filter((node) => {
      const edge = edges.find((item) => item.source === parentId && item.target === node.id)
      return (edge?.sourceHandle === 'source-left' ? 'left' : 'right') === side
    })
    if (!siblings.length) continue

    const groups = siblings.map((node) => {
      const ids = new Set([node.id, ...getDescendantIds(node.id, visibleEdges)])
      const members = nodes.filter((item) => !item.hidden && ids.has(item.id))
      const top = Math.min(...members.map((item) => item.position.y))
      const bottom = Math.max(...members.map((item) => item.position.y + Math.max(item.data.kind === 'idea' ? 76 : 50, item.measured?.height ?? item.height ?? 64)))
      return { node, ids, top, height: bottom - top }
    })
    const totalHeight = groups.reduce((total, group) => total + group.height, 0) + Math.max(0, groups.length - 1) * siblingGap
    let cursorY = parentCenterY - totalHeight / 2
    const widestSibling = Math.max(...siblings.map((node) => node.measured?.width ?? node.width ?? 190))
    const columnX = side === 'left'
      ? parent.position.x - widestSibling - levelGap
      : parent.position.x + (parent.measured?.width ?? parent.width ?? 190) + levelGap

    groups.forEach(({ node, ids, top, height }) => {
      const delta = { x: columnX - node.position.x, y: cursorY - top }
      ids.forEach((id) => deltas.set(id, delta))
      cursorY += height + siblingGap
    })
  }

  return nodes.map((node) => {
    const delta = deltas.get(node.id)
    const order = orderById.get(node.id)
    return {
      ...node,
      ...(delta ? { position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : {}),
      ...(order !== undefined ? { data: { ...node.data, order } } : {}),
    }
  })
}

function getToneColor(tone, customColor) {
  return isHexColor(customColor) ? customColor : toneColors[tone] || toneColors.mint
}

function readSavedMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return {
      title: saved?.title || 'خريطة بدون عنوان',
      nodes: Array.isArray(saved?.nodes) ? saved.nodes : [],
      edges: Array.isArray(saved?.edges) ? saved.edges : [],
      edgeStyle: saved?.edgeStyle || 'smoothstep',
      edgeColor: saved?.edgeColor || '#9aaea4',
      edgeWidth: saved?.edgeWidth || 2,
      arrowHead: saved?.arrowHead || 'closed',
    }
  } catch {
    return { title: 'خريطة بدون عنوان', nodes: [], edges: [], edgeStyle: 'smoothstep', edgeColor: '#9aaea4', edgeWidth: 2, arrowHead: 'closed' }
  }
}

function MapNode({ data, selected, width }) {
  const Icon = data.kind === 'note' ? StickyNote : data.kind === 'branch' ? GitBranch : Lightbulb
  const customColor = isHexColor(data.customColor) ? data.customColor : ''
  const [editing, setEditing] = useState(false)
  const labelRef = useRef(null)
  const label = data.label || ''
  const displayLabel = data.language === 'en' ? translateToEnglish(label) : label
  const resizeText = displayLabel || (data.language === 'en' ? 'Untitled' : 'بدون عنوان')
  const minNodeWidth = data.kind === 'idea' ? 190 : 150
  const minNodeHeight = Math.max(data.kind === 'idea' ? 76 : 64, Math.ceil((resizeText.length * 7.2) / Math.max(54, (width ?? 190) - 82)) * 18 + 30)
  const sourceHandle = (side, position) => (
    <Handle
      key={`source-${side}`}
      type="source"
      position={position}
      id={`source-${side}`}
      className={`branch-toggle-handle branch-toggle-${side}`}
      style={{ top: '48%' }}
      title={data.language === 'en'
        ? `Click to collapse or expand branches ${side === 'right' ? 'on the right' : 'on the left'}`
        : `اضغط لطي أو فتح الفروع ${side === 'right' ? 'يمينًا' : 'يسارًا'}`}
      onClick={(event) => {
        event.stopPropagation()
        data.onSelect?.()
        data.onToggleBranch?.()
      }}
    />
  )

  useEffect(() => {
    if (!labelRef.current) return
    labelRef.current.style.height = 'auto'
    labelRef.current.style.height = `${labelRef.current.scrollHeight}px`
  }, [label, editing])

  const startEditing = (event) => {
    event.stopPropagation()
    data.onSelect?.()
    data.onCloseNotes?.()
    setEditing(true)
  }

  const finishEditing = () => {
    setEditing(false)
  }

  return (
    <div
      className={`map-node tone-${data.tone || 'mint'}${customColor ? ' has-custom-color' : ''}${selected ? ' is-selected' : ''}${data.dropHint ? ` drop-${data.dropHint}` : ''}`}
      style={{ width: '100%', height: '100%', boxSizing: 'border-box', ...(customColor ? { '--custom-node-color': customColor } : {}) }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={minNodeWidth}
        minHeight={minNodeHeight}
        maxWidth={520}
        maxHeight={360}
        lineStyle={{ borderColor: '#4b9a76' }}
        handleStyle={{ width: 8, height: 8, borderRadius: 3, borderColor: '#fff', background: '#4b9a76' }}
      />
      <Handle type="target" position={Position.Left} id="target-left" className="branch-target-handle branch-target-left" style={{ top: '52%' }} />
      <Handle type="target" position={Position.Right} id="target-right" className="branch-target-handle branch-target-right" style={{ top: '52%' }} />
      <button className="node-icon nodrag" type="button" title={data.language === 'en' ? 'Open node note' : 'افتح ملاحظة العقدة'} aria-label={data.language === 'en' ? 'Open node note' : 'افتح ملاحظة العقدة'}>
        <Icon size={16} strokeWidth={1.8} />
      </button>
      {data.emoji && <span className="node-emoji" aria-label={`${data.language === 'en' ? 'Emoji' : 'إيموجي'} ${data.emoji}`} title={data.emoji}><EmojiGlyph emoji={data.emoji} /></span>}
      {editing ? (
        <textarea
          ref={labelRef}
          className="node-label-input nodrag"
          aria-label={data.language === 'en' ? 'Node name' : 'اسم العقدة'}
          value={label}
          rows={1}
          autoFocus
          onChange={(event) => data.onLabelChange?.(event.target.value)}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              finishEditing()
            }
          }}
        />
      ) : (
        <button className="node-label node-label-button nodrag" type="button" onClick={startEditing} title={data.language === 'en' ? 'Edit node name' : 'تحرير اسم العقدة'}>
          {displayLabel || (data.language === 'en' ? 'Untitled' : 'بدون عنوان')}
        </button>
      )}
      {sourceHandle('left', Position.Left)}
      {sourceHandle('right', Position.Right)}
    </div>
  )
}

const nodeTypes = { mapNode: MapNode }

function App() {
  const [projects, setProjects] = useState(readProjects)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [openProjectIds, setOpenProjectIds] = useState([])
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('waraqa-theme') === 'dark' ? 'dark' : 'light')
  const [renameProjectOpen, setRenameProjectOpen] = useState(false)
  const [renameProjectDraft, setRenameProjectDraft] = useState('')
  const [pendingDeleteProject, setPendingDeleteProject] = useState(null)
  const [pendingCloseProjectId, setPendingCloseProjectId] = useState(null)
  const [savedMap] = useState(() => projects[0] || readSavedMap())
  const [title, setTitle] = useState(savedMap.title)
  const [nodes, setNodes] = useState(savedMap.nodes)
  const [edges, setEdges] = useState(savedMap.edges)
  const [edgeStyle, setEdgeStyle] = useState(savedMap.edgeStyle)
  const [edgeColor, setEdgeColor] = useState(savedMap.edgeColor)
  const [edgeWidth, setEdgeWidth] = useState(savedMap.edgeWidth)
  const [arrowHead, setArrowHead] = useState(savedMap.arrowHead)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [desktopMaximized, setDesktopMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('waraqa-language') || 'ar')
  const [activeTone, setActiveTone] = useState('mint')
  const [activeCustomColor, setActiveCustomColor] = useState(toneColors.mint)
  const [exportingImage, setExportingImage] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesMounted, setNotesMounted] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [miniMapVisible, setMiniMapVisible] = useState(() => localStorage.getItem('waraqa-minimap-visible') !== 'false')
  const [selectionDrag, setSelectionDrag] = useState(null)
  const [tautEdgeId, setTautEdgeId] = useState(null)
  const [branchDropHint, setBranchDropHint] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const flowRef = useRef(null)
  const layoutAnimationFrame = useRef(null)
  const lastEdgeTap = useRef({ id: null, time: 0 })
  const canvasRef = useRef(null)
  const importRef = useRef(null)
  const renameInputRef = useRef(null)
  const searchInputRef = useRef(null)
  const shortcutActionsRef = useRef(null)
  const dragSnapshot = useRef(null)
  const [linkSourceNodeId, setLinkSourceNodeId] = useState(null)
  const projectSavePoints = useRef(new Map())
  const [copiedNode, setCopiedNode] = useState(null)
  const pasteCount = useRef(0)
  const desktopWindow = window.waraqaWindow
  useEffect(() => {
    document.documentElement.lang = appLanguage
  }, [appLanguage])
  const toggleTheme = () => setTheme((current) => {
    const next = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem('waraqa-theme', next)
    return next
  })
  const changeLanguage = (event) => {
    const next = event.target.value
    setAppLanguage(next)
    localStorage.setItem('waraqa-language', next)
  }
  const settingsDialog = settingsOpen && (
    <div className="confirm-overlay settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
      <section className="confirm-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" dir="rtl">
        <div className="settings-heading"><span className="confirm-icon settings-icon"><Settings2 size={20} /></span><button type="button" className="settings-close" aria-label="إغلاق الإعدادات" onClick={() => setSettingsOpen(false)}><X size={17} /></button></div>
        <h2 id="settings-dialog-title">إعدادات البرنامج</h2>
        <p>غيّر لغة الواجهة ومظهر البرنامج.</p>
        <label className="settings-field-label" htmlFor="app-language-select">اللغة</label>
        <select id="app-language-select" className="settings-select" value={appLanguage} onChange={changeLanguage}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
        <span className="settings-field-label">المظهر</span>
        <div className="settings-theme-options">
          <button type="button" className={`settings-theme-option${theme === 'light' ? ' is-active' : ''}`} onClick={() => { setTheme('light'); localStorage.setItem('waraqa-theme', 'light') }}><Sun size={16} /> نهاري</button>
          <button type="button" className={`settings-theme-option${theme === 'dark' ? ' is-active' : ''}`} onClick={() => { setTheme('dark'); localStorage.setItem('waraqa-theme', 'dark') }}><Moon size={16} /> ليلي</button>
        </div>
      </section>
    </div>
  )
  const selectedNode = nodes.find((node) => node.selected)
  const selectedNodes = nodes.filter((node) => node.selected)
  const linkSourceNode = selectedNodes.find((node) => node.id === linkSourceNodeId) || selectedNodes[0]
  const linkableSelectedNodes = selectedNodes.filter((node) => (
    node.id !== linkSourceNode?.id
    && !edges.some((edge) => edge.target === node.id)
    && !getDescendantIds(node.id, edges).has(linkSourceNode?.id)
    && !isIdeaConnectedToIdeaBranch(linkSourceNode, node, nodes, edges)
  ))
  const selectedIncomingSides = selectedNode
    ? edges.filter((edge) => edge.target === selectedNode.id).map((edge) => edge.targetHandle === 'target-right' ? 'right' : 'left')
    : []
  const canBranchLeft = Boolean(selectedNode) && !selectedIncomingSides.includes('left')
  const canBranchRight = Boolean(selectedNode) && !selectedIncomingSides.includes('right')
  const canInsertBranchRight = Boolean(selectedNode) && (
    canBranchRight || edges.some((edge) => edge.target === selectedNode.id && edge.sourceHandle === 'source-left')
  )
  const selectedDescendantIds = selectedNode ? getDescendantIds(selectedNode.id, edges) : new Set()
  const descendants = selectedNode ? nodes.filter((node) => selectedDescendantIds.has(node.id)) : []
  const branchCollapsed = descendants.length > 0 && descendants.every((node) => node.hidden)
  const pickerColor = getToneColor(
    selectedNode?.data.tone || activeTone,
    selectedNode?.data.customColor || (activeTone === 'custom' ? activeCustomColor : ''),
  )

  useEffect(() => {
    if (!desktopWindow) return undefined
    let mounted = true
    desktopWindow.isMaximized().then((maximized) => {
      if (mounted) setDesktopMaximized(maximized)
    })
    const unsubscribe = desktopWindow.onMaximizeChange(setDesktopMaximized)
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [desktopWindow])

  useEffect(() => {
    if (!renameProjectOpen) return undefined
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [renameProjectOpen])

  const focusNode = (node) => {
    if (!node || !flowRef.current) return
    const width = node.measured?.width ?? node.width ?? 190
    const height = node.measured?.height ?? node.height ?? 64
    flowRef.current.setCenter(
      node.position.x + width / 2,
      node.position.y + height / 2,
      { zoom: 1.12, duration: 520 },
    )
  }

  const openNotes = (node = selectedNode) => {
    setToolsOpen(false)
    setNotesMounted(true)
    window.requestAnimationFrame(() => {
      setNotesOpen(true)
      focusNode(node)
    })
  }

  const closeNotes = () => {
    setNotesOpen(false)
    setToolsOpen(true)
    window.setTimeout(() => setNotesMounted(false), 240)
  }

  const openSearch = () => {
    setActiveMenu(null)
    setSearchOpen(true)
  }

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const selectNode = (id) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))
  }

  const chooseSearchResult = (node) => {
    const revealIds = new Set([node.id])
    let foundParent = true
    while (foundParent) {
      foundParent = false
      edges.forEach((edge) => {
        if (revealIds.has(edge.target) && !revealIds.has(edge.source)) {
          revealIds.add(edge.source)
          foundParent = true
        }
      })
    }
    setNodes((current) => current.map((item) => ({
      ...item,
      hidden: revealIds.has(item.id) ? false : item.hidden,
      selected: item.id === node.id,
    })))
    focusNode({ ...node, hidden: false })
    setSearchQuery('')
    setSearchOpen(false)
  }

  const updateNodeLabel = (id, label) => {
    setNodes((current) => current.map((node) => (
      node.id === id ? { ...node, data: { ...node.data, label } } : node
    )))
  }

  const renderedNodes = nodes.map((node) => ({
    ...node,
    ...(node.data.kind === 'idea' ? {
      width: Math.max(190, node.width || 0),
      height: Math.max(76, node.height || 0),
    } : {}),
    draggable: node.data.kind === 'branch' ? true : node.draggable,
    data: {
      ...node.data,
      language: appLanguage,
      incomingSides: edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.targetHandle === 'target-right' ? 'right' : 'left'),
      onSelect: () => selectNode(node.id),
      onLabelChange: (label) => updateNodeLabel(node.id, label),
      onCloseNotes: closeNotes,
      onToggleBranch: () => toggleBranch(node),
      dropHint: branchDropHint?.nodeId === node.id ? branchDropHint.side : null,
    },
  }))
  const renderedEdges = edges.map((edge) => ({
    ...edge,
    className: edge.id === tautEdgeId ? 'thread-taut' : edge.className,
    hidden: nodes.some((node) => node.id === edge.source && node.hidden)
      || nodes.some((node) => node.id === edge.target && node.hidden),
  }))
  const searchResults = searchQuery.trim()
    ? nodes.filter((node) => `${node.data.label} ${node.data.note || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 8)
    : []

  const onNodesChange = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  )
  const onEdgesChange = useCallback(
    (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  )

  const remember = () => {
    setUndoStack((current) => [...current, { nodes, edges }].slice(-50))
    setRedoStack([])
  }

  const animateNodeLayout = (targetNodes, focusId = null) => {
    const duration = 560
    if (layoutAnimationFrame.current !== null) {
      window.cancelAnimationFrame(layoutAnimationFrame.current)
      layoutAnimationFrame.current = null
    }
    const startPositions = new Map(targetNodes.map((node) => [
      node.id,
      nodes.find((current) => current.id === node.id)?.position || node.position,
    ]))
    const targetById = new Map(targetNodes.map((node) => [node.id, node]))
    let startedAt = null
    const mergeLayoutNodes = (current, progress) => {
      const currentIds = new Set(current.map((node) => node.id))
      const updated = current.map((node) => {
        const target = targetById.get(node.id)
        if (!target) return node
        const from = startPositions.get(node.id)
        return {
          ...node,
          ...target,
          position: {
            x: from.x + (target.position.x - from.x) * progress,
            y: from.y + (target.position.y - from.y) * progress,
          },
        }
      })
      for (const node of targetNodes) {
        if (!currentIds.has(node.id)) {
          updated.push({ ...node, position: { ...node.position } })
        }
      }
      return updated
    }
    setNodes((current) => mergeLayoutNodes(current, 0))

    const animate = (time) => {
      if (startedAt === null) startedAt = time
      const progress = Math.min(1, (time - startedAt) / duration)
      const eased = progress < 0.5
        ? 16 * progress ** 5
        : 1 - ((-2 * progress + 2) ** 5) / 2
      setNodes((current) => mergeLayoutNodes(current, eased))
      if (progress < 1) layoutAnimationFrame.current = window.requestAnimationFrame(animate)
      else {
        layoutAnimationFrame.current = null
        if (focusId) {
          const focusedNode = targetNodes.find((node) => node.id === focusId)
          if (focusedNode) focusNode(focusedNode)
        }
      }
    }
    layoutAnimationFrame.current = window.requestAnimationFrame(animate)
  }

  const arrangeAllNodes = () => {
    if (nodes.length < 2) return
    remember()
    animateNodeLayout(arrangeMapForward(nodes, edges))
    window.setTimeout(() => flowRef.current?.fitView({ padding: 0.2, duration: 420 }), 620)
  }

  const removeEdge = (event, edge) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (!edges.some((item) => item.id === edge.id)) return
    remember()
    const nextEdges = edges.filter((item) => item.id !== edge.id)
    setEdges(nextEdges)
    const siblings = nodes
      .filter((node) => node.data.kind === 'branch' && nextEdges.some((item) => item.source === edge.source && item.target === node.id))
      .sort(compareBranchOrder)
    if (edge.target) animateNodeLayout(arrangeSiblingBranches(nodes, nextEdges, edge.source, siblings.map((node) => node.id)))
  }

  const removeEdgeFromContextMenu = (event, edge) => removeEdge(event, edge)
  const handleEdgeClick = (event, edge) => {
    if (!window.matchMedia('(max-width: 780px)').matches) return
    const now = event.timeStamp
    const previousTap = lastEdgeTap.current
    if (previousTap.id === edge.id && now - previousTap.time <= 450) {
      lastEdgeTap.current = { id: null, time: 0 }
      removeEdge(event, edge)
    } else {
      lastEdgeTap.current = { id: edge.id, time: now }
    }
  }

  const onConnect = (connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source)
    const targetNode = nodes.find((node) => node.id === connection.target)
    if (isIdeaConnectedToIdeaBranch(sourceNode, targetNode, nodes, edges)) return
    setUndoStack((current) => [...current, { nodes, edges }].slice(-50))
    setRedoStack([])
    const nextEdges = addEdge({
      ...connection,
      type: edgeStyle,
      markerEnd: getMarkerEnd(arrowHead, edgeColor),
      style: { stroke: edgeColor, strokeWidth: edgeWidth },
    }, edges)
    const nextNodes = nodes.map((node) => (
      (node.id === connection.source || node.id === connection.target) && node.data.detached
        ? { ...node, data: { ...node.data, detached: false } }
        : node
    ))
    setEdges(nextEdges)
    const connectedChild = nextNodes.find((node) => node.id === connection.target)
    const connectedParent = nextNodes.find((node) => node.id === connection.source)
    if (connectedChild?.data.kind === 'branch') {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === connection.source && edge.target === node.id))
        .sort(compareBranchOrder)
      const orderedNodes = arrangeSiblingBranches(nextNodes, nextEdges, connection.source, siblings.map((node) => node.id), connection.target)
      animateNodeLayout(arrangeMapForward(orderedNodes, nextEdges, true))
    } else if (connectedChild && connectedParent) {
      const sourceWidth = connectedParent.measured?.width ?? connectedParent.width ?? 190
      const childWidth = connectedChild.measured?.width ?? connectedChild.width ?? 190
      const direction = connection.sourceHandle === 'source-left' ? 'left' : 'right'
      const childX = direction === 'left'
        ? connectedParent.position.x - childWidth - 170
        : connectedParent.position.x + sourceWidth + 170
      const shiftX = childX - connectedChild.position.x
      const movedIds = new Set([connectedChild.id, ...getDescendantIds(connectedChild.id, nextEdges)])
      animateNodeLayout(nextNodes.map((node) => movedIds.has(node.id)
        ? { ...node, position: { ...node.position, x: node.position.x + shiftX } }
        : node))
    } else setNodes(nextNodes)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }))
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead])

  useEffect(() => {
    if (!activeProjectId) return
    const timeout = window.setTimeout(() => {
      setProjects((current) => {
        const next = current.map((project) => project.id === activeProjectId
          ? { ...project, title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead, updatedAt: currentTimestamp() }
          : project)
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
        return next
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeProjectId, title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead])

  const saveNow = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }))
    if (activeProjectId) {
      const projectState = createProjectSavePoint({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead })
      projectSavePoints.current.set(activeProjectId, projectState)
      const next = projects.map((project) => project.id === activeProjectId
        ? { ...project, ...projectState, updatedAt: currentTimestamp() }
        : project)
      setProjects(next)
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
    }
  }

  const openRenameProject = () => {
    setRenameProjectDraft(title)
    setRenameProjectOpen(true)
    setActiveMenu(null)
  }

  const renameProject = () => {
    const nextTitle = renameProjectDraft.trim()
    if (!nextTitle) return
    setTitle(nextTitle)
    setRenameProjectOpen(false)
  }

  const addNode = (kind = 'idea', parent = null, dropPosition = null, keepParentSelected = false, branchDirection = 'right') => {
    if (kind === 'branch' && parent) {
      const incomingSides = edges.filter((edge) => edge.target === parent.id).map((edge) => edge.targetHandle === 'target-right' ? 'right' : 'left')
      if (incomingSides.includes(branchDirection)) return
    }
    remember()
    const id = crypto.randomUUID()
    const position = dropPosition || (parent
      ? { x: branchDirection === 'left' ? parent.position.x - 250 : parent.position.x + 250, y: parent.position.y + 90 }
      : flowRef.current?.screenToFlowPosition({
          x: window.innerWidth * 0.48,
          y: window.innerHeight * 0.53,
        }) || { x: 180, y: 140 }
    )
    const node = {
      id,
      type: 'mapNode',
      position,
      data: {
        label: kind === 'note' ? 'ملاحظة جديدة' : parent ? 'فكرة فرعية' : 'فكرتي الجديدة',
        kind,
        ...(kind === 'branch' ? {
          branchDirection,
          order: parent ? edges.filter((edge) => edge.source === parent.id && nodes.find((item) => item.id === edge.target)?.data.kind === 'branch').length : 0,
        } : {}),
        tone: activeTone,
        ...(activeTone === 'custom' ? { customColor: activeCustomColor } : {}),
      },
      draggable: true,
      selected: !keepParentSelected,
    }
    if (kind === 'branch') {
      const newBranchEdge = parent ? {
        id: `e-${parent.id}-${id}`,
        source: parent.id,
        target: id,
        sourceHandle: branchDirection === 'left' ? 'source-left' : 'source-right',
        targetHandle: branchDirection === 'left' ? 'target-right' : 'target-left',
        type: edgeStyle,
        markerEnd: getMarkerEnd(arrowHead, edgeColor),
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
      } : null
      const branchEdges = newBranchEdge ? [...edges, newBranchEdge] : edges
      const branchNodes = [
        ...(keepParentSelected ? nodes : nodes.map((item) => ({ ...item, selected: false }))),
        node,
      ]
      if (newBranchEdge) {
        setEdges((current) => current.some((edge) => edge.id === newBranchEdge.id)
          ? current
          : [...current, newBranchEdge])
      }
      const siblings = branchNodes
        .filter((item) => item.data.kind === 'branch' && branchEdges.some((edge) => edge.source === parent?.id && edge.target === item.id))
        .sort(compareBranchOrder)
      if (parent) {
        const orderedNodes = arrangeSiblingBranches(branchNodes, branchEdges, parent.id, siblings.map((item) => item.id), id)
        animateNodeLayout(arrangeMapForward(orderedNodes, branchEdges, true), id)
      }
      else setNodes(branchNodes)
      return
    }
    setNodes((current) => [
      ...(keepParentSelected ? current : current.map((item) => ({ ...item, selected: false }))),
      node,
    ])
    if (parent) {
      setEdges((current) => [...current, {
        id: `e-${parent.id}-${id}`,
        source: parent.id,
        target: id,
        type: edgeStyle,
        markerEnd: getMarkerEnd(arrowHead, edgeColor),
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
      }])
    }
  }

  const insertBranchBeforeChildren = (branchDirection) => {
    if (!selectedNode) return
    const parentEdge = edges.find((edge) => edge.target === selectedNode.id)
    const insertTowardCenter = branchDirection === 'right' && parentEdge?.sourceHandle === 'source-left'
    if (branchDirection === 'left' || insertTowardCenter) {
      remember()
      const id = crypto.randomUUID()
      const direction = parentEdge?.sourceHandle === 'source-left' ? 'left' : 'right'
      const node = {
        id,
        type: 'mapNode',
        position: {
          x: selectedNode.position.x + (direction === 'left' ? 250 : -250),
          y: selectedNode.position.y,
        },
        data: {
          label: 'فكرة فرعية',
          kind: 'branch',
          branchDirection: parentEdge ? direction : 'left',
          insertedBranch: true,
          order: selectedNode.data.order || 0,
          tone: activeTone,
          ...(activeTone === 'custom' ? { customColor: activeCustomColor } : {}),
        },
        draggable: true,
        selected: true,
      }
      const nextEdges = edges.map((edge) => edge.id === parentEdge?.id
        ? { ...edge, id: `e-${edge.source}-${id}`, target: id }
        : edge)
      nextEdges.push({
        id: `e-${id}-${selectedNode.id}`,
        source: id,
        target: selectedNode.id,
        sourceHandle: direction === 'left' ? 'source-left' : 'source-right',
        targetHandle: direction === 'left' ? 'target-right' : 'target-left',
        type: edgeStyle,
        markerEnd: getMarkerEnd(arrowHead, edgeColor),
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
      })
      const nextNodes = nodes.map((item) => ({ ...item, selected: false })).concat(node)
      setEdges(nextEdges)
      animateNodeLayout(arrangeMapForward(nextNodes, nextEdges, true), id)
      return
    }
    const incomingSides = edges.filter((edge) => edge.target === selectedNode.id).map((edge) => edge.targetHandle === 'target-right' ? 'right' : 'left')
    if (incomingSides.includes(branchDirection)) return

    remember()
    const id = crypto.randomUUID()
    const node = {
      id,
      type: 'mapNode',
      position: {
        x: selectedNode.position.x + (branchDirection === 'left' ? -250 : 250),
        y: selectedNode.position.y,
      },
      data: {
        label: 'فكرة فرعية',
        kind: 'branch',
        branchDirection,
        insertedBranch: true,
        order: edges.filter((edge) => edge.source === selectedNode.id).length,
        tone: activeTone,
        ...(activeTone === 'custom' ? { customColor: activeCustomColor } : {}),
      },
      draggable: true,
      selected: true,
    }
    const branchIds = new Set(nodes.filter((item) => item.data.kind === 'branch').map((item) => item.id))
    const nextEdges = edges.map((edge) => {
      if (edge.source !== selectedNode.id || !branchIds.has(edge.target)) return edge
      const child = nodes.find((item) => item.id === edge.target)
      const childDirection = child?.data.branchDirection || 'right'
      return {
        ...edge,
        id: `e-${id}-${edge.target}`,
        source: id,
        sourceHandle: childDirection === 'left' ? 'source-left' : 'source-right',
      }
    })
    nextEdges.push({
      id: `e-${selectedNode.id}-${id}`,
      source: selectedNode.id,
      target: id,
      sourceHandle: branchDirection === 'left' ? 'source-left' : 'source-right',
      targetHandle: branchDirection === 'left' ? 'target-right' : 'target-left',
      type: edgeStyle,
      markerEnd: getMarkerEnd(arrowHead, edgeColor),
      style: { stroke: edgeColor, strokeWidth: edgeWidth },
    })

    const nextNodes = nodes.map((item) => ({ ...item, selected: false })).concat(node)
    setEdges(nextEdges)
    const siblings = nextNodes
      .filter((item) => item.data.kind === 'branch' && nextEdges.some((edge) => edge.source === selectedNode.id && edge.target === item.id))
      .sort(compareBranchOrder)
    const orderedNodes = arrangeSiblingBranches(nextNodes, nextEdges, selectedNode.id, siblings.map((item) => item.id), id)
    animateNodeLayout(arrangeMapForward(orderedNodes, nextEdges, true), id)
  }

  const changeEdgeStyle = (style) => {
    if (style === edgeStyle) return
    remember()
    setEdgeStyle(style)
    setEdges((current) => current.map((edge) => ({ ...edge, type: style })))
  }

  const changeEdgeSettings = (changes) => {
    remember()
    if (changes.edgeColor) setEdgeColor(changes.edgeColor)
    if (changes.edgeWidth) setEdgeWidth(changes.edgeWidth)
    if (changes.arrowHead) setArrowHead(changes.arrowHead)
    setEdges((current) => current.map((edge) => ({
      ...edge,
      markerEnd: getMarkerEnd(changes.arrowHead || arrowHead, changes.edgeColor || edgeColor),
      style: { ...edge.style, stroke: changes.edgeColor || edgeColor, strokeWidth: changes.edgeWidth || edgeWidth },
    })))
  }

  const toggleBranch = (rootNode = selectedNode) => {
    if (!rootNode) return
    const descendantIds = getDescendantIds(rootNode.id, edges)
    const branchNodes = nodes.filter((node) => descendantIds.has(node.id))
    if (!branchNodes.length) return
    remember()
    const shouldCollapse = branchNodes.some((node) => !node.hidden)
    const nextNodes = nodes.map((node) => descendantIds.has(node.id)
      ? { ...node, hidden: shouldCollapse, selected: shouldCollapse ? false : node.selected }
      : node
    )
    animateNodeLayout(arrangeMapForward(nextNodes, edges, true))
  }

  const startToolDrag = (event, kind, branchDirection = 'right') => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/waraqa-node', kind)
    event.dataTransfer.setData('application/waraqa-direction', branchDirection)
  }

  const handleCanvasDrop = (event) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/waraqa-node')
    if (!kind || !flowRef.current) return
    const position = flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const parent = kind === 'branch' ? selectedNode : null
    const branchDirection = event.dataTransfer.getData('application/waraqa-direction') || 'right'
    addNode(kind, parent, position, kind === 'branch', branchDirection)
  }

  const updateSelected = (changes) => {
    setNodes((current) => current.map((node) => (
      node.id === selectedNode?.id ? { ...node, data: { ...node.data, ...changes } } : node
    )))
  }

  const removeSelected = () => {
    if (!selectedNode) return
    remember()
    const parentEdge = edges.find((edge) => edge.target === selectedNode.id)
    const nextEdges = edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
    const nextNodes = nodes.filter((node) => node.id !== selectedNode.id)
    setEdges(nextEdges)
    if (parentEdge) {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === parentEdge.source && edge.target === node.id))
        .sort(compareBranchOrder)
      animateNodeLayout(arrangeSiblingBranches(nextNodes, nextEdges, parentEdge.source, siblings.map((node) => node.id)))
    } else setNodes(nextNodes)
  }

  const removeSelectedNodes = () => {
    if (!selectedNodes.length) return
    remember()
    const selectedIds = new Set(selectedNodes.map((node) => node.id))
    const affectedParents = [...new Set(edges.filter((edge) => selectedIds.has(edge.target)).map((edge) => edge.source))]
    const nextEdges = edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target))
    let nextNodes = nodes.filter((node) => !selectedIds.has(node.id))
    affectedParents.forEach((parentId) => {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === parentId && edge.target === node.id))
        .sort(compareBranchOrder)
      nextNodes = arrangeSiblingBranches(nextNodes, nextEdges, parentId, siblings.map((node) => node.id))
    })
    setEdges(nextEdges)
    animateNodeLayout(nextNodes)
    closeNotes()
  }

  const onNodesDelete = (deletedNodes) => {
    const deletedIds = new Set(deletedNodes.map((node) => node.id))
    const affectedParents = [...new Set(edges.filter((edge) => deletedIds.has(edge.target)).map((edge) => edge.source))]
    const nextEdges = edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target))
    let nextNodes = nodes.filter((node) => !deletedIds.has(node.id))
    affectedParents.forEach((parentId) => {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === parentId && edge.target === node.id))
        .sort(compareBranchOrder)
      nextNodes = arrangeSiblingBranches(nextNodes, nextEdges, parentId, siblings.map((node) => node.id))
    })
    setEdges(nextEdges)
    animateNodeLayout(nextNodes)
  }

  const linkSelectedNodes = () => {
    if (!linkSourceNode || !linkableSelectedNodes.length) return
    remember()
    const targetIds = new Set(linkableSelectedNodes.map((node) => node.id))
    const nextEdges = [
      ...edges,
      ...linkableSelectedNodes.map((node, index) => ({
        id: `e-${linkSourceNode.id}-${node.id}`,
        source: linkSourceNode.id,
        target: node.id,
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
        type: edgeStyle,
        markerEnd: getMarkerEnd(arrowHead, edgeColor),
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
        data: { order: index },
      })),
    ]
    const nextNodes = nodes.map((node) => targetIds.has(node.id)
      ? {
          ...node,
          data: {
            ...node.data,
            detached: false,
            ...(node.data.kind === 'branch' ? { branchDirection: 'right', order: linkableSelectedNodes.findIndex((target) => target.id === node.id) } : {}),
          },
        }
      : node)
    setEdges(nextEdges)
    const orderedNodes = arrangeSiblingBranches(nextNodes, nextEdges, linkSourceNode.id, linkableSelectedNodes.map((node) => node.id))
    animateNodeLayout(arrangeMapForward(orderedNodes, nextEdges, true), linkSourceNode.id)
  }

  const startMultiSelect = (event) => {
    if (!event.ctrlKey || event.button !== 2) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const canvasBounds = event.currentTarget.getBoundingClientRect()
    setSelectionDrag({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      originLeft: canvasBounds.left,
      originTop: canvasBounds.top,
    })
  }

  const moveMultiSelect = (event) => {
    if (!selectionDrag) return
    event.preventDefault()
    setSelectionDrag((current) => current && ({ ...current, currentX: event.clientX, currentY: event.clientY }))
  }

  const finishMultiSelect = (event) => {
    if (!selectionDrag) return
    event.preventDefault()
    const selection = {
      left: Math.min(selectionDrag.startX, selectionDrag.currentX),
      right: Math.max(selectionDrag.startX, selectionDrag.currentX),
      top: Math.min(selectionDrag.startY, selectionDrag.currentY),
      bottom: Math.max(selectionDrag.startY, selectionDrag.currentY),
    }
    const selectedIds = new Set()
    document.querySelectorAll('.react-flow__node').forEach((element) => {
      const bounds = element.getBoundingClientRect()
      const overlaps = bounds.right >= selection.left
        && bounds.left <= selection.right
        && bounds.bottom >= selection.top
        && bounds.top <= selection.bottom
      if (overlaps) selectedIds.add(element.getAttribute('data-id'))
    })
    setNodes((current) => current.map((node) => ({ ...node, selected: selectedIds.has(node.id) })))
    setSelectionDrag(null)
  }

  const duplicateSelected = () => {
    if (!selectedNode) return
    remember()
    const id = crypto.randomUUID()
    const duplicate = {
      ...selectedNode,
      id,
      position: { x: selectedNode.position.x + 34, y: selectedNode.position.y + 34 },
      data: { ...selectedNode.data },
      selected: true,
    }
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      duplicate,
    ])
  }

  const copySelected = () => {
    if (!selectedNode) return false
    const nodeIds = new Set([selectedNode.id, ...getDescendantIds(selectedNode.id, edges)])
    const copiedNodes = nodes
      .filter((node) => nodeIds.has(node.id))
      .map((node) => ({ ...node, data: { ...node.data } }))
    const copiedEdges = edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge }))
    setCopiedNode({ rootId: selectedNode.id, nodes: copiedNodes, edges: copiedEdges })
    pasteCount.current = 0
    return true
  }

  const pasteCopiedNode = () => {
    if (!copiedNode?.nodes?.length) return false
    remember()
    pasteCount.current += 1
    const offset = 34 + (pasteCount.current - 1) * 24
    const idMap = new Map(copiedNode.nodes.map((node) => [node.id, crypto.randomUUID()]))
    const pastedNodes = copiedNode.nodes.map((node) => {
      const { selected: _selected, dragging: _dragging, measured: _measured, positionAbsolute: _positionAbsolute, ...savedNode } = node
      const isRoot = node.id === copiedNode.rootId
      return {
        ...savedNode,
        id: idMap.get(node.id),
        position: { x: node.position.x + offset, y: node.position.y + offset },
        data: {
          ...node.data,
          ...(isRoot && node.data.kind === 'branch' ? { detached: true } : {}),
        },
        selected: isRoot,
        dragging: false,
      }
    })
    const pastedEdges = copiedNode.edges.map((edge) => ({
      ...edge,
      id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}`,
      source: idMap.get(edge.source),
      target: idMap.get(edge.target),
    }))
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pastedNodes])
    if (pastedEdges.length) setEdges((current) => [...current, ...pastedEdges])
    return true
  }

  const undo = () => {
    const previous = undoStack.at(-1)
    if (!previous) return
    setRedoStack((current) => [...current, { nodes, edges }])
    setNodes(previous.nodes)
    setEdges(previous.edges)
    setUndoStack((current) => current.slice(0, -1))
  }

  const redo = () => {
    const next = redoStack.at(-1)
    if (!next) return
    setUndoStack((current) => [...current, { nodes, edges }])
    setNodes(next.nodes)
    setEdges(next.edges)
    setRedoStack((current) => current.slice(0, -1))
  }

  useEffect(() => {
    shortcutActionsRef.current = { openSearch, saveNow, undo, redo, duplicateSelected, copySelected, pasteCopiedNode }
  })

  useEffect(() => {
    const handleShortcut = (event) => {
      const key = event.key.toLowerCase()
      const target = event.target
      const isEditingText = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))

      if (event.key === 'Escape') {
        setActiveMenu(null)
        setSearchOpen(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey) || isEditingText) return

      if (key === 'f') {
        event.preventDefault()
        shortcutActionsRef.current?.openSearch()
      } else if (key === 's') {
        event.preventDefault()
        shortcutActionsRef.current?.saveNow()
      } else if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        shortcutActionsRef.current?.redo()
      } else if (key === 'z') {
        event.preventDefault()
        shortcutActionsRef.current?.undo()
      } else if (key === 'y') {
        event.preventDefault()
        shortcutActionsRef.current?.redo()
      } else if (key === 'd') {
        event.preventDefault()
        shortcutActionsRef.current?.duplicateSelected()
      } else if (key === 'c' && shortcutActionsRef.current?.copySelected()) {
        event.preventDefault()
        setActiveMenu(null)
      } else if (key === 'v' && shortcutActionsRef.current?.pasteCopiedNode()) {
        event.preventDefault()
        setActiveMenu(null)
      }
    }
    const handleOutsideClick = (event) => {
      if (event.target instanceof Element && !event.target.closest('.app-menubar')) setActiveMenu(null)
      if (event.target instanceof Element && !event.target.closest('.search-panel, .app-menubar')) setSearchOpen(false)
    }
    window.addEventListener('keydown', handleShortcut)
    window.addEventListener('pointerdown', handleOutsideClick)
    return () => {
      window.removeEventListener('keydown', handleShortcut)
      window.removeEventListener('pointerdown', handleOutsideClick)
    }
  }, [])

  const exportMap = () => {
    const file = new Blob([JSON.stringify({
      _metadata: {
        app: 'Waraqa',
        formatVersion: 1,
        logo: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WARAQA_LOGO_SVG)}`,
      },
      title,
      nodes,
      edges,
      edgeStyle,
      edgeColor,
      edgeWidth,
      arrowHead,
    }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    const fileName = (title || 'mind-map').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map'
    link.download = `${fileName}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportImage = async () => {
    if (!canvasRef.current || !nodes.length) return
    setExportingImage(true)
    try {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
      const image = await toPng(canvasRef.current, {
        backgroundColor: '#f5f8f6',
        cacheBust: true,
        pixelRatio: 2,
        filter: (element) => ![
          'react-flow__controls',
          'react-flow__minimap',
          'react-flow__attribution',
          'canvas-caption',
        ].some((className) => element.classList?.contains(className)),
      })
      const link = document.createElement('a')
      const fileName = (title || 'mind-map').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map'
      link.download = `${fileName}.png`
      link.href = image
      link.click()
    } catch {
      window.alert('تعذر تصدير الصورة. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.')
    } finally {
      setExportingImage(false)
    }
  }

  const exportSvg = async () => {
    if (!canvasRef.current || !nodes.length) return
    try {
      const svg = await toSvg(canvasRef.current, {
        backgroundColor: '#f5f8f6',
        cacheBust: true,
        filter: (element) => !['react-flow__controls', 'react-flow__minimap', 'react-flow__attribution', 'canvas-caption'].some((className) => element.classList?.contains(className)),
      })
      const fileName = (title || 'mind-map').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map'
      const link = document.createElement('a')
      link.download = `${fileName}.svg`
      link.href = svg
      link.click()
    } catch {
      window.alert('تعذر تصدير SVG. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.')
    }
  }

  const exportMarkdown = () => {
    const nodeText = nodes.map((node) => {
      const note = node.data.note ? `\n  - ملاحظة: ${node.data.note.replace(/\n/g, ' ')}` : ''
      return `- **${node.data.label || 'بدون عنوان'}**${note}`
    }).join('\n')
    const links = edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.source)?.data.label || edge.source
      const target = nodes.find((node) => node.id === edge.target)?.data.label || edge.target
      return `- ${source} -> ${target}`
    }).join('\n')
    const markdown = `# ${title || 'خريطة بدون عنوان'}\n\n## العقد\n${nodeText || '- لا توجد عقد'}\n\n## الروابط\n${links || '- لا توجد روابط'}\n`
    const fileName = (title || 'mind-map').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map'
    const link = document.createElement('a')
    link.download = `${fileName}.md`
    link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const importMap = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = JSON.parse(await file.text())
      if (!Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) {
        throw new Error('Invalid map')
      }
      remember()
      setTitle(imported.title || 'خريطة مستوردة')
      setNodes(imported.nodes)
      setEdges(imported.edges)
      setEdgeStyle(imported.edgeStyle || 'smoothstep')
      setEdgeColor(imported.edgeColor || '#9aaea4')
      setEdgeWidth(imported.edgeWidth || 2)
      setArrowHead(imported.arrowHead || 'closed')
    } catch {
      window.alert('الملف غير صالح أو لا يحتوي على خريطة محفوظة.')
    }
    event.target.value = ''
  }

  const onNodeDragStart = (_event, draggedNode) => {
    dragSnapshot.current = { nodes, edges }
    setTautEdgeId(null)
    setBranchDropHint(null)
    if (draggedNode?.data.kind !== 'branch' || draggedNode.data.detached) return
    const parentEdge = edges.find((edge) => edge.target === draggedNode.id)
    const siblings = parentEdge && nodes
      .filter((node) => node.data.kind === 'branch' && edges.some((edge) => edge.source === parentEdge.source && edge.target === node.id) && node.id !== draggedNode.id)
      .sort(compareBranchOrder)
    if (!siblings?.length) return
  }
  const onNodeDrag = (_event, draggedNode) => {
    if (draggedNode?.data.kind !== 'branch' || draggedNode.data.detached || !dragSnapshot.current) {
      setBranchDropHint(null)
      return
    }
    const edge = dragSnapshot.current.edges.find((item) => item.target === draggedNode.id)
    const parent = edge && dragSnapshot.current.nodes.find((item) => item.id === edge.source)
    const original = dragSnapshot.current.nodes.find((item) => item.id === draggedNode.id)
    if (!edge || !parent || !original) return
    const center = (node, position = node.position) => ({
      x: position.x + (node.measured?.width ?? node.width ?? 190) / 2,
      y: position.y + (node.measured?.height ?? node.height ?? 64) / 2,
    })
    const parentCenter = center(parent)
    const originalCenter = center(original)
    const draggedCenter = center(draggedNode)
    const initialDistance = Math.hypot(parentCenter.x - originalCenter.x, parentCenter.y - originalCenter.y)
    const currentDistance = Math.hypot(parentCenter.x - draggedCenter.x, parentCenter.y - draggedCenter.y)
    setTautEdgeId(currentDistance - initialDistance > 55 ? edge.id : null)

    const siblings = dragSnapshot.current.nodes
      .filter((node) => {
        const siblingEdge = dragSnapshot.current.edges.find((item) => item.source === edge.source && item.target === node.id)
        return node.data.kind === 'branch' && siblingEdge && isSameBranchSide(edge, siblingEdge) && node.id !== draggedNode.id
      })
      .sort(compareBranchOrder)
    const insertAt = siblings.findIndex((node) => {
      const height = node.measured?.height ?? node.height ?? 64
      return draggedCenter.y < node.position.y + height / 2
    })
    if (siblings.length) {
      const hint = insertAt < 0
        ? { nodeId: siblings[siblings.length - 1].id, side: 'after' }
        : { nodeId: siblings[insertAt].id, side: 'before' }
      setBranchDropHint((current) => current?.nodeId === hint.nodeId && current.side === hint.side ? current : hint)
    } else setBranchDropHint(null)
  }
  const onNodeDragStop = (_event, draggedNode) => {
    setBranchDropHint(null)
    if (dragSnapshot.current) {
      const snapshot = dragSnapshot.current
      setUndoStack((current) => [...current, snapshot].slice(-50))
      setRedoStack([])
      dragSnapshot.current = null

      if (draggedNode?.data.kind !== 'branch') return
      const parentEdge = snapshot.edges.find((edge) => edge.target === draggedNode.id)
      setTautEdgeId(null)
      if (draggedNode.data.detached) return
      if (!parentEdge) {
        if (!draggedNode.data.insertedBranch) return
        const layoutBase = nodes.map((item) => item.id === draggedNode.id
          ? { ...item, position: snapshot.nodes.find((entry) => entry.id === item.id).position }
          : item)
        animateNodeLayout(arrangeMapForward(layoutBase, snapshot.edges, true), draggedNode.id)
        return
      }
      const siblings = snapshot.nodes
        .filter((item) => {
          const siblingEdge = snapshot.edges.find((edge) => edge.source === parentEdge.source && edge.target === item.id)
          return item.data.kind === 'branch' && siblingEdge && isSameBranchSide(parentEdge, siblingEdge)
        })
        .sort((left, right) => left.position.y - right.position.y)

      const remaining = siblings.filter((item) => item.id !== draggedNode.id)
      const draggedHeight = draggedNode.measured?.height ?? draggedNode.height ?? 64
      const insertionIndex = remaining.findIndex((item) => {
        const height = item.measured?.height ?? item.height ?? 64
        return draggedNode.position.y + draggedHeight / 2 < item.position.y + height / 2
      })
      const layoutBase = nodes.map((item) => item.id === draggedNode.id
        ? { ...item, position: snapshot.nodes.find((entry) => entry.id === item.id).position }
        : item)
      if (siblings.length < 2) {
        animateNodeLayout(arrangeMapForward(layoutBase, snapshot.edges, true), draggedNode.id)
        return
      }
      const orderedSiblings = [...remaining]
      orderedSiblings.splice(insertionIndex < 0 ? orderedSiblings.length : insertionIndex, 0, siblings.find((item) => item.id === draggedNode.id))
      const orderedNodes = arrangeSiblingBranches(layoutBase, snapshot.edges, parentEdge.source, orderedSiblings.map((item) => item.id), draggedNode.id)
      animateNodeLayout(arrangeMapForward(orderedNodes, snapshot.edges, true), draggedNode.id)
    }
  }

  const openProject = (project) => {
    if (activeProjectId === project.id) {
      saveNow()
      projectSavePoints.current.set(project.id, createProjectSavePoint({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }))
      setLibraryOpen(false)
      return
    }
    if (activeProjectId && activeProjectId !== project.id) saveNow()
    const latestProject = readProjectFromStorage(project.id, project)
    if (!projectSavePoints.current.has(latestProject.id)) {
      projectSavePoints.current.set(latestProject.id, createProjectSavePoint(latestProject))
    }
    runPageTransition(() => {
    setTitle(project.title || 'مشروع جديد')
    setNodes(latestProject.nodes || [])
    setEdges(latestProject.edges || [])
    setEdgeStyle(latestProject.edgeStyle || 'smoothstep')
    setEdgeColor(latestProject.edgeColor || '#9aaea4')
    setEdgeWidth(latestProject.edgeWidth || 2)
    setArrowHead(latestProject.arrowHead || 'closed')
    setActiveProjectId(latestProject.id)
    setOpenProjectIds((current) => current.includes(latestProject.id) ? current : [...current, latestProject.id])
      setLibraryOpen(false)
    })
  }
  const createProject = () => {
    const project = { id: newProjectId(), title: 'مشروع جديد', nodes: [], edges: [], edgeStyle: 'smoothstep', edgeColor: '#9aaea4', edgeWidth: 2, arrowHead: 'closed', updatedAt: currentTimestamp() }
    setProjects((current) => { const next = [project, ...current]; localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); return next })
    openProject(project)
    setRenameProjectDraft(project.title)
    setRenameProjectOpen(true)
  }
  const importProjectFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = JSON.parse(await file.text())
      if (!Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) throw new Error('Invalid project')
      delete imported._metadata
      const project = { ...imported, id: newProjectId(), title: imported.title || file.name.replace(/\.json$/i, ''), updatedAt: currentTimestamp() }
      setProjects((current) => { const next = [project, ...current]; localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); return next })
      openProject(project)
    } catch { window.alert('الملف غير صالح أو لا يحتوي على خريطة محفوظة.') }
    event.target.value = ''
  }
  const requestDeleteProject = (id) => setPendingDeleteProject(projects.find((project) => project.id === id) || null)
  const confirmDeleteProject = () => {
    if (!pendingDeleteProject) return
    const id = pendingDeleteProject.id
    setPendingDeleteProject(null)
    setOpenProjectIds((current) => current.filter((projectId) => projectId !== id))
    setProjects((current) => {
      const next = current.filter((item) => item.id !== id)
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
      return next
    })
  }
  const finishCloseProjectTab = (id, projectList = projects) => {
    const remaining = openProjectIds.filter((projectId) => projectId !== id)
    setOpenProjectIds(remaining)
    projectSavePoints.current.delete(id)
    if (id === activeProjectId) {
      const nextProject = projectList.find((project) => project.id === remaining.at(-1))
      if (nextProject) openProject(nextProject)
      else runPageTransition(() => {
        setActiveProjectId(null)
        setLibraryOpen(true)
      })
    }
  }
  const closeProjectTab = (id) => {
    const activeProject = id === activeProjectId
      ? { title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }
      : projects.find((project) => project.id === id)
    const baseline = projectSavePoints.current.get(id)
    const hasChanges = activeProject && baseline
      && JSON.stringify(createProjectSavePoint(activeProject)) !== JSON.stringify(baseline)
    if (hasChanges) {
      setPendingCloseProjectId(id)
      return
    }
    if (id === activeProjectId) saveNow()
    finishCloseProjectTab(id)
  }
  const resolveCloseProject = (choice) => {
    const id = pendingCloseProjectId
    if (!id) return
    if (choice === 'cancel') {
      setPendingCloseProjectId(null)
      return
    }

    let projectList = projects
    if (choice === 'discard') {
      const baseline = projectSavePoints.current.get(id)
      if (baseline) {
        projectList = projects.map((project) => project.id === id ? { ...project, ...baseline, updatedAt: Date.now() } : project)
      }
    } else {
      const currentState = id === activeProjectId
        ? { title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }
        : projects.find((project) => project.id === id)
      if (currentState) {
        const savePoint = createProjectSavePoint(currentState)
        projectSavePoints.current.set(id, savePoint)
        projectList = projects.map((project) => project.id === id ? { ...project, ...savePoint, updatedAt: Date.now() } : project)
        if (id === activeProjectId) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }))
        }
      }
    }
    setProjects(projectList)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projectList))
    setPendingCloseProjectId(null)
    finishCloseProjectTab(id, projectList)
  }
  const closingProject = projects.find((project) => project.id === pendingCloseProjectId)
  const closeProjectDialog = pendingCloseProjectId && (
    <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) resolveCloseProject('cancel') }}>
      <section className="confirm-dialog close-project-dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-project-title" aria-describedby="close-project-description" dir="rtl">
        <span className="confirm-icon save-confirm-icon"><Save size={21} /></span>
        <h2 id="close-project-title">حفظ تغييرات المشروع؟</h2>
        <p id="close-project-description">هل تريد حفظ التغييرات على <strong>{closingProject?.title || title || 'المشروع'}</strong> قبل إغلاقه؟</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-save" onClick={() => resolveCloseProject('save')}>حفظ وإغلاق</button>
          <button type="button" className="confirm-discard" onClick={() => resolveCloseProject('discard')}>إغلاق بدون حفظ</button>
          <button type="button" className="confirm-cancel" onClick={() => resolveCloseProject('cancel')}>إلغاء</button>
        </div>
      </section>
    </div>
  )

  if (libraryOpen) return (
    <LocalizedContent language={appLanguage}>
    <main className={`library-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <header className="topbar library-topbar" aria-label="شريط النافذة">
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <button type="button" className="topbar-settings" title="إعدادات البرنامج" aria-label="إعدادات البرنامج" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button>
        {desktopWindow && <div className="window-controls" aria-label="أزرار النافذة">
          <button type="button" className="window-control" title="تصغير" aria-label="تصغير النافذة" onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? 'استعادة' : 'تكبير'} aria-label={desktopMaximized ? 'استعادة النافذة' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}>
            {desktopMaximized ? <Copy size={12} /> : <Square size={13} />}
          </button>
          <button type="button" className="window-control window-control-close" title="إغلاق" aria-label="إغلاق النافذة" onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      <nav className="project-tabs library-project-tabs" aria-label="المشاريع المفتوحة">
        <div className="project-tabs-list">{openProjectIds.map((id) => {
          const project = projects.find((item) => item.id === id)
          if (!project) return null
          return <div className={`project-tab${id === activeProjectId ? ' is-active' : ''}`} key={id}>
            <button className="project-tab-select" type="button" onClick={() => openProject(project)} title={project.title}>{project.title || 'مشروع بدون عنوان'}</button>
            <button className="project-tab-close" type="button" onClick={() => closeProjectTab(id)} aria-label={`إغلاق ${project.title}`}><X size={13} /></button>
          </div>
        })}</div>
        <span className="project-tabs-library">كل المشاريع</span>
      </nav>
      <header className="library-header"><div className="library-brand"><span className="brand-mark"><Workflow size={20} /></span><strong>ورقة</strong><span>مساحة مشاريعك</span></div><div className="library-actions"><button className="library-button secondary theme-toggle" type="button" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} {theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</button><label className="library-button secondary"><ArrowUpFromLine size={17} /> استيراد مشروع<input type="file" accept="application/json,.json" onChange={importProjectFile} /></label><button className="library-button primary" onClick={createProject}><Plus size={18} /> مشروع جديد</button></div></header>
      <section className="library-content"><span className="library-kicker">مساحة العمل</span><h1>مشاريعك</h1><p className="library-subtitle">كل خرائطك الذهنية في مكان واحد.</p>
         {projects.length ? <div className="project-grid">{projects.map((project) => <article className="project-card" key={project.id}><button className="project-open" onClick={() => openProject(project)}><span className="project-art"><Workflow size={28} /></span><strong>{project.title || 'مشروع بدون عنوان'}</strong><small>{project.nodes?.length || 0} عقدة · {project.edges?.length || 0} رابط</small><small>آخر تعديل: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('ar-EG') : '—'}</small></button><button className="project-delete" aria-label="حذف المشروع" onClick={() => requestDeleteProject(project.id)}><Trash2 size={16} /></button></article>)}</div> : <div className="library-empty"><span className="empty-bulb"><Lightbulb size={28} /></span><h2>ابدأ أول مشروع لك</h2><p>أنشئ خريطة ذهنية جديدة أو استورد مشروعًا محفوظًا.</p><button className="library-button primary" onClick={createProject}><Plus size={18} /> إنشاء مشروع</button></div>}
      </section>
      {pendingDeleteProject && <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDeleteProject(null) }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" dir="rtl">
          <span className="confirm-icon"><Trash2 size={21} /></span>
          <h2 id="delete-dialog-title">حذف المشروع؟</h2>
          <p id="delete-dialog-description">هل تريد حذف <strong>{pendingDeleteProject.title || 'مشروع بدون عنوان'}</strong>؟ سيتم حذف المشروع نهائيًا.</p>
          <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={() => setPendingDeleteProject(null)}>إلغاء</button><button type="button" className="confirm-delete" onClick={confirmDeleteProject}>حذف المشروع</button></div>
        </section>
      </div>}
      {closeProjectDialog}
      {settingsDialog}
    </main>
    </LocalizedContent>
  )

  return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <header className="topbar">
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <button type="button" className="topbar-settings" title="إعدادات البرنامج" aria-label="إعدادات البرنامج" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /></button>
        <nav className="app-menubar" aria-label="قائمة التطبيق" role="menubar">
          <div className="app-menu-item">
            <button className={`app-menu-trigger${activeMenu === 'file' ? ' is-active' : ''}`} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={activeMenu === 'file'} onClick={() => setActiveMenu((menu) => menu === 'file' ? null : 'file')}>ملف</button>
            {activeMenu === 'file' && <div className="app-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { saveNow(); setActiveMenu(null) }}><Save size={15} /><span>حفظ المشروع</span><kbd>Ctrl+S</kbd></button>
              <button type="button" role="menuitem" onClick={() => { setActiveMenu(null); createProject() }}><Plus size={15} /><span>مشروع جديد</span></button>
              <button type="button" role="menuitem" onClick={() => { saveNow(); setActiveMenu(null); runPageTransition(() => setLibraryOpen(true)) }}><Workflow size={15} /><span>كل المشاريع</span></button>
              <button type="button" role="menuitem" onClick={openRenameProject}><Pencil size={15} /><span>إعادة تسمية المشروع...</span></button>
              <span className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => { setActiveMenu(null); importRef.current?.click() }}><ArrowUpFromLine size={15} /><span>استيراد خريطة...</span></button>
              <input ref={importRef} type="file" accept="application/json,.json" onChange={importMap} hidden />
              <span className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => { exportImage(); setActiveMenu(null) }} disabled={!nodes.length || exportingImage}><Image size={15} /><span>تصدير صورة PNG</span></button>
              <button type="button" role="menuitem" onClick={() => { exportSvg(); setActiveMenu(null) }} disabled={!nodes.length}><Image size={15} /><span>تصدير صورة SVG</span></button>
              <button type="button" role="menuitem" onClick={() => { exportMarkdown(); setActiveMenu(null) }}><FileText size={15} /><span>تصدير Markdown</span></button>
              <button type="button" role="menuitem" onClick={() => { exportMap(); setActiveMenu(null) }}><ArrowDownToLine size={15} /><span>تصدير JSON</span></button>
            </div>}
          </div>

          <div className="app-menu-item">
            <button className={`app-menu-trigger${activeMenu === 'edit' ? ' is-active' : ''}`} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={activeMenu === 'edit'} onClick={() => setActiveMenu((menu) => menu === 'edit' ? null : 'edit')}>تحرير</button>
            {activeMenu === 'edit' && <div className="app-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { undo(); setActiveMenu(null) }} disabled={!undoStack.length}><Undo2 size={15} /><span>تراجع</span><kbd>Ctrl+Z</kbd></button>
              <button type="button" role="menuitem" onClick={() => { redo(); setActiveMenu(null) }} disabled={!redoStack.length}><Redo2 size={15} /><span>إعادة</span><kbd>Ctrl+Y</kbd></button>
              <span className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => { copySelected(); setActiveMenu(null) }} disabled={!selectedNode}><Copy size={15} /><span>{selectedNode?.data.kind === 'branch' ? 'نسخ الفرع وفروعه' : 'نسخ العقدة وفروعها'}</span><kbd>Ctrl+C</kbd></button>
              <button type="button" role="menuitem" onClick={() => { pasteCopiedNode(); setActiveMenu(null) }} disabled={!copiedNode}><ClipboardPaste size={15} /><span>{copiedNode?.nodes?.length > 1 ? 'لصق الفرع وفروعه' : 'لصق العقدة'}</span><kbd>Ctrl+V</kbd></button>
              <button type="button" role="menuitem" onClick={() => { duplicateSelected(); setActiveMenu(null) }} disabled={!selectedNode}><Copy size={15} /><span>تكرار العقدة</span><kbd>Ctrl+D</kbd></button>
              <button type="button" role="menuitem" onClick={() => {
                if (selectedNodes.length > 1) removeSelectedNodes()
                else removeSelected()
                setActiveMenu(null)
              }} disabled={!selectedNodes.length}><Trash2 size={15} /><span>حذف المحدد</span><kbd>Del</kbd></button>
            </div>}
          </div>

          <div className="app-menu-item">
            <button className={`app-menu-trigger${activeMenu === 'view' ? ' is-active' : ''}`} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={activeMenu === 'view'} onClick={() => setActiveMenu((menu) => menu === 'view' ? null : 'view')}>عرض</button>
            {activeMenu === 'view' && <div className="app-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={openSearch}><Search size={15} /><span>بحث في الخريطة...</span><kbd>Ctrl+F</kbd></button>
              <span className="app-menu-separator" />
              <button type="button" role="menuitem" onClick={() => { toggleTheme(); setActiveMenu(null) }}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}<span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span></button>
              <button type="button" role="menuitem" onClick={() => { setToolsOpen((open) => !open); setActiveMenu(null) }}>{toolsOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}<span>{toolsOpen ? 'إخفاء شريط الأدوات' : 'إظهار شريط الأدوات'}</span></button>
              <button type="button" role="menuitem" onClick={() => { setMiniMapVisible((visible) => { localStorage.setItem('waraqa-minimap-visible', String(!visible)); return !visible }); setActiveMenu(null) }}><MapIcon size={15} /><span>{miniMapVisible ? 'إخفاء الخريطة المصغرة' : 'إظهار الخريطة المصغرة'}</span></button>
              <button type="button" role="menuitem" onClick={() => { arrangeAllNodes(); setActiveMenu(null) }} disabled={nodes.length < 2}><Network size={15} /><span>ترتيب الخريطة</span></button>
            </div>}
          </div>
        </nav>

        {desktopWindow && <div className="window-controls" aria-label="أزرار النافذة">
          <button type="button" className="window-control" title="تصغير" aria-label="تصغير النافذة" onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? 'استعادة' : 'تكبير'} aria-label={desktopMaximized ? 'استعادة النافذة' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}>
            {desktopMaximized ? <Copy size={12} /> : <Square size={13} />}
          </button>
          <button type="button" className="window-control window-control-close" title="إغلاق" aria-label="إغلاق النافذة" onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}

        {searchOpen && <div className="search-panel">
          <div className="search-box">
            <Search size={16} />
            <input ref={searchInputRef} aria-label="البحث في الخريطة" placeholder="ابحث في العقد والملاحظات..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false) }} />
            <kbd>Esc</kbd>
            {searchResults.length > 0 && <div className="search-results" role="listbox">
              {searchResults.map((node) => <button key={node.id} type="button" onClick={() => chooseSearchResult(node)}><strong>{node.data.label || 'بدون عنوان'}</strong>{node.data.note && <small>{node.data.note}</small>}</button>)}
            </div>}
          </div>
          <button className="search-close" type="button" title="إغلاق البحث" aria-label="إغلاق البحث" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={16} /></button>
        </div>}
      </header>

      <nav className="project-tabs" aria-label="المشاريع المفتوحة">
        <div className="project-tabs-list">{openProjectIds.map((id) => {
          const project = projects.find((item) => item.id === id)
          if (!project) return null
          return <div className={`project-tab${id === activeProjectId ? ' is-active' : ''}`} key={id}>
            <button className="project-tab-select" type="button" onClick={() => openProject(project)} title={project.title}>{project.title || 'مشروع بدون عنوان'}</button>
            <button className="project-tab-close" type="button" onClick={() => closeProjectTab(id)} aria-label={`إغلاق ${project.title}`}><X size={13} /></button>
          </div>
        })}</div>
        <button
          className="project-tabs-library"
          type="button"
          onClick={() => { saveNow(); runPageTransition(() => setLibraryOpen(true)) }}
          title="العودة إلى قائمة المشاريع"
        >كل المشاريع</button>
      </nav>

      <section className="workspace">
        <aside className={`tool-panel${toolsOpen ? ' is-open' : ' is-collapsed'}`} aria-label="لوحة الأدوات">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">مساحة العمل</span>
              <h1>الأدوات</h1>
            </div>
            <button className="help-button" type="button" title="مساعدة" aria-label="مساعدة"><CircleHelp size={18} /></button>
          </div>

          <div className="tool-section">
            <h2>أضف إلى الخريطة</h2>
            <div className="tool-grid">
              <button type="button" className="tool-tile" onClick={() => setMiniMapVisible((visible) => {
                localStorage.setItem('waraqa-minimap-visible', String(!visible))
                return !visible
              })} aria-pressed={miniMapVisible}><MapIcon size={18} /><span>{miniMapVisible ? 'إخفاء الخريطة' : 'إظهار الخريطة'}</span></button>
              <button type="button" className="tool-tile" draggable="true" onDragStart={(event) => startToolDrag(event, 'idea')} onClick={() => addNode('idea')}><Lightbulb size={18} /><span>فكرة جديدة</span></button>
              <button type="button" className="tool-tile" draggable="true" onDragStart={(event) => startToolDrag(event, 'branch', 'right')} onClick={() => selectedNode && addNode('branch', selectedNode, null, true, 'right')} disabled={!canBranchRight}><MoveRight size={18} /><span>فرع يمين</span></button>
              <button type="button" className="tool-tile" draggable="true" onDragStart={(event) => startToolDrag(event, 'branch', 'left')} onClick={() => selectedNode && addNode('branch', selectedNode, null, true, 'left')} disabled={!canBranchLeft}><MoveLeft size={18} /><span>فرع يسار</span></button>
              <button type="button" className="tool-tile" title="ينقل الفروع المرتبطة بالعقدة المحددة لتصبح متفرعة من الفرع الجديد" onClick={() => insertBranchBeforeChildren('right')} disabled={!canInsertBranchRight}><MoveRight size={18} /><span>إدراج فرع يمين</span></button>
              <button type="button" className="tool-tile" title="يضيف فرعًا قبل العقدة المحددة، ويضع العقدة الحالية تحته" onClick={() => insertBranchBeforeChildren('left')} disabled={!selectedNode}><MoveLeft size={18} /><span>إدراج فرع يسار</span></button>
            </div>
          </div>

          <div className="tool-section layout-section">
            <h2>تنظيم الخريطة</h2>
            <button className="layout-button" type="button" onClick={arrangeAllNodes} disabled={nodes.length < 2}>
              <Network size={17} />
              <span>ترتيب الخريطة للأمام</span>
            </button>
          </div>

          <div className="tool-section connection-hint">
            <h2>ربط الأفكار</h2>
            <div className="hint-row"><span className="hint-icon"><MousePointer2 size={16} /></span><p>اسحب من النقطة على طرف العقدة إلى عقدة أخرى لربطهما. اضغط كليك يمين على السهم لحذفه.</p></div>
            <div className="edge-style-picker">
              <label htmlFor="edge-style">شكل السهم</label>
              <div className="edge-style-control">
                <Spline size={15} />
                <select id="edge-style" value={edgeStyle} onChange={(event) => changeEdgeStyle(event.target.value)}>
                  <option value="smoothstep">متدرج</option>
                  <option value="default">منحني</option>
                  <option value="straight">مستقيم</option>
                </select>
              </div>
              <div className="edge-options">
                <label>لون وسُمك السهم</label>
                <div className="edge-option-row">
                  <input type="color" aria-label="لون السهم" value={edgeColor} onChange={(event) => changeEdgeSettings({ edgeColor: event.target.value })} />
                  <select aria-label="سُمك السهم" value={edgeWidth} onChange={(event) => changeEdgeSettings({ edgeWidth: Number(event.target.value) })}>
                    <option value="1">رفيع</option>
                    <option value="2">متوسط</option>
                    <option value="3">عريض</option>
                    <option value="4">عريض جدًا</option>
                  </select>
                </div>
                <label>رأس السهم</label>
                <select className="edge-arrow-select" aria-label="رأس السهم" value={arrowHead} onChange={(event) => changeEdgeSettings({ arrowHead: event.target.value })}>
                  <option value="closed">ممتلئ</option>
                  <option value="open">مفتوح</option>
                  <option value="none">بدون رأس</option>
                </select>
              </div>
            </div>
          </div>

          <div className="tool-section appearance-section">
            <h2>{selectedNode ? 'تنسيق العقدة' : 'لون العقدة الجديدة'}</h2>
            {selectedNode && <input className="node-text-input" aria-label="نص العقدة المحددة" value={selectedNode.data.label} onChange={(event) => updateSelected({ label: event.target.value })} />}
            {!selectedNode && <div className="swatches" role="group" aria-label="اختيار لون العقدة الجديدة">
              {tones.map((tone) => (
                <button key={tone} type="button" className={`swatch swatch-${tone}${activeTone === tone ? ' is-active' : ''}`} aria-label={`لون ${tone}`} onClick={() => setActiveTone(tone)} />
              ))}
              <label className={`swatch custom-swatch${activeTone === 'custom' ? ' is-active' : ''}`} style={{ '--picker-color': pickerColor }} title="اختيار لون مخصص">
                <input type="color" aria-label="اختيار لون مخصص" value={pickerColor} onChange={(event) => { setActiveTone('custom'); setActiveCustomColor(event.target.value) }} />
              </label>
            </div>}
            {selectedNode && <button className="delete-button" type="button" onClick={removeSelected}><Trash2 size={16} /> حذف العقدة المحددة</button>}
          </div>

          {selectedNode && (
            <div className="quick-actions" aria-label="تحكم سريع في العقدة">
              <h2>تحكم سريع</h2>
              <div className="quick-actions-grid">
                <button type="button" onClick={openNotes}><StickyNote size={15} /><span>ملاحظة</span></button>
                <button type="button" onClick={() => addNode('branch', selectedNode, null, true, 'right')} disabled={!canBranchRight}><MoveRight size={15} /><span>يمين</span></button>
                <button type="button" onClick={() => addNode('branch', selectedNode, null, true, 'left')} disabled={!canBranchLeft}><MoveLeft size={15} /><span>يسار</span></button>
                <button type="button" onClick={() => toggleBranch(selectedNode)} disabled={!descendants.length}><ChevronsDownUp size={15} /><span>{branchCollapsed ? 'فتح' : 'طي'}</span></button>
                <button type="button" onClick={duplicateSelected}><Copy size={15} /><span>تكرار</span></button>
                <button type="button" className="quick-delete" onClick={removeSelected}><Trash2 size={15} /><span>حذف</span></button>
              </div>
            </div>
          )}
          {selectedNodes.length > 1 && (
            <div className="bulk-selection-bar" aria-label="تحكم جماعي في العقد">
              <span>{selectedNodes.length} عقد محددة</span>
              <button type="button" className="bulk-link-button" onClick={linkSelectedNodes} disabled={!linkableSelectedNodes.length} title="يربط العقد المحددة بالعقدة التي بدأت بها التحديد"><Link2 size={15} /> ربط المحدد</button>
              <button type="button" onClick={removeSelectedNodes}><Trash2 size={15} /> حذف المحدد</button>
            </div>
          )}

          <div className="panel-footer">
            <span className="footer-mark"><Workflow size={15} /></span>
            <span>{nodes.length} عقدة</span>
            <span className="footer-separator">·</span>
            <span>{edges.length} رابط</span>
            <button type="button" className="footer-clear" title="مسح التحديد" aria-label="مسح التحديد" onClick={() => setNodes((current) => current.map((node) => ({ ...node, selected: false })))}><Minus size={15} /></button>
          </div>
        </aside>

        <div
          className={`canvas-wrap${selectionDrag ? ' is-selecting' : ''}`}
          dir="ltr"
          ref={canvasRef}
          onPointerDownCapture={startMultiSelect}
          onPointerMove={moveMultiSelect}
          onPointerUpCapture={finishMultiSelect}
          onPointerCancel={finishMultiSelect}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={handleCanvasDrop}
          onContextMenu={(event) => { if (event.ctrlKey || selectionDrag) event.preventDefault() }}
        >
          {selectionDrag && (
            <div
              className="selection-marquee"
              style={{
                left: `${Math.min(selectionDrag.startX, selectionDrag.currentX) - selectionDrag.originLeft}px`,
                top: `${Math.min(selectionDrag.startY, selectionDrag.currentY) - selectionDrag.originTop}px`,
                width: `${Math.abs(selectionDrag.currentX - selectionDrag.startX)}px`,
                height: `${Math.abs(selectionDrag.currentY - selectionDrag.startY)}px`,
              }}
            />
          )}
          {exportingImage && (
            <div className="export-brand" dir="rtl">
              <span className="brand-mark"><Workflow size={18} strokeWidth={2.2} /></span>
              <span><strong>ورقة</strong><small>{title}</small></span>
            </div>
          )}
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodesDelete={onNodesDelete}
            onEdgesChange={onEdgesChange}
            onEdgeClick={handleEdgeClick}
            onEdgeContextMenu={removeEdgeFromContextMenu}
            onConnect={onConnect}
            onInit={(instance) => { flowRef.current = instance }}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={1.8}
            nodesConnectable
            onNodeClick={(event, node) => {
              if (event.ctrlKey || event.metaKey) {
                if (!linkSourceNodeId) setLinkSourceNodeId(node.id)
              } else setLinkSourceNodeId(node.id)
              if (event.target.closest?.('.node-icon')) openNotes(node)
              else closeNotes()
            }}
            onPaneClick={() => setLinkSourceNodeId(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ type: edgeStyle }}
          >
            <Background color="#d9e1dc" gap={22} size={1.4} />
            <Controls position="bottom-left" showInteractive={false} />
            {miniMapVisible && <MiniMap position="top-right" nodeColor={(node) => getToneColor(node.data?.tone, node.data?.customColor)} maskColor="rgba(245, 248, 246, 0.78)" />}
          </ReactFlow>
          {!nodes.length && (
            <div className="empty-state" dir="rtl">
              <div className="empty-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="empty-bulb"><Lightbulb size={25} /></span><span className="spark spark-a">✳</span><span className="spark spark-b">✦</span></div>
              <span className="empty-kicker">كل فكرة تبدأ من هنا</span>
              <h2>مساحة أفكارك مفتوحة</h2>
              <p>أضف فكرتك الأولى، ثم دع الأفكار تتفرع وتتصل ببعضها.</p>
              <button type="button" className="empty-add-button" onClick={() => addNode('idea')}><Plus size={17} /> أضف أول فكرة</button>
            </div>
          )}
          <div className="canvas-caption"><span className="canvas-live-dot" /> مساحة الرسم <span>·</span> اسحب العقد لترتيبها</div>
        </div>

        {notesMounted && selectedNode && (
          <aside className={`notes-panel${notesOpen ? ' is-open' : ' is-closing'}`} aria-label="ملاحظات العقدة">
            <div className="notes-heading">
              <div>
                <span className="eyebrow">ملاحظة العقدة</span>
                <h2>{selectedNode.data.label || 'عقدة بدون عنوان'}</h2>
              </div>
              <button className="notes-close" type="button" title="إخفاء الملاحظة" aria-label="إخفاء الملاحظة" onClick={closeNotes}>
                <X size={17} />
              </button>
            </div>
            <textarea
              className="node-note-input"
              aria-label="ملاحظة العقدة المحددة"
              placeholder="اكتب ملاحظتك هنا..."
              value={selectedNode.data.note || ''}
              onChange={(event) => updateSelected({ note: event.target.value })}
            />
            <div className="notes-settings">
              <h3>إيموجي العقدة</h3>
              <div className="notes-emoji-picker" role="group" aria-label="اختيار إيموجي للعقدة">
                <button type="button" className={`notes-emoji-choice emoji-none${!selectedNode.data.emoji ? ' is-active' : ''}`} aria-label="بدون إيموجي" aria-pressed={!selectedNode.data.emoji} onClick={() => updateSelected({ emoji: '' })}>×</button>
                {nodeEmojis.map(({ emoji, label }) => <button key={emoji} type="button" className={`notes-emoji-choice${selectedNode.data.emoji === emoji ? ' is-active' : ''}`} aria-label={label} title={label} aria-pressed={selectedNode.data.emoji === emoji} onClick={() => updateSelected({ emoji })}><EmojiGlyph emoji={emoji} /></button>)}
              </div>
              <a className="emoji-credit" href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">الرسومات من Twemoji</a>
              <h3>لون العقدة</h3>
              <div className="notes-swatches" role="group" aria-label="لون العقدة المحددة">
                {tones.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`swatch swatch-${tone}${selectedNode.data.tone === tone && !selectedNode.data.customColor ? ' is-active' : ''}`}
                    aria-label={`لون ${tone}`}
                    onClick={() => updateSelected({ tone, customColor: '' })}
                  />
                ))}
                <label className={`swatch custom-swatch${selectedNode.data.customColor ? ' is-active' : ''}`} style={{ '--picker-color': getToneColor(selectedNode.data.tone, selectedNode.data.customColor) }} title="اختيار لون مخصص">
                  <input
                    type="color"
                    aria-label="لون مخصص للعقدة"
                    value={getToneColor(selectedNode.data.tone, selectedNode.data.customColor)}
                    onChange={(event) => updateSelected({ tone: 'custom', customColor: event.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="notes-footer">تُحفظ الملاحظة مع هذه العقدة تلقائيًا</div>
          </aside>
        )}
      </section>
      {renameProjectOpen && (
        <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameProjectOpen(false) }}>
          <section className="confirm-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" dir="rtl">
            <span className="confirm-icon rename-icon"><Pencil size={20} /></span>
            <span className="rename-eyebrow">تنظيم مشاريعك</span>
            <h2 id="rename-dialog-title">ما اسم مشروعك؟</h2>
            <p>اختر اسمًا واضحًا يسهل عليك الوصول إليه لاحقًا.</p>
            <label className="rename-field-label" htmlFor="rename-project-input">اسم المشروع</label>
            <input ref={renameInputRef} id="rename-project-input" className="rename-project-input" aria-label="اسم المشروع الجديد" autoFocus value={renameProjectDraft} onChange={(event) => setRenameProjectDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') renameProject(); if (event.key === 'Escape') setRenameProjectOpen(false) }} />
            <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={() => setRenameProjectOpen(false)}>إلغاء</button><button type="button" className="confirm-save" onClick={renameProject} disabled={!renameProjectDraft.trim()}>حفظ الاسم</button></div>
          </section>
        </div>
      )}
      {closeProjectDialog}
      {settingsDialog}
    </main>
    </LocalizedContent>
  )
}

export default App
