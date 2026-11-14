import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CircleHelp,
  ClipboardPaste,
  ChevronsDownUp,
  Copy,
  FileText,
  GitBranch,
  Home,
  Image,
  LayoutTemplate,
  Lightbulb,
  Link2,
  ListTodo,
  Map as MapIcon,
  Minus,
  Moon,
  MoveLeft,
  MoveRight,
  Move,
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
import dagre from '@dagrejs/dagre'
import NotesWorkspace from './NotesWorkspace.jsx'
import TasksWorkspace from './TasksWorkspace.jsx'
import FlowchartWorkspace from './FlowchartWorkspace.jsx'
import UiDesignerWorkspace, { createDesignPreviews } from './UiDesignerWorkspace.jsx'
import { NOTES_STORAGE_KEY, OPEN_NOTES_STORAGE_KEY, readOpenStandaloneNoteIds, readStandaloneNotes } from './noteStorage.js'
import { TASKS_STORAGE_KEY, TASK_LISTS_STORAGE_KEY, readTasks, readTaskLists } from './taskStorage.js'
import { FLOWCHARTS_STORAGE_KEY, readFlowcharts } from './flowchartStorage.js'
import { UI_DESIGNS_STORAGE_KEY, readUiDesigns } from './uiDesignStorage.js'
import { readNoteAttachment, saveNoteAttachmentWithId } from './noteAttachments.js'
import { createZipArchive, createWorkspaceArchive, decodeZipText, readZipArchive } from './workspaceArchive.js'
import { readProjectsFolderHandle, saveProjectsFolderHandle } from './projectFolderStorage.js'
import ToolSidebar, { SettingsButton, ToolSwitcher } from './ToolSidebar.jsx'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ConnectionMode,
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
import pkg from '../package.json'

const AndroidDownloads = registerPlugin('Downloads')
const STORAGE_KEY = 'waraqa-mind-map'
const PROJECTS_KEY = 'waraqa-projects'
const WORKSPACES_KEY = 'waraqa-workspaces'
const WARAQA_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#176b50"/><path d="M32 18v12M20 42V32h24v10" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/><circle cx="32" cy="16" r="5" fill="#fff"/><circle cx="18" cy="46" r="5" fill="#fff"/><circle cx="46" cy="46" r="5" fill="#fff"/></svg>'
const createId = () => {
  try {
    const value = globalThis.crypto?.randomUUID?.()
    if (value) return value
  } catch (error) {
    console.warn('Secure random IDs are unavailable; using a local fallback.', error)
  }
  return `waraqa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
const newProjectId = () => createId()
const currentTimestamp = () => Date.now()
const isoTimestamp = () => new Date().toISOString()
async function writeWorkspaceArchiveToHandle(rootHandle, archive) {
  const entries = await readZipArchive(new File([archive], 'workspace.zip', { type: 'application/zip' }))
  const projectBytes = entries.get('project.json')
  if (!projectBytes) throw new Error('Project data is missing from the archive.')
  const bundle = JSON.parse(decodeZipText(projectBytes))
  const safeName = String(bundle.workspace?.title || 'project').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 80) || 'project'
  const safeId = String(bundle.workspace?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) || 'workspace'
  const projectDirectory = await rootHandle.getDirectoryHandle(`${safeName}-${safeId}`, { create: true })
  const expectedPaths = new Set(['workspace.json'])
  for (const [entryPath, bytes] of entries) {
    const parts = entryPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) throw new Error('Invalid path in project archive.')
    expectedPaths.add(parts.join('/'))
    let directory = projectDirectory
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true })
    const fileHandle = await directory.getFileHandle(parts.at(-1), { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(bytes)
    await writable.close()
  }
  const workspaceFile = await projectDirectory.getFileHandle('workspace.json', { create: true })
  const workspaceWritable = await workspaceFile.createWritable()
  await workspaceWritable.write(`${JSON.stringify(bundle, null, 2)}\n`)
  await workspaceWritable.close()
  const pruneDirectory = async (directory, prefix = '') => {
    for await (const [name, handle] of directory.entries()) {
      const relative = prefix ? `${prefix}/${name}` : name
      if (handle.kind === 'directory') {
        await pruneDirectory(handle, relative)
        if (![...expectedPaths].some((filePath) => filePath.startsWith(`${relative}/`))) await directory.removeEntry(name, { recursive: true })
      } else if (!expectedPaths.has(relative)) await directory.removeEntry(name)
    }
  }
  await pruneDirectory(projectDirectory)
}
const normalizeProjectHandles = (project) => {
  const nodesById = new Map((Array.isArray(project?.nodes) ? project.nodes : []).map((node) => [node.id, node]))
  const usedIds = new Set()
  const edges = (Array.isArray(project?.edges) ? project.edges : [])
    .filter((edge) => edge && nodesById.has(edge.source) && nodesById.has(edge.target))
    .map((edge) => {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      const sourceSide = edge.sourceHandle === 'source-left' || edge.sourceHandle === 'source-right'
        ? edge.sourceHandle.slice('source-'.length)
        : target.position.x < source.position.x ? 'left' : 'right'
      const targetSide = sourceSide === 'left' ? 'right' : 'left'
      const baseId = edge.id || `e-${edge.source}-${edge.target}`
      let id = baseId
      let duplicateIndex = 1
      while (usedIds.has(id)) id = `${baseId}-${duplicateIndex++}`
      usedIds.add(id)
      return {
        ...edge,
        id,
        sourceHandle: `source-${sourceSide}`,
        targetHandle: `source-${targetSide}`,
        hidden: false,
      }
    })
  return { ...project, edges }
}
const startNodeIdOf = (nodes, edges) => (
  nodes.find((node) => node.data?.isStart)?.id
  || nodes.find((node) => node.data?.kind === 'idea' && !edges.some((edge) => edge.target === node.id))?.id
  || nodes.find((node) => node.data?.kind === 'idea')?.id
  || nodes[0]?.id
  || null
)
const englishTranslations = {
  'الخريطة الذهنية': 'Mind map', 'الملاحظات': 'Notes', 'أدوات ورقة': 'Waraqa tools',
  'مساحة الملاحظات': 'Notes workspace', 'إنشاء ملاحظة': 'Create note', 'البحث في الملاحظات': 'Search notes',
  'ابحث في الملاحظات...': 'Search notes...', 'لا توجد نتائج مطابقة.': 'No matching results.',
  'لا توجد ملاحظات بعد.': 'No notes yet.', 'لا يوجد محتوى بعد': 'No content yet',
  'تُحفظ التغييرات تلقائيًا': 'Changes are saved automatically', 'تعذر حفظ التغييرات': 'Could not save changes',
  'عنوان الملاحظة': 'Note title', 'محتوى الملاحظة': 'Note content', 'حذف الملاحظة': 'Delete note',
  'حذف الملاحظة؟': 'Delete note?', 'لن تتمكن من استعادة هذه الملاحظة بعد حذفها.': 'You will not be able to recover this note after deleting it.',
  'ابدأ ملاحظة جديدة': 'Start a new note', 'لا توجد نتائج': 'No results', 'جرّب البحث بكلمات مختلفة.': 'Try different search terms.',
  'أنشئ ملاحظة مستقلة واحفظ أفكارك هنا.': 'Create a standalone note and save your ideas here.',
  'مشروع جديد': 'New project', 'فكرة': 'Idea', 'إبداع': 'Creativity', 'هدف': 'Goal', 'تفكير': 'Thinking', 'حل': 'Solution', 'اتجاه': 'Direction', 'خريطة': 'Map', 'تعلم': 'Learning', 'قراءة': 'Reading', 'ملاحظة': 'Note', 'بحث': 'Search', 'استكشاف': 'Explore', 'تجربة علمية': 'Experiment', 'علوم': 'Science', 'مهم': 'Important', 'قيمة': 'Value', 'نمو': 'Growth', 'مكتمل': 'Completed', 'سريع': 'Quick', 'نقاش': 'Discussion', 'تعاون': 'Collaboration', 'فريق': 'Team', 'إعداد': 'Settings', 'عمل': 'Work', 'تثبيت': 'Pin', 'انطلاق': 'Launch', 'خواطر': 'Thoughts', 'رابط': 'Link', 'بيانات': 'Data', 'موعد': 'Appointment', 'خطة زمنية': 'Timeline', 'مدة': 'Duration', 'تنبيه': 'Reminder', 'إنجاز': 'Achievement', 'مرحلة': 'Stage', 'تحذير': 'Warning', 'متوقف': 'Paused', 'تقدم': 'Progress', 'تصنيف': 'Category', 'تقنية': 'Technology', 'سحابة': 'Cloud',
  'خريطة بدون عنوان': 'Untitled map', 'بدون عنوان': 'Untitled', 'يمينًا': 'on the right', 'يسارًا': 'on the left', 'افتح ملاحظة العقدة': 'Open node note', 'اسم العقدة': 'Node name', 'تحرير اسم العقدة': 'Edit node name', 'ملاحظة جديدة': 'New note', 'فكرة فرعية': 'Sub-idea', 'فكرتي الجديدة': 'My new idea',
  'تعذر تصدير الصورة. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.': 'Could not export the image. Try again after the map has fully loaded.', 'تعذر تصدير SVG. جرّب مرة أخرى بعد ظهور الخريطة بالكامل.': 'Could not export SVG. Try again after the map has fully loaded.', '- لا توجد عقد': '- No nodes', '- لا توجد روابط': '- No links', 'خريطة مستوردة': 'Imported map', 'الملف غير صالح أو لا يحتوي على خريطة محفوظة.': 'The file is invalid or does not contain a saved map.',
  'إعدادات البرنامج': 'App settings', 'غيّر لغة الواجهة ومظهر البرنامج.': 'Change the app language and appearance.', 'اللغة': 'Language', 'العربية': 'Arabic', 'المظهر': 'Appearance', 'نهاري': 'Light', 'ليلي': 'Dark', 'إغلاق الإعدادات': 'Close settings', 'حفظ نسخة المشروع': 'Save project backup',
  'حفظ تغييرات المشروع؟': 'Save project changes?', 'المشروع': 'the project', 'قبل إغلاقه؟': 'before closing it?', 'حفظ وإغلاق': 'Save and close', 'إغلاق بدون حفظ': 'Close without saving', 'إلغاء': 'Cancel', 'كل المشاريع': 'All projects', 'ورقة': 'Waraqa', 'مساحة مشاريعك': 'Your projects', 'الوضع النهاري': 'Light mode', 'الوضع الليلي': 'Dark mode', 'استيراد مشروع': 'Import project', 'مساحة العمل': 'Workspace', 'مشاريعك': 'Your projects', 'كل خرائطك الذهنية في مكان واحد.': 'All your mind maps in one place.', 'ابدأ أول مشروع لك': 'Start your first project', 'أنشئ خريطة ذهنية جديدة أو استورد مشروعًا محفوظًا.': 'Create a new mind map or import a saved project.', 'إنشاء مشروع': 'Create project', 'حذف المشروع؟': 'Delete project?', '؟ سيتم حذف المشروع نهائيًا.': '? This project will be deleted permanently.', 'حذف المشروع': 'Delete project',
  'مشروعي السابق': 'Previous project', 'كل مشروع يضم خرائطك الذهنية وملاحظاتك.': 'Each project contains its mind maps and notes.', 'استيراد خريطة': 'Import map', 'أنشئ مشروعًا يجمع خرائطك الذهنية وملاحظاتك.': 'Create a project to organize mind maps and notes.', 'مساحة المشروع': 'Project workspace', 'خرائطك الذهنية وملاحظاتك في مكان واحد.': 'Your mind maps and notes in one place.', 'خريطة جديدة': 'New mind map', 'حذف الخريطة؟': 'Delete mind map?', 'حذف الخريطة': 'Delete mind map', 'كل الخرائط والملاحظات الموجودة بداخله نهائيًا.': 'and all its mind maps and notes permanently.', 'تعذر إنشاء الملاحظة. قد تكون مساحة التخزين ممتلئة.': 'Could not create the note. Browser storage may be full.',
  'قائمة التطبيق': 'Application menu', 'ملف': 'File', 'حفظ المشروع': 'Save project', 'إعادة تسمية المشروع...': 'Rename project...', 'استيراد خريطة...': 'Import map...', 'تصدير صورة PNG': 'Export PNG image', 'تصدير صورة SVG': 'Export SVG image', 'تصدير Markdown': 'Export Markdown', 'تصدير JSON': 'Export JSON', 'تحرير': 'Edit', 'تراجع': 'Undo', 'إعادة': 'Redo', 'نسخ الفرع وفروعه': 'Copy branch and descendants', 'نسخ العقدة وفروعها': 'Copy node and descendants', 'لصق الفرع وفروعه': 'Paste branch and descendants', 'لصق العقدة': 'Paste node', 'تكرار العقدة': 'Duplicate node', 'حذف المحدد': 'Delete selected', 'عرض': 'View', 'بحث في الخريطة...': 'Search the map...', 'إخفاء شريط الأدوات': 'Hide tools panel', 'إظهار شريط الأدوات': 'Show tools panel', 'إخفاء الخريطة المصغرة': 'Hide minimap', 'إظهار الخريطة المصغرة': 'Show minimap', 'ترتيب الخريطة': 'Arrange map',
  'الأدوات': 'Tools', 'أضف إلى الخريطة': 'Add to map', 'إخفاء الخريطة': 'Hide map', 'إظهار الخريطة': 'Show map', 'فكرة جديدة': 'New idea', 'فرع يمين': 'Branch right', 'فرع يسار': 'Branch left', 'إدراج فرع يمين': 'Insert branch right', 'إدراج فرع يسار': 'Insert branch left', 'تنظيم الخريطة': 'Organize map', 'ترتيب الخريطة للأمام': 'Arrange map forward', 'ربط الأفكار': 'Connect ideas', 'اسحب من النقطة على طرف العقدة إلى عقدة أخرى لربطهما. اضغط كليك يمين على السهم لحذفه.': 'Drag from a node handle to another node to connect them. Right-click a connector to delete it.', 'شكل السهم': 'Connector style', 'متدرج': 'Smooth step', 'منحني': 'Curved', 'مستقيم': 'Straight', 'لون وسُمك السهم': 'Connector color and width', 'رفيع': 'Thin', 'متوسط': 'Medium', 'عريض': 'Thick', 'عريض جدًا': 'Extra thick', 'رأس السهم': 'Arrowhead', 'ممتلئ': 'Filled', 'مفتوح': 'Open', 'بدون رأس': 'None', 'تنسيق العقدة': 'Node appearance', 'لون العقدة الجديدة': 'New node color', 'نص العقدة المحددة': 'Selected node text', 'اختيار لون العقدة الجديدة': 'Choose new node color', 'اختيار لون مخصص': 'Choose a custom color', 'تحكم سريع': 'Quick controls', 'فتح': 'Expand', 'طي': 'Collapse', 'تكرار': 'Duplicate', 'حذف': 'Delete', 'ربط المحدد': 'Connect selected', 'كل فكرة تبدأ من هنا': 'Every idea starts here', 'مساحة أفكارك مفتوحة': 'Your idea space is ready', 'أضف فكرتك الأولى، ثم دع الأفكار تتفرع وتتصل ببعضها.': 'Add your first idea, then let it branch out and connect to others.', 'أضف أول فكرة': 'Add your first idea', 'مساحة الرسم': 'Canvas', 'اسحب العقد لترتيبها': 'Drag nodes to arrange them', 'ملاحظة العقدة': 'Node note', 'إيموجي العقدة': 'Node emoji', 'الرسومات من Twemoji': 'Emoji artwork by Twemoji', 'لون العقدة': 'Node color', 'تُحفظ الملاحظة مع هذه العقدة تلقائيًا': 'This note is saved with the node automatically', 'تنظيم مشاريعك': 'Organize your projects', 'ما اسم مشروعك؟': 'What is your project called?', 'اختر اسمًا واضحًا يسهل عليك الوصول إليه لاحقًا.': 'Choose a clear name so you can find it easily later.', 'اسم المشروع': 'Project name', 'حفظ الاسم': 'Save name', 'مساعدة': 'Help', 'مسح التحديد': 'Clear selection', 'إغلاق البحث': 'Close search', 'العودة إلى قائمة المشاريع': 'Back to all projects', 'شريط النافذة': 'Window bar', 'أزرار النافذة': 'Window controls', 'تصغير': 'Minimize', 'تصغير النافذة': 'Minimize window', 'استعادة': 'Restore', 'تكبير': 'Maximize', 'استعادة النافذة': 'Restore window', 'تكبير النافذة': 'Maximize window', 'إغلاق': 'Close', 'إغلاق النافذة': 'Close window',
  'مشروع بدون عنوان': 'Untitled project', 'عقدة بدون عنوان': 'Untitled node', 'اكتب ملاحظتك هنا...': 'Write your note here...',
  'لوحة الأدوات': 'Tools panel', 'إخفاء الملاحظة': 'Hide note', 'ملاحظة العقدة المحددة': 'Selected node note', 'اختيار إيموجي للعقدة': 'Choose node emoji', 'بدون إيموجي': 'No emoji', 'لون العقدة المحددة': 'Selected node color', 'لون مخصص للعقدة': 'Custom node color',
  'اضغط لطي أو فتح الفروع يمينًا': 'Click to collapse or expand branches on the right', 'اضغط لطي أو فتح الفروع يسارًا': 'Click to collapse or expand branches on the left',
  'تحديد جماعي': 'Multi-select', 'إنهاء التحديد': 'Done selecting', 'تحديد عدة عقد بالضغط أو بسحب مربع على المساحة': 'Select several nodes by tapping or dragging a box on the canvas',
  'اضغط العقد لتحديدها أو اسحب مربعًا': 'Tap nodes to select them, or drag a box', 'اختر عقدة أخرى للربط': 'Choose another node to link', 'إلغاء الربط': 'Cancel linking',
  'نمط الترتيب': 'Layout style', 'شجرة': 'Tree', 'تلقائي': 'Auto',
  'أساسيات اللمس': 'Touch basics',
  'إصبع واحد يحرّك الخريطة، وإصبعان للتكبير والتصغير.': 'One finger moves the map, two fingers zoom in and out.',
  'اضغط مطولًا على أي عقدة لبدء الربط، ثم اضغط على عقدة أخرى لإتمامه.': 'Long-press any node to start linking, then tap another node to finish.',
  'زر الرجوع في الهاتف يغلق الملاحظات والقوائم واحدًا واحدًا.': 'On phones, the back button closes the notes panel and menus one by one.',
  'اربط عقدتين بالسحب من نقطة طرف العقدة إلى عقدة أخرى، أو بالضغط المطول على عقدة ثم الضغط على عقدة أخرى. كليك يمين على السهم يحذفه.': 'Link two nodes by dragging from a node handle to another node, or long-press a node then tap another. Right-click a connector deletes it.',
  'زر «تحديد جماعي» في اللوحة يفعّل تحديد عدة عقد بالضغط أو بسحب مربع على المساحة (في الحاسوب أيضًا Ctrl + كليك يمين).': 'The â€œMulti-selectâ€ tool selects several nodes by tapping or dragging a box on the canvas (also Ctrl + right-click drag on desktop).',
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
  const projectCounts = trimmed.match(/^(\d+) عقدة Â· (\d+) رابط$/)
  if (projectCounts) return `${projectCounts[1]} nodes Â· ${projectCounts[2]} links`
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
let pageTransitionSequence = 0
function runPageTransition(update, direction = 'forward') {
  const root = document.documentElement
  const transitionId = String(++pageTransitionSequence)
  root.dataset.transitionDirection = direction
  root.dataset.pageTransition = transitionId
  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => flushSync(update))
    const clearDirection = () => {
      if (root.dataset.pageTransition === transitionId) {
        delete root.dataset.transitionDirection
        delete root.dataset.pageTransition
      }
    }
    transition.finished.then(clearDirection, clearDirection)
  } else {
    root.classList.add('fallback-transition')
    update()
    window.setTimeout(() => {
      if (root.dataset.pageTransition === transitionId) {
        root.classList.remove('fallback-transition')
        delete root.dataset.transitionDirection
        delete root.dataset.pageTransition
      }
    }, 680)
  }
}
function WorkspaceBackupButton({ onClick, busy, disabled, language }) {
  const label = busy
    ? language === 'en' ? 'Savingâ€¦' : 'جارٍ الحفظ…'
    : language === 'en' ? 'Export item' : 'تصدير العنصر'
  return (
    <button className="workspace-backup-button" type="button" onClick={onClick} disabled={busy || disabled} title={language === 'en' ? 'Export a separate copy of the open item' : 'تصدير نسخة مستقلة من العنصر المفتوح'}>
      <ArrowDownToLine size={16} />
      <span>{label}</span>
    </button>
  )
}
function DocumentImportButton({ onClick, language }) {
  return <button className="workspace-backup-button document-import-button" type="button" onClick={onClick} title={language === 'en' ? 'Import an item into this project' : 'استيراد عنصر إلى هذا المشروع'}>
    <ArrowUpFromLine size={16} />
    <span>{language === 'en' ? 'Import item' : 'استيراد عنصر'}</span>
  </button>
}
function readProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null')
    if (Array.isArray(projects)) return projects.map(normalizeProjectHandles)
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return legacy ? [normalizeProjectHandles({ id: newProjectId(), updatedAt: Date.now(), ...legacy })] : []
  } catch { return [] }
}
function readWorkspaces() {
  try {
    const storedWorkspaces = JSON.parse(localStorage.getItem(WORKSPACES_KEY) || 'null')
    const storedProjects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null')
    const storedNotes = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]')
    const legacyMap = !Array.isArray(storedProjects)
      ? JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      : null
    const projects = Array.isArray(storedProjects)
      ? storedProjects
      : legacyMap
        ? [{ ...legacyMap, id: newProjectId(), updatedAt: currentTimestamp() }]
        : []
    const notes = Array.isArray(storedNotes) ? storedNotes : []
    if (Array.isArray(storedWorkspaces)) {
      if (!storedWorkspaces.length && (projects.length || notes.length)) {
        const workspace = { id: newProjectId(), title: 'مشروعي السابق', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
        localStorage.setItem(WORKSPACES_KEY, JSON.stringify([workspace]))
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.map((project) => ({ ...project, workspaceId: workspace.id }))))
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes.map((note) => ({ ...note, workspaceId: workspace.id }))))
        return [workspace]
      }
      if (storedWorkspaces.length) {
        const defaultWorkspaceId = storedWorkspaces[0].id
        const validWorkspaceIds = new Set(storedWorkspaces.map((workspace) => workspace.id))
        const unassignedProjects = projects.some((project) => !validWorkspaceIds.has(project.workspaceId))
        const unassignedNotes = notes.some((note) => !validWorkspaceIds.has(note.workspaceId))
        if (unassignedProjects || unassignedNotes) {
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.map((project) => (
            validWorkspaceIds.has(project.workspaceId) ? project : { ...project, workspaceId: defaultWorkspaceId }
          ))))
          localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes.map((note) => (
            validWorkspaceIds.has(note.workspaceId) ? note : { ...note, workspaceId: defaultWorkspaceId }
          ))))
        }
      }
      return storedWorkspaces
    }
    if (!projects.length && !notes.length) {
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify([]))
      return []
    }
    const workspace = { id: newProjectId(), title: 'مشروعي السابق', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify([workspace]))
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.map((project) => ({ ...project, workspaceId: workspace.id }))))
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes.map((note) => ({ ...note, workspaceId: workspace.id }))))
    return [workspace]
  } catch (error) {
    console.error('Could not read workspaces.', error)
    return []
  }
}
function readProjectFromStorage(id, fallback) {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    const project = Array.isArray(projects) ? projects.find((item) => item.id === id) || fallback : fallback
    return normalizeProjectHandles(project)
  } catch { return fallback }
}
function createProjectSavePoint(project) {
  project = normalizeProjectHandles(project)
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
  { emoji: 'ðŸ’¡', label: 'فكرة' },
  { emoji: 'ðŸª„', label: 'إبداع' },
  { emoji: 'ðŸŽ¯', label: 'هدف' },
  { emoji: 'ðŸ§ ', label: 'تفكير' },
  { emoji: 'ðŸ§©', label: 'حل' },
  { emoji: 'ðŸ§­', label: 'اتجاه' },
  { emoji: 'ðŸ—ºï¸', label: 'خريطة' },
  { emoji: 'ðŸ“š', label: 'تعلم' },
  { emoji: 'ðŸ“–', label: 'قراءة' },
  { emoji: 'ðŸ“', label: 'ملاحظة' },
  { emoji: 'ðŸ”', label: 'بحث' },
  { emoji: 'ðŸ”¬', label: 'استكشاف' },
  { emoji: 'ðŸ§ª', label: 'تجربة علمية' },
  { emoji: 'ðŸ§¬', label: 'علوم' },
  { emoji: 'â­', label: 'مهم' },
  { emoji: 'ðŸ’Ž', label: 'قيمة' },
  { emoji: 'ðŸŒ±', label: 'نمو' },
  { emoji: 'âœ…', label: 'مكتمل' },
  { emoji: 'âš¡', label: 'سريع' },
  { emoji: 'ðŸ’¬', label: 'نقاش' },
  { emoji: 'ðŸ¤', label: 'تعاون' },
  { emoji: 'ðŸ‘¥', label: 'فريق' },
  { emoji: 'ðŸŽ¨', label: 'إبداع' },
  { emoji: 'âš™ï¸', label: 'إعداد' },
  { emoji: 'ðŸ› ï¸', label: 'عمل' },
  { emoji: 'ðŸ“Œ', label: 'تثبيت' },
  { emoji: 'ðŸš€', label: 'انطلاق' },
  { emoji: 'ðŸ’­', label: 'خواطر' },
  { emoji: 'ðŸ”—', label: 'رابط' },
  { emoji: 'ðŸ“Š', label: 'بيانات' },
  { emoji: 'ðŸ“…', label: 'موعد' },
  { emoji: 'ðŸ—“ï¸', label: 'خطة زمنية' },
  { emoji: 'â³', label: 'مدة' },
  { emoji: 'ðŸ””', label: 'تنبيه' },
  { emoji: 'ðŸ†', label: 'إنجاز' },
  { emoji: 'ðŸ', label: 'مرحلة' },
  { emoji: 'âš ï¸', label: 'تحذير' },
  { emoji: 'â›”', label: 'متوقف' },
  { emoji: 'ðŸ“ˆ', label: 'تقدم' },
  { emoji: 'ðŸ—‚ï¸', label: 'تصنيف' },
  { emoji: 'ðŸ’»', label: 'تقنية' },
  { emoji: 'â˜ï¸', label: 'سحابة' },
]
function EmojiGlyph({ emoji }) {
  const assetUrl = emojiDataUrl(emoji)
  return <span className="emoji-glyph" aria-hidden="true"><span>{emoji}</span>{assetUrl && <img src={assetUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />}</span>
}
const isHexColor = (color) => /^#[\da-f]{6}$/i.test(color || '')
const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches
const nodeHeightOf = (node) => Math.max(node.data.kind === 'idea' ? 76 : 50, node.measured?.height ?? node.height ?? 64)
const nodeWidthOf = (node) => Math.max(node.data.kind === 'idea' ? 190 : 150, node.measured?.width ?? node.width ?? 190)
const arrowHeads = { closed: MarkerType.ArrowClosed, open: MarkerType.Arrow }

function resolveNodeOverlaps(positions, nodesById) {
  const boxes = []
  positions.forEach((position, id) => {
    const node = nodesById.get(id)
    if (node) boxes.push({ id, x: position.x, y: position.y, width: nodeWidthOf(node), height: nodeHeightOf(node) })
  })
  for (let pass = 0; pass < 14; pass += 1) {
    let moved = false
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const upper = boxes[first]
        const lower = boxes[second]
        const overlapX = Math.min(upper.x + upper.width, lower.x + lower.width) - Math.max(upper.x, lower.x)
        const overlapY = Math.min(upper.y + upper.height, lower.y + lower.height) - Math.max(upper.y, lower.y)
        if (overlapX > 0 && overlapY > 0) {
          const pushed = upper.y + upper.height / 2 > lower.y + lower.height / 2 ? upper : lower
          pushed.y += overlapY + 10
          moved = true
        }
      }
    }
    if (!moved) break
  }
  boxes.forEach((box) => positions.set(box.id, { x: box.x, y: box.y }))
}

function arrangeWithDagre(nodes, edges) {
  const visibleNodes = nodes.filter((node) => !node.hidden)
  if (visibleNodes.length < 2) return nodes
  const nodesById = new Map(visibleNodes.map((node) => [node.id, node]))
  const outgoing = new Map(visibleNodes.map((node) => [node.id, []]))
  edges.forEach((edge) => {
    if (edge.source === edge.target || !nodesById.has(edge.source) || !nodesById.has(edge.target)) return
    outgoing.get(edge.source)?.push(edge.target)
  })
  const treeEdges = []
  const visited = new Set()
  const inProgress = new Set()
  const walk = (id) => {
    if (visited.has(id) || inProgress.has(id)) return
    inProgress.add(id)
    for (const childId of outgoing.get(id) || []) {
      if (visited.has(childId) || inProgress.has(childId)) continue
      treeEdges.push([id, childId])
      walk(childId)
    }
    visited.add(id)
    inProgress.delete(id)
  }
  const hasIncoming = new Set()
  outgoing.forEach((targets) => targets.forEach((target) => hasIncoming.add(target)))
  visibleNodes.filter((node) => !hasIncoming.has(node.id)).forEach((node) => walk(node.id))
  visibleNodes.forEach((node) => walk(node.id))
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 42, edgesep: 24, ranksep: 120, marginx: 0, marginy: 0 })
  graph.setDefaultEdgeLabel(() => ({}))
  visibleNodes.forEach((node) => graph.setNode(node.id, { width: nodeWidthOf(node), height: nodeHeightOf(node) }))
  treeEdges.forEach(([sourceId, targetId]) => graph.setEdge(sourceId, targetId))
  dagre.layout(graph)
  const laidOut = visibleNodes.map((node) => {
    const placed = graph.node(node.id)
    return {
      node,
      x: placed.x - nodeWidthOf(node) / 2,
      y: placed.y - nodeHeightOf(node) / 2,
    }
  })
  const shiftX = Math.min(...visibleNodes.map((node) => node.position.x)) - Math.min(...laidOut.map((item) => item.x))
  const shiftY = Math.min(...visibleNodes.map((node) => node.position.y)) - Math.min(...laidOut.map((item) => item.y))
  const positions = new Map(laidOut.map((item) => [item.node.id, { x: item.x + shiftX, y: item.y + shiftY }]))
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) || node.position }))
}

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

function arrangeMapForward(nodes, edges, preserveRootPositions = false, preferredParentEdgeId = null) {
  const visibleNodes = nodes.filter((node) => !node.hidden)
  if (!visibleNodes.length) return nodes
  const nodesById = new Map(visibleNodes.map((node) => [node.id, node]))
  const parentById = new Map()
  const directionByChild = new Map()
  const layoutEdges = preferredParentEdgeId
    ? [...edges.filter((edge) => edge.id === preferredParentEdgeId), ...edges.filter((edge) => edge.id !== preferredParentEdgeId)]
    : edges
  layoutEdges.forEach((edge) => {
    if (edge.source !== edge.target && nodesById.has(edge.source) && nodesById.has(edge.target) && !parentById.has(edge.target)) {
      parentById.set(edge.target, edge.source)
      directionByChild.set(edge.target, edge.sourceHandle === 'source-left' ? 'left' : 'right')
    }
  })
  const childrenById = new Map(visibleNodes.map((node) => [node.id, []]))
  parentById.forEach((parentId, childId) => childrenById.get(parentId)?.push(childId))
  childrenById.forEach((children) => children.sort((leftId, rightId) => compareBranchOrder(nodesById.get(leftId), nodesById.get(rightId))))

  const heightOf = nodeHeightOf
  const widthOf = nodeWidthOf
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
  resolveNodeOverlaps(positions, nodesById)

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
  const parentCenterY = parent.position.y + nodeHeightOf(parent) / 2
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
      const bottom = Math.max(...members.map((item) => item.position.y + nodeHeightOf(item)))
      return { node, ids, top, height: bottom - top }
    })
    const totalHeight = groups.reduce((total, group) => total + group.height, 0) + Math.max(0, groups.length - 1) * siblingGap
    let cursorY = parentCenterY - totalHeight / 2
    const widestSibling = Math.max(...siblings.map(nodeWidthOf))
    const columnX = side === 'left'
      ? parent.position.x - widestSibling - levelGap
      : parent.position.x + nodeWidthOf(parent) + levelGap

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
      edges: normalizeProjectHandles(saved || {}).edges,
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
  const Icon = data.kind === 'branch' ? GitBranch : Lightbulb
  const customColor = isHexColor(data.customColor) ? data.customColor : ''
  const [editing, setEditing] = useState(false)
  const [labelMentionPicker, setLabelMentionPicker] = useState(null)
  const labelRef = useRef(null)
  const pendingLabelCaretRef = useRef(null)
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
        if (data.selectMode) { data.onToggleSelect?.(); return }
        data.onSelect?.()
        data.onToggleBranch?.(side)
      }}
    />
  )

  useEffect(() => {
    if (!labelRef.current) return
    labelRef.current.style.height = 'auto'
    labelRef.current.style.height = `${labelRef.current.scrollHeight}px`
    if (pendingLabelCaretRef.current != null) {
      labelRef.current.focus()
      labelRef.current.setSelectionRange(pendingLabelCaretRef.current, pendingLabelCaretRef.current)
      pendingLabelCaretRef.current = null
    }
  }, [label, editing])

  const handleLabelInput = (event) => {
    const { value, selectionStart: caret } = event.currentTarget
    const labelMentions = (data.labelMentions || []).filter((mention) => value.includes(mention.text))
    data.onLabelChange?.(value, labelMentions)
    if (labelMentionPicker) {
      const query = value.slice(labelMentionPicker.queryStart, caret)
      if (caret < labelMentionPicker.queryStart || query.includes('\n')) setLabelMentionPicker(null)
      else setLabelMentionPicker({ ...labelMentionPicker, end: caret, query })
    } else if (value[caret - 1] === '@') {
      setLabelMentionPicker({ start: caret - 1, queryStart: caret, end: caret, step: 'type', kind: null, containerId: null, query: '' })
    }
  }

  const labelMentionTypes = [
    { id: 'mind-map', title: data.language === 'en' ? 'Mind map' : 'خريطة ذهنية' },
    { id: 'task', title: data.language === 'en' ? 'Task' : 'مهمة' },
    { id: 'note', title: data.language === 'en' ? 'Note' : 'ملاحظة' },
    { id: 'flowchart', title: data.language === 'en' ? 'Flowchart' : 'مخطط انسيابي' },
  ]
  const labelMentionContainers = labelMentionPicker?.kind === 'mind-map' ? data.workspaceProjects || [] : data.workspaceFlowcharts || []
  const labelMentionContainer = labelMentionContainers.find((item) => item.id === labelMentionPicker?.containerId)
  const labelMentionItems = labelMentionPicker?.kind === 'mind-map'
    ? labelMentionContainer?.nodes || []
    : labelMentionPicker?.kind === 'task'
      ? data.workspaceTasks || []
      : labelMentionPicker?.kind === 'note'
        ? data.workspaceNotes || []
      : labelMentionContainer?.nodes || []
  const labelMentionQuery = labelMentionPicker?.query?.toLocaleLowerCase() || ''
  const labelMentionOptions = labelMentionPicker?.step === 'type'
    ? labelMentionTypes.filter((item) => item.title.toLocaleLowerCase().includes(labelMentionQuery))
    : labelMentionPicker?.step === 'container'
      ? labelMentionContainers.filter((item) => (item.title || '').toLocaleLowerCase().includes(labelMentionQuery))
      : labelMentionItems.filter((item) => `${labelMentionPicker?.kind === 'task' ? item.title || '' : item.data?.label || ''}`.toLocaleLowerCase().includes(labelMentionQuery))

  const updateLabelMentionSearch = (step, kind = labelMentionPicker?.kind, containerId = labelMentionPicker?.containerId) => {
    if (!labelMentionPicker) return
    const cleanLabel = `${label.slice(0, labelMentionPicker.start + 1)}${label.slice(labelMentionPicker.end)}`
    data.onLabelChange?.(cleanLabel, (data.labelMentions || []).filter((mention) => cleanLabel.includes(mention.text)))
    const queryStart = labelMentionPicker.start + 1
    pendingLabelCaretRef.current = queryStart
    setLabelMentionPicker({ ...labelMentionPicker, step, kind, containerId, queryStart, end: queryStart, query: '' })
  }

  const insertLabelMention = (item) => {
    if (!labelMentionPicker) return
    const container = labelMentionPicker.kind === 'mind-map'
      ? (data.workspaceProjects || []).find((project) => project.id === labelMentionPicker.containerId)
      : labelMentionPicker.kind === 'flowchart'
        ? (data.workspaceFlowcharts || []).find((flowchart) => flowchart.id === labelMentionPicker.containerId)
        : null
    if (!['task', 'note'].includes(labelMentionPicker.kind) && !container) return
    const itemTitle = labelMentionPicker.kind === 'task' ? item.title || 'مهمة بدون عنوان' : labelMentionPicker.kind === 'note' ? item.title || 'ملاحظة بدون عنوان' : item.data?.label || 'بدون عنوان'
    const containerTitle = container?.title || ''
    const prefix = labelMentionPicker.kind === 'mind-map' ? 'ðŸ§ ' : labelMentionPicker.kind === 'task' ? 'âœ“' : labelMentionPicker.kind === 'note' ? 'ðŸ“' : 'â†—'
    const mentionText = `@${prefix} ${containerTitle ? `${containerTitle} / ` : ''}${itemTitle}`
    const nextLabel = `${label.slice(0, labelMentionPicker.start)}${mentionText}${label.slice(labelMentionPicker.end)}`
    const mention = labelMentionPicker.kind === 'mind-map'
      ? { type: 'mind-map-node', projectId: container.id, nodeId: item.id, projectTitle: containerTitle, nodeTitle: itemTitle, text: mentionText }
      : labelMentionPicker.kind === 'task'
        ? { type: 'task', taskId: item.id, taskTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
        : labelMentionPicker.kind === 'note'
          ? { type: 'note', noteId: item.id, noteTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
          : { type: 'flowchart-node', flowchartId: container.id, flowchartTitle: containerTitle, nodeId: item.id, nodeTitle: itemTitle, workspaceId: container.workspaceId, text: mentionText }
    data.onLabelChange?.(nextLabel, [...(data.labelMentions || []), mention])
    pendingLabelCaretRef.current = labelMentionPicker.start + mentionText.length
    setLabelMentionPicker(null)
  }

  const renderLabelMentions = () => {
    const mentions = (data.labelMentions || []).map((mention) => ({ ...mention, index: label.indexOf(mention.text) })).filter((mention) => mention.index >= 0).sort((left, right) => left.index - right.index)
    const parts = []
    let cursor = 0
    mentions.forEach((mention, index) => {
      if (mention.index < cursor) return
      if (mention.index > cursor) parts.push(label.slice(cursor, mention.index))
      const displayText = mention.taskTitle || mention.noteTitle || mention.nodeTitle || mention.text
      parts.push(<button type="button" className="node-inline-mention" key={`${mention.text}-${index}`} title={mention.projectTitle || mention.flowchartTitle || ''} onClick={(event) => { event.stopPropagation(); data.onOpenMention?.(mention) }}>{displayText}</button>)
      cursor = mention.index + mention.text.length
    })
    if (cursor < label.length) parts.push(label.slice(cursor))
    return parts.length ? parts : label
  }

  const startEditing = (event) => {
    event.stopPropagation()
    if (data.selectMode) { data.onToggleSelect?.(); return }
    data.onSelect?.()
    data.onCloseNotes?.()
    setEditing(true)
  }

  const finishEditing = () => {
    setEditing(false)
  }

  return (
    <div
      className={`map-node tone-${data.tone || 'mint'}${customColor ? ' has-custom-color' : ''}${selected ? ' is-selected' : ''}${data.isLinkSource ? ' is-link-source' : ''}${data.dropHint ? ` drop-${data.dropHint}` : ''}`}
      style={{ width: '100%', height: '100%', boxSizing: 'border-box', ...(customColor ? { '--custom-node-color': customColor } : {}) }}
      onPointerDown={data.onTouchStart}
      onPointerMove={data.onTouchMove}
      onPointerUp={data.onTouchEnd}
      onPointerCancel={data.onTouchEnd}
      onPointerLeave={data.onTouchEnd}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={minNodeWidth}
        minHeight={minNodeHeight}
        maxWidth={520}
        maxHeight={360}
        lineStyle={{ borderColor: '#4b9a76' }}
        handleStyle={{ width: TOUCH_DEVICE ? 13 : 8, height: TOUCH_DEVICE ? 13 : 8, borderRadius: 4, borderColor: '#fff', background: '#4b9a76' }}
      />
      {selected && (
        <button
          className="node-drag-handle"
          type="button"
          aria-label={data.language === 'en' ? 'Drag node' : 'اسحب لتحريك العقدة'}
          title={data.language === 'en' ? 'Drag to move node' : 'اسحب لتحريك العقدة'}
        >
          <Move size={15} />
        </button>
      )}
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
          onChange={handleLabelInput}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && labelMentionPicker) { event.preventDefault(); setLabelMentionPicker(null); return }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              finishEditing()
            }
          }}
        />
      ) : (
        <div className="node-label node-label-button" role="button" tabIndex={0} onClick={startEditing} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); startEditing(event) } }} title={data.language === 'en' ? 'Edit node name' : 'تحرير اسم العقدة'}>
          {data.labelMentions?.length ? renderLabelMentions() : (displayLabel || (data.language === 'en' ? 'Untitled' : 'بدون عنوان'))}
        </div>
      )}
      {editing && labelMentionPicker && <div className="map-node-mention-picker nodrag nopan" role="listbox" aria-label={data.language === 'en' ? 'Choose an item to mention' : 'اختر عنصرًا لمنشنه'} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()}>
        <div className="notes-mention-heading">
          <strong>{labelMentionPicker.step === 'type' ? (data.language === 'en' ? 'Choose type' : 'اختر النوع') : labelMentionPicker.step === 'container' ? (data.language === 'en' ? 'Choose map' : 'اختر الخريطة') : (data.language === 'en' ? 'Choose item' : 'اختر العنصر')}</strong>
          {labelMentionPicker.step !== 'type' && <button type="button" onClick={() => updateLabelMentionSearch(labelMentionPicker.step === 'item' && !['task', 'note'].includes(labelMentionPicker.kind) ? 'container' : 'type', labelMentionPicker.step === 'item' && !['task', 'note'].includes(labelMentionPicker.kind) ? labelMentionPicker.kind : null, labelMentionPicker.step === 'item' && !['task', 'note'].includes(labelMentionPicker.kind) ? labelMentionPicker.containerId : null)}>{data.language === 'en' ? 'Back' : 'رجوع'}</button>}
        </div>
        <div className="notes-mention-options">
          {labelMentionOptions.map((item) => labelMentionPicker.step === 'type' ? (
          <button type="button" role="option" key={item.id} onClick={() => updateLabelMentionSearch(item.id === 'task' || item.id === 'note' ? 'item' : 'container', item.id, null)}><strong>{item.title}</strong><small>{item.id === 'mind-map' ? data.workspaceProjects?.length || 0 : item.id === 'task' ? data.workspaceTasks?.length || 0 : item.id === 'note' ? data.workspaceNotes?.length || 0 : data.workspaceFlowcharts?.length || 0}</small></button>
          ) : labelMentionPicker.step === 'container' ? (
            <button type="button" role="option" key={item.id} onClick={() => updateLabelMentionSearch('item', labelMentionPicker.kind, item.id)}><strong>{item.title || (data.language === 'en' ? 'Untitled' : 'بدون عنوان')}</strong><small>{item.nodes?.length || 0}</small></button>
          ) : (
            <button type="button" role="option" key={item.id} onClick={() => insertLabelMention(item)}><strong>{labelMentionPicker.kind === 'task' || labelMentionPicker.kind === 'note' ? item.title : item.data?.label || (data.language === 'en' ? 'Untitled' : 'بدون عنوان')}</strong></button>
          ))}
          {!labelMentionOptions.length && <span className="notes-mention-empty">{data.language === 'en' ? 'No matching items' : 'لا توجد عناصر مطابقة'}</span>}
        </div>
      </div>}
      {sourceHandle('left', Position.Left)}
      {sourceHandle('right', Position.Right)}
    </div>
  )
}

const nodeTypes = { mapNode: MapNode }

function App() {
  const [workspaces, setWorkspaces] = useState(readWorkspaces)
  const [projectsFolder, setProjectsFolder] = useState('')
  const [projects, setProjects] = useState(readProjects)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [openProjectIds, setOpenProjectIds] = useState([])
  const [mapListCollapsed, setMapListCollapsed] = useState(() => localStorage.getItem('waraqa-map-list-collapsed') === 'true')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [mindMapHomeOpen, setMindMapHomeOpen] = useState(false)
  const [activeTool, setActiveTool] = useState('mind-map')
  const [standaloneNotes, setStandaloneNotes] = useState(readStandaloneNotes)
  const [tasks, setTasks] = useState(readTasks)
  const [taskLists, setTaskLists] = useState(readTaskLists)
  const [flowcharts, setFlowcharts] = useState(readFlowcharts)
  const [uiDesigns, setUiDesigns] = useState(readUiDesigns)
  const [activeUiDesignId, setActiveUiDesignId] = useState(null)
  const [activeFlowchartId, setActiveFlowchartId] = useState(null)
  const [openNoteIds, setOpenNoteIds] = useState(() => readOpenStandaloneNoteIds(standaloneNotes))
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('waraqa-theme') === 'dark' ? 'dark' : 'light')
  const [renameProjectOpen, setRenameProjectOpen] = useState(false)
  const [renameProjectDraft, setRenameProjectDraft] = useState('')
  const [pendingDeleteProject, setPendingDeleteProject] = useState(null)
  const [pendingDeleteWorkspace, setPendingDeleteWorkspace] = useState(null)
  const [pendingCloseProjectId, setPendingCloseProjectId] = useState(null)
  const [savedMap] = useState(() => projects[0] || readSavedMap())
  const [title, setTitle] = useState(savedMap.title)
  const [nodes, setNodes] = useState(savedMap.nodes)
  const [edges, setEdges] = useState(savedMap.edges)
  const [edgeStyle, setEdgeStyle] = useState(savedMap.edgeStyle)
  const [edgeColor, setEdgeColor] = useState(savedMap.edgeColor)
  const [edgeWidth, setEdgeWidth] = useState(savedMap.edgeWidth)
  const [arrowHead, setArrowHead] = useState(savedMap.arrowHead)
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('waraqa-layout-mode') === 'auto' ? 'auto' : 'tree')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [desktopMaximized, setDesktopMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('waraqa-language') || 'ar')
  const [activeTone, setActiveTone] = useState('mint')
  const [activeCustomColor, setActiveCustomColor] = useState(toneColors.mint)
  const [exportingImage, setExportingImage] = useState(false)
  const [exportingWorkspace, setExportingWorkspace] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesMounted, setNotesMounted] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(() => !window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches)
  const [miniMapVisible, setMiniMapVisible] = useState(() => localStorage.getItem('waraqa-minimap-visible') !== 'false')
  const [selectMode, setSelectMode] = useState(false)
  const [selectionDrag, setSelectionDrag] = useState(null)
  const [tautEdgeId, setTautEdgeId] = useState(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null)
  const [branchDropHint, setBranchDropHint] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [pendingMentionFocus, setPendingMentionFocus] = useState(null)
  const [pendingTaskMentionFocus, setPendingTaskMentionFocus] = useState(null)
  const [pendingFlowchartMentionFocus, setPendingFlowchartMentionFocus] = useState(null)
  const [nodeNoteMentionPicker, setNodeNoteMentionPicker] = useState(null)
  const nodeNoteInputRef = useRef(null)
  const openMentionRef = useRef(null)
  const clearPendingTaskMentionFocus = useCallback(() => setPendingTaskMentionFocus(null), [])
  const clearPendingFlowchartMentionFocus = useCallback(() => setPendingFlowchartMentionFocus(null), [])
  const flowRef = useRef(null)
  const layoutAnimationFrame = useRef(null)
  const lastEdgeTap = useRef({ id: null, time: 0 })
  const canvasRef = useRef(null)
  const importRef = useRef(null)
  const projectFolderImportRef = useRef(null)
  const documentImportRef = useRef(null)
  const renameInputRef = useRef(null)
  const searchInputRef = useRef(null)
  const shortcutActionsRef = useRef(null)
  const dragSnapshot = useRef(null)
  const linkPressRef = useRef({ timer: null, start: null })
  const backOverlayRef = useRef(null)
  const [linkSourceNodeId, setLinkSourceNodeId] = useState(null)
  const projectSavePoints = useRef(new Map())
  const workspaceSyncQueueRef = useRef(Promise.resolve())
  const workspaceSyncRevisionRef = useRef(0)
  const workspacePreviewCacheRef = useRef(new Map())
  const projectsFolderHandleRef = useRef(null)
  const workspaceDataRef = useRef(null)
  const [copiedNode, setCopiedNode] = useState(null)
  const pasteCount = useRef(0)
  const desktopWindow = window.waraqaWindow
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null
  const workspaceProjects = projects.filter((project) => project.workspaceId === activeWorkspaceId)
  const workspaceNotes = standaloneNotes.filter((note) => note.workspaceId === activeWorkspaceId)
  const workspaceTasks = tasks.filter((task) => task.workspaceId === activeWorkspaceId)
  const workspaceTaskLists = taskLists.filter((list) => list.workspaceId === activeWorkspaceId)
  const workspaceFlowcharts = flowcharts.filter((flowchart) => flowchart.workspaceId === activeWorkspaceId)
  const workspaceUiDesigns = uiDesigns.filter((design) => design.workspaceId === activeWorkspaceId)
  workspaceDataRef.current = { workspaces, projects, standaloneNotes, tasks, taskLists, flowcharts, uiDesigns }
  const isWorkspaceDocumentOpen = Boolean(activeWorkspace && (
    (activeTool === 'mind-map' && !mindMapHomeOpen && activeProjectId)
    || (activeTool === 'notes' && (activeNoteId || workspaceNotes.some((note) => openNoteIds.includes(note.id))))
    || activeTool === 'tasks'
    || (activeTool === 'ui-design' && workspaceUiDesigns.some((design) => design.id === activeUiDesignId))
    || (activeTool === 'flowchart' && workspaceFlowcharts.some((flowchart) => flowchart.id === activeFlowchartId))
  ))
  useEffect(() => {
    let alive = true
    const loadFolder = desktopWindow?.getProjectsFolder
      ? desktopWindow.getProjectsFolder().then((folder) => { if (alive && folder) setProjectsFolder(folder) })
      : readProjectsFolderHandle().then((handle) => {
        if (alive && handle) {
          projectsFolderHandleRef.current = handle
          setProjectsFolder(handle.name || '')
        }
      })
    loadFolder.catch((error) => console.warn('Could not read the projects folder setting.', error))
    return () => { alive = false }
  }, [desktopWindow])

  useEffect(() => {
    if (!projectsFolder || !desktopWindow?.readProjectFolders) return undefined
    let alive = true
    desktopWindow.readProjectFolders().then(async (storedProjects) => {
      if (!alive || !Array.isArray(storedProjects) || !storedProjects.length) return
      for (const entry of storedProjects) {
        for (const attachment of entry.attachments || []) {
          if (!attachment?.id || !attachment?.data) continue
          await saveNoteAttachmentWithId(attachment.id, new File([attachment.data], attachment.name || 'attachment', { type: attachment.type || 'application/octet-stream' }))
        }
      }
      if (!alive) return
      const bundles = storedProjects.map((entry) => entry.bundle).filter((bundle) => bundle?.format === 'waraqa-workspace' && bundle.workspace?.id)
      const current = workspaceDataRef.current || { workspaces, projects, standaloneNotes, tasks, taskLists, flowcharts, uiDesigns }
      const existingWorkspaceIds = new Set(current.workspaces.map((workspace) => workspace.id))
      const missingBundles = bundles.filter((bundle) => !existingWorkspaceIds.has(bundle.workspace.id))
      if (!missingBundles.length) return
      const nextWorkspaces = [...current.workspaces, ...missingBundles.map((bundle) => bundle.workspace)]
      const nextProjects = [...current.projects, ...missingBundles.flatMap((bundle) => bundle.mindMaps || [])]
      const nextNotes = [...current.standaloneNotes, ...missingBundles.flatMap((bundle) => bundle.notes || [])]
      const nextTasks = [...current.tasks, ...missingBundles.flatMap((bundle) => bundle.tasks || [])]
      const nextTaskLists = [...current.taskLists, ...missingBundles.flatMap((bundle) => bundle.taskLists || [])]
      const nextFlowcharts = [...current.flowcharts, ...missingBundles.flatMap((bundle) => bundle.flowcharts || [])]
      const nextUiDesigns = [...current.uiDesigns, ...missingBundles.flatMap((bundle) => bundle.uiDesigns || [])]
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects))
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks))
        localStorage.setItem(TASK_LISTS_STORAGE_KEY, JSON.stringify(nextTaskLists))
        localStorage.setItem(FLOWCHARTS_STORAGE_KEY, JSON.stringify(nextFlowcharts))
        localStorage.setItem(UI_DESIGNS_STORAGE_KEY, JSON.stringify(nextUiDesigns))
        saveWorkspaces(nextWorkspaces)
        setProjects(nextProjects)
        setStandaloneNotes(nextNotes)
        setTasks(nextTasks)
        setTaskLists(nextTaskLists)
        setFlowcharts(nextFlowcharts)
        setUiDesigns(nextUiDesigns)
      } catch (error) {
        console.error('Could not restore projects from the selected folder.', error)
      }
    }).catch((error) => console.error('Could not read projects from the selected folder.', error))
    return () => { alive = false }
  }, [projectsFolder, desktopWindow])

  useEffect(() => {
    if (!projectsFolder || (!desktopWindow?.saveWorkspaceFolder && !projectsFolderHandleRef.current) || !workspaces.length) return undefined
    const revision = ++workspaceSyncRevisionRef.current
    const timer = window.setTimeout(() => {
      workspaceSyncQueueRef.current = workspaceSyncQueueRef.current.catch(() => undefined).then(async () => {
        if (revision !== workspaceSyncRevisionRef.current) return
        let allProjects = projects
        if (activeWorkspaceId && activeProjectId && activeTool === 'mind-map') {
          const activeProject = normalizeProjectHandles({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead })
          allProjects = projects.some((project) => project.id === activeProjectId)
            ? projects.map((project) => project.id === activeProjectId ? { ...project, ...activeProject, id: activeProjectId, workspaceId: activeWorkspaceId } : project)
            : [{ ...activeProject, id: activeProjectId, workspaceId: activeWorkspaceId }, ...projects]
        }
        for (const workspace of workspaces) {
          if (revision !== workspaceSyncRevisionRef.current) return
          const bundle = {
            format: 'waraqa-workspace', formatVersion: 1, exportedAt: isoTimestamp(), workspace,
            textDirection: appLanguage === 'en' ? 'ltr' : 'rtl',
            mindMaps: allProjects.filter((project) => project.workspaceId === workspace.id),
            notes: standaloneNotes.filter((note) => note.workspaceId === workspace.id),
            tasks: tasks.filter((task) => task.workspaceId === workspace.id),
            taskLists: taskLists.filter((list) => list.workspaceId === workspace.id),
            flowcharts: flowcharts.filter((flowchart) => flowchart.workspaceId === workspace.id),
            uiDesigns: uiDesigns.filter((design) => design.workspaceId === workspace.id),
          }
          const attachmentIds = new Set()
          const collectAttachmentIds = (value) => {
            if (!value || typeof value !== 'object') return
            if (typeof value.fileId === 'string') attachmentIds.add(value.fileId)
            Object.values(value).forEach(collectAttachmentIds)
          }
          bundle.notes.forEach(collectAttachmentIds)
          const attachments = (await Promise.all([...attachmentIds].map(async (id) => {
            try {
              const attachment = await readNoteAttachment(id)
              return attachment?.blob ? { id, name: attachment.name, type: attachment.type, blob: attachment.blob } : null
            } catch { return null }
          }))).filter(Boolean)
          const previewSignature = bundle.uiDesigns.map((design) => `${design.id}:${design.updatedAt || ''}`).join('|')
          let previews = workspacePreviewCacheRef.current.get(workspace.id)?.previews || []
          if (workspacePreviewCacheRef.current.get(workspace.id)?.signature !== previewSignature) {
            try { previews = await createDesignPreviews(bundle.uiDesigns, {}, appLanguage) } catch (error) {
              console.warn('Could not refresh interface preview images for the project folder.', error)
              previews = []
            }
            workspacePreviewCacheRef.current.set(workspace.id, { signature: previewSignature, previews })
          }
          const archive = await createWorkspaceArchive(bundle, attachments, previews)
          if (desktopWindow?.saveWorkspaceFolder) await desktopWindow.saveWorkspaceFolder(workspace.id, await archive.arrayBuffer())
          else if (projectsFolderHandleRef.current) await writeWorkspaceArchiveToHandle(projectsFolderHandleRef.current, archive)
        }
      }).catch((error) => console.error('Could not sync projects to the selected folder.', error))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [projectsFolder, workspaces, projects, standaloneNotes, tasks, taskLists, flowcharts, uiDesigns, activeWorkspaceId, activeProjectId, activeTool, title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead, appLanguage, desktopWindow])
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
  const changeLayoutMode = (mode) => {
    setLayoutMode(mode)
    localStorage.setItem('waraqa-layout-mode', mode)
  }
  const saveWorkspaces = (nextWorkspaces) => {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(nextWorkspaces))
    setWorkspaces(nextWorkspaces)
  }
  const ensureProjectsFolder = async () => {
    if (!desktopWindow?.chooseProjectsFolder) {
      let handle = projectsFolderHandleRef.current
      try {
        if (!handle && window.showDirectoryPicker) {
          handle = await window.showDirectoryPicker({ id: 'waraqa-projects', mode: 'readwrite' })
          projectsFolderHandleRef.current = handle
          await saveProjectsFolderHandle(handle)
        }
        if (!handle) {
          window.alert(appLanguage === 'en' ? 'Choose a folder from the installed Waraqa desktop app, or use a browser that supports folder access.' : 'اختر المجلد من نسخة ورقة للكمبيوتر أو افتح البرنامج بمتصفح يدعم الوصول للمجلدات.')
          return false
        }
        let permission = await handle.queryPermission?.({ mode: 'readwrite' })
        if (permission !== 'granted') permission = await handle.requestPermission?.({ mode: 'readwrite' })
        if (permission && permission !== 'granted') return false
        setProjectsFolder(handle.name || '')
        return true
      } catch (error) {
        if (error?.name !== 'AbortError') console.error('Could not choose the projects folder.', error)
        return false
      }
    }
    let folder = projectsFolder
    if (!folder) {
      try { folder = await desktopWindow.getProjectsFolder() } catch (error) { console.warn('Could not read the projects folder setting.', error) }
    }
    if (!folder) {
      try { folder = await desktopWindow.chooseProjectsFolder(appLanguage) } catch (error) { console.error('Could not choose the projects folder.', error) }
    }
    if (!folder) return false
    setProjectsFolder(folder)
    return true
  }
  const openWorkspace = (workspace) => runPageTransition(() => {
    setActiveWorkspaceId(workspace.id)
    setWorkspaceOpen(true)
    setActiveProjectId(null)
    setActiveTool('mind-map')
    setMindMapHomeOpen(false)
    setActiveNoteId(null)
    setLibraryOpen(false)
  })
  const createWorkspace = async () => {
    if (!(await ensureProjectsFolder())) return
    const workspace = {
      id: newProjectId(),
      title: 'مشروع جديد',
      createdAt: currentTimestamp(),
      updatedAt: currentTimestamp(),
    }
    saveWorkspaces([workspace, ...workspaces])
    openWorkspace(workspace)
  }
  const renameWorkspace = (workspaceId, nextTitle) => {
    const nextWorkspaces = workspaces.map((workspace) => workspace.id === workspaceId
      ? { ...workspace, title: nextTitle, updatedAt: currentTimestamp() }
      : workspace)
    saveWorkspaces(nextWorkspaces)
  }
  const createWorkspaceNote = async () => {
    if (!activeWorkspaceId) return
    if (!(await ensureProjectsFolder())) return
    const note = {
      id: newProjectId(),
      workspaceId: activeWorkspaceId,
      title: 'ملاحظة جديدة',
      content: '',
      pages: [''],
      updatedAt: currentTimestamp(),
    }
    const nextNotes = [note, ...standaloneNotes]
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
    } catch (error) {
      console.error('Could not create workspace note.', error)
      window.alert('تعذر إنشاء الملاحظة. قد تكون مساحة التخزين ممتلئة.')
      return
    }
    runPageTransition(() => {
      setStandaloneNotes(nextNotes)
      saveOpenNoteIds([...openNoteIds, note.id])
      setActiveNoteId(note.id)
      setActiveTool('notes')
      setWorkspaceOpen(false)
    }, 'forward')
  }
  const selectTool = async (tool) => {
    if (desktopWindow?.chooseProjectsFolder && !projectsFolder && !(await ensureProjectsFolder())) return
    if (tool === 'ui-design') {
      if (activeTool === 'ui-design' && activeUiDesignId) return
      shortcutActionsRef.current?.saveNow()
      return runPageTransition(() => {
        let targetWorkspaceId = activeWorkspaceId || workspaces[0]?.id || null
        if (!targetWorkspaceId) {
          const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
          targetWorkspaceId = workspace.id
          saveWorkspaces([workspace, ...workspaces])
        }
        const existingDesign = uiDesigns.find((design) => design.workspaceId === targetWorkspaceId)
        setActiveWorkspaceId(targetWorkspaceId)
        setActiveUiDesignId(existingDesign?.id || null)
        setActiveProjectId(null)
        setActiveNoteId(null)
        setActiveTool('ui-design')
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      }, 'lateral')
    }
    if (tool === 'flowchart') {
      shortcutActionsRef.current?.saveNow()
      return runPageTransition(() => {
        let targetWorkspaceId = activeWorkspaceId || workspaces[0]?.id || null
        if (!targetWorkspaceId) {
          const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
          targetWorkspaceId = workspace.id
          saveWorkspaces([workspace, ...workspaces])
        }
        const existingFlowchart = flowcharts.find((flowchart) => flowchart.workspaceId === targetWorkspaceId)
        setActiveWorkspaceId(targetWorkspaceId)
        setActiveFlowchartId(existingFlowchart?.id || null)
        setActiveProjectId(null)
        setActiveNoteId(null)
        setActiveTool('flowchart')
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      }, 'lateral')
    }
    if (tool === 'tasks') {
      shortcutActionsRef.current?.saveNow()
      return runPageTransition(() => {
        let targetWorkspaceId = activeWorkspaceId || workspaces[0]?.id || null
        if (!targetWorkspaceId) {
          const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
          targetWorkspaceId = workspace.id
          saveWorkspaces([workspace, ...workspaces])
        }
        setActiveWorkspaceId(targetWorkspaceId)
        setActiveNoteId(null)
        setActiveTool('tasks')
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      }, 'lateral')
    }
    if (tool === 'mind-map' && !activeProjectId) {
      return runPageTransition(() => {
        let targetWorkspaceId = activeWorkspaceId || workspaces[0]?.id || null
        if (!targetWorkspaceId) {
          const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
          targetWorkspaceId = workspace.id
          saveWorkspaces([workspace, ...workspaces])
        }
        setActiveWorkspaceId(targetWorkspaceId)
        setActiveNoteId(null)
        setActiveTool('mind-map')
        setMindMapHomeOpen(true)
        setWorkspaceOpen(true)
        setLibraryOpen(false)
      }, 'lateral')
    }
    return runPageTransition(() => {
    if (tool === 'notes') {
      shortcutActionsRef.current?.saveNow()
      setMindMapHomeOpen(false)
      const targetWorkspaceId = activeWorkspaceId || workspaces[0]?.id || null
      if (!targetWorkspaceId) {
        const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
        saveWorkspaces([workspace])
        setActiveWorkspaceId(workspace.id)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
        setActiveTool('notes')
        return
      }
      if (targetWorkspaceId) setActiveWorkspaceId(targetWorkspaceId)
      setLibraryOpen(false)
      setWorkspaceOpen(false)
      setMindMapHomeOpen(false)
      const scopedOpenNotes = openNoteIds.filter((id) => standaloneNotes.some((note) => note.id === id && note.workspaceId === targetWorkspaceId))
      setActiveNoteId((current) => current && scopedOpenNotes.includes(current) ? current : scopedOpenNotes[0] || null)
    }
    setActiveTool(tool)
    }, 'lateral')
  }
  const selectNoteTab = (noteId) => runPageTransition(() => {
    if (activeTool === 'mind-map') shortcutActionsRef.current?.saveNow()
    const note = standaloneNotes.find((item) => item.id === noteId)
    if (note?.workspaceId) setActiveWorkspaceId(note.workspaceId)
    if (!openNoteIds.includes(noteId)) saveOpenNoteIds([...openNoteIds, noteId])
    setActiveNoteId(noteId)
    setMindMapHomeOpen(false)
    setLibraryOpen(false)
    setWorkspaceOpen(false)
    setActiveTool('notes')
  }, 'lateral')
  const saveOpenNoteIds = (noteIds) => {
    try {
      localStorage.setItem(OPEN_NOTES_STORAGE_KEY, JSON.stringify(noteIds))
    } catch (error) {
      console.error('Could not save open note tabs.', error)
    }
    setOpenNoteIds(noteIds)
  }
  const handleStandaloneNotesChange = (nextNotes) => {
    const previousIds = new Set(standaloneNotes.map((note) => note.id))
    const validIds = new Set(nextNotes.map((note) => note.id))
    const addedIds = nextNotes.filter((note) => !previousIds.has(note.id)).map((note) => note.id)
    setStandaloneNotes(nextNotes)
    setOpenNoteIds((current) => {
      const next = [...current.filter((id) => validIds.has(id)), ...addedIds]
      try {
        localStorage.setItem(OPEN_NOTES_STORAGE_KEY, JSON.stringify(next))
      } catch (error) {
        console.error('Could not save open note tabs.', error)
      }
      return next
    })
  }
  const handleWorkspaceTasksChange = (nextWorkspaceTasks) => {
    const nextTasks = [
      ...tasks.filter((task) => task.workspaceId !== activeWorkspaceId),
      ...nextWorkspaceTasks.map((task) => ({ ...task, workspaceId: activeWorkspaceId })),
    ]
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks))
      setTasks(nextTasks)
    } catch (error) {
      console.error('Could not save workspace tasks.', error)
      window.alert(appLanguage === 'en' ? 'Could not save tasks. Browser storage may be full.' : 'تعذر حفظ المهام. قد تكون مساحة التخزين ممتلئة.')
    }
  }
  const handleWorkspaceTaskListsChange = (nextWorkspaceTaskLists) => {
    const nextLists = [...taskLists.filter((list) => list.workspaceId !== activeWorkspaceId), ...nextWorkspaceTaskLists.map((list) => ({ ...list, workspaceId: activeWorkspaceId }))]
    try {
      localStorage.setItem(TASK_LISTS_STORAGE_KEY, JSON.stringify(nextLists))
      setTaskLists(nextLists)
    } catch (error) {
      console.error('Could not save task lists.', error)
      window.alert(appLanguage === 'en' ? 'Could not save task lists. Browser storage may be full.' : 'تعذر حفظ قوائم المهام. قد تكون مساحة التخزين ممتلئة.')
    }
  }
  const handleWorkspaceFlowchartsChange = (nextWorkspaceFlowcharts) => {
    const nextFlowcharts = [
      ...flowcharts.filter((flowchart) => flowchart.workspaceId !== activeWorkspaceId),
      ...nextWorkspaceFlowcharts.map((flowchart) => ({ ...flowchart, workspaceId: activeWorkspaceId })),
    ]
    try {
      localStorage.setItem(FLOWCHARTS_STORAGE_KEY, JSON.stringify(nextFlowcharts))
      setFlowcharts(nextFlowcharts)
    } catch (error) {
      console.error('Could not save workspace flowcharts.', error)
      window.alert(appLanguage === 'en' ? 'Could not save flowcharts. Browser storage may be full.' : 'تعذر حفظ المخططات الانسيابية. قد تكون مساحة التخزين ممتلئة.')
    }
  }
  const handleWorkspaceUiDesignsChange = (nextWorkspaceDesigns) => {
    const nextDesigns = [
      ...uiDesigns.filter((design) => design.workspaceId !== activeWorkspaceId),
      ...nextWorkspaceDesigns.map((design) => ({ ...design, workspaceId: activeWorkspaceId })),
    ]
    setUiDesigns(nextDesigns)
    try {
      localStorage.setItem(UI_DESIGNS_STORAGE_KEY, JSON.stringify(nextDesigns))
    } catch (error) {
      console.error('Could not save workspace interface designs.', error)
      window.alert(appLanguage === 'en' ? 'Could not save interface designs. Browser storage may be full.' : 'تعذر حفظ تصميم الواجهات. قد تكون مساحة التخزين ممتلئة.')
    }
  }
  const closeNoteTab = (noteId) => {
    const nextOpenIds = openNoteIds.filter((id) => id !== noteId)
    saveOpenNoteIds(nextOpenIds)
    const currentNoteId = activeNoteId || openNoteIds.find((id) => workspaceNotes.some((note) => note.id === id)) || null
    if (activeTool !== 'notes' || currentNoteId !== noteId) return
    const nextNoteId = nextOpenIds.find((id) => workspaceNotes.some((note) => note.id === id)) || null
    if (nextNoteId) {
      setActiveNoteId(nextNoteId)
      return
    }
    runPageTransition(() => {
      setActiveNoteId(null)
      setActiveTool('mind-map')
      setWorkspaceOpen(!activeProjectId && Boolean(activeWorkspaceId))
      setLibraryOpen(!activeProjectId && !activeWorkspaceId)
    }, 'backward')
  }
  const openNoteFromList = (noteId) => {
    if (!openNoteIds.includes(noteId)) saveOpenNoteIds([...openNoteIds, noteId])
    setActiveNoteId(noteId)
  }
  const selectProjectTab = (project) => {
    setLibraryOpen(false)
    setActiveTool('mind-map')
    openProject(project)
  }
  const sharedProjectTabs = (
    <nav className="project-tabs" aria-label="المشاريع والملاحظات المفتوحة">
      <div className="project-tabs-list">
        {openProjectIds.filter((id) => workspaceProjects.some((item) => item.id === id)).map((id) => {
          const project = workspaceProjects.find((item) => item.id === id)
          if (!project) return null
          return <div className={`project-tab${activeTool === 'mind-map' && id === activeProjectId ? ' is-active' : ''}`} key={id}>
            <button className="project-tab-select" type="button" onClick={() => selectProjectTab(project)} title={project.title}>{project.title || 'مشروع بدون عنوان'}</button>
            <button className="project-tab-close" type="button" onClick={() => closeProjectTab(id)} aria-label={`إغلاق ${project.title}`}><X size={13} /></button>
          </div>
        })}
        {workspaceNotes.filter((note) => openNoteIds.includes(note.id)).map((note) => (
          <div className={`project-tab note-project-tab${activeTool === 'notes' && note.id === (activeNoteId || workspaceNotes.find((item) => openNoteIds.includes(item.id))?.id) ? ' is-active' : ''}`} key={note.id}>
            <button className="project-tab-select" type="button" onClick={() => selectNoteTab(note.id)} title={note.title || 'ملاحظة بدون عنوان'}>
              <StickyNote size={13} />
              {note.title || 'ملاحظة بدون عنوان'}
            </button>
            <button type="button" className="project-tab-close" aria-label={`${appLanguage === 'en' ? 'Close' : 'إغلاق'} ${note.title || 'ملاحظة بدون عنوان'}`} title={appLanguage === 'en' ? 'Close note tab' : 'إغلاق تبويب الملاحظة'} onClick={() => closeNoteTab(note.id)}><X size={13} /></button>
          </div>
        ))}
      </div>
      <div className="project-tabs-navigation">
        {activeWorkspace && <>
          {isWorkspaceDocumentOpen && <>
            <WorkspaceBackupButton onClick={saveOpenDocumentCopy} busy={exportingWorkspace} language={appLanguage} />
          </>}
          <button className="workspace-backup-button" type="button" onClick={() => exportWorkspaceArchive(activeWorkspace)} disabled={exportingWorkspace} title={appLanguage === 'en' ? 'Export the full project with all maps, notes, tasks, flowcharts, and interface designs' : 'تصدير المشروع كاملًا بكل الخرائط والملاحظات والمهام والمخططات والتصميمات'}>
            <ArrowDownToLine size={16} />
            <span>{appLanguage === 'en' ? 'Export full project' : 'تصدير المشروع كاملًا'}</span>
          </button>
          <DocumentImportButton onClick={() => documentImportRef.current?.click()} language={appLanguage} />
          <input ref={documentImportRef} type="file" accept="application/json,.json,.zip,application/zip" onChange={importOpenDocument} hidden />
          <button
            className="project-tabs-library"
            type="button"
            onClick={() => {
              if (activeTool === 'mind-map') shortcutActionsRef.current?.saveNow()
              runPageTransition(() => {
                setActiveTool('mind-map')
                setMindMapHomeOpen(false)
                setWorkspaceOpen(Boolean(activeWorkspaceId))
                setLibraryOpen(!activeWorkspaceId)
                setActiveProjectId(null)
              }, 'backward')
            }}
            title={activeWorkspace.title}
          ><Workflow size={15} /><span>{activeWorkspace.title}</span></button>
        </>}
        <button
          className="project-tabs-library project-tabs-home"
          type="button"
          onClick={() => {
            if (activeTool === 'mind-map') shortcutActionsRef.current?.saveNow()
            runPageTransition(() => {
              setActiveTool('mind-map')
              setActiveProjectId(null)
              setActiveNoteId(null)
              setActiveWorkspaceId(null)
              setMindMapHomeOpen(false)
              setWorkspaceOpen(false)
              setLibraryOpen(true)
            }, 'backward')
          }}
          title="العودة إلى الصفحة الرئيسية"
          aria-label="العودة إلى الصفحة الرئيسية"
        ><Home size={14} /><span>الرئيسية</span></button>
      </div>
    </nav>
  )
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
        <p className="settings-version">ورقة Â· الإصدار {pkg.version}</p>
      </section>
    </div>
  )
  const helpDialog = helpOpen && (
    <div className="confirm-overlay settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false) }}>
      <section className="confirm-dialog settings-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title" dir="rtl">
        <div className="settings-heading"><span className="confirm-icon settings-icon"><CircleHelp size={20} /></span><button type="button" className="settings-close" aria-label="إغلاق المساعدة" onClick={() => setHelpOpen(false)}><X size={17} /></button></div>
        <h2 id="help-dialog-title">دليل ورقة السريع</h2>
        <p>أهم أدوات الخريطة واختصارات لوحة المفاتيح.</p>
        <span className="help-section-label">أساسيات الخريطة</span>
        <ul className="help-list">
          <li><Lightbulb size={14} /> <span>أضف «فكرة جديدة» من اللوحة أو بالسحب إلى المساحة، ثم حددها وأضف فروعًا يمينًا ويسارًا.</span></li>
          <li><MousePointer2 size={14} /> <span>اربط عقدتين بالسحب من نقطة طرف العقدة إلى عقدة أخرى، أو بالضغط المطول على عقدة ثم الضغط على عقدة أخرى. كليك يمين على السهم يحذفه.</span></li>
          <li><StickyNote size={14} /> <span>اضغط أيقونة العقدة لفتح الملاحظة والإيموجي واللون، وتُحفظ مع العقدة تلقائيًا.</span></li>
          <li><Network size={14} /> <span>«ترتيب الخريطة» يرص العقد حسب تفرّعها، والنقطة على طرف العقدة تطوي فروعها أو تفتحها.</span></li>
          <li><Copy size={14} /> <span>زر «تحديد جماعي» في اللوحة يفعّل تحديد عدة عقد بالضغط أو بسحب مربع على المساحة (في الحاسوب أيضًا Ctrl + كليك يمين).</span></li>
        </ul>
        <span className="help-section-label">أساسيات اللمس</span>
        <ul className="help-list">
          <li><MapIcon size={14} /> <span>إصبع واحد يحرّك الخريطة، وإصبعان للتكبير والتصغير.</span></li>
          <li><Link2 size={14} /> <span>اضغط مطولًا على أي عقدة لبدء الربط، ثم اضغط على عقدة أخرى لإتمامه.</span></li>
          <li><MoveLeft size={14} /> <span>زر الرجوع في الهاتف يغلق الملاحظات والقوائم واحدًا واحدًا.</span></li>
        </ul>
        <span className="help-section-label">اختصارات لوحة المفاتيح</span>
        <div className="help-shortcuts">
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>S</kbd><span>حفظ المشروع</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>F</kbd><span>بحث في الخريطة</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>Z</kbd><span>تراجع</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>Y</kbd><span>إعادة</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>C</kbd><span>نسخ العقدة وفروعها</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>V</kbd><span>لصق العقدة</span></div>
          <div className="help-shortcut"><kbd>Ctrl</kbd><kbd>D</kbd><span>تكرار العقدة</span></div>
          <div className="help-shortcut"><kbd>Del</kbd><span>حذف المحدد</span></div>
          <div className="help-shortcut"><kbd>Esc</kbd><span>إغلاق القوائم والحوارات</span></div>
        </div>
        <p className="settings-version">ورقة Â· الإصدار {pkg.version}</p>
      </section>
    </div>
  )
  const visibleNodeIds = new Set(nodes.filter((node) => !node.hidden).map((node) => node.id))
  const visibleEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
  const selectedNode = nodes.find((node) => node.selected)
  const selectedNodes = nodes.filter((node) => node.selected)
  const linkSourceNode = selectedNodes.find((node) => node.id === linkSourceNodeId) || selectedNodes[0]
  const isLinkableTarget = (source, target) => Boolean(source && target)
    && source.id !== target.id
    && !edges.some((edge) => edge.target === target.id)
    && !edges.some((edge) => edge.source === source.id && edge.target === target.id)
    && !getDescendantIds(target.id, edges).has(source.id)
    && !isIdeaConnectedToIdeaBranch(source, target, nodes, edges)
  const linkableSelectedNodes = selectedNodes.filter((node) => isLinkableTarget(linkSourceNode, node))
  const selectedIncomingSides = selectedNode
    ? visibleEdges.filter((edge) => edge.target === selectedNode.id).map((edge) => edge.targetHandle?.endsWith('right') ? 'right' : 'left')
    : []
  const canBranchLeft = Boolean(selectedNode) && !selectedIncomingSides.includes('left')
  const canBranchRight = Boolean(selectedNode) && !selectedIncomingSides.includes('right')
  const canInsertBranchRight = Boolean(selectedNode) && (
    canBranchRight || visibleEdges.some((edge) => edge.target === selectedNode.id && edge.sourceHandle === 'source-left')
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
    setNodeNoteMentionPicker(null)
    setNotesOpen(false)
    setToolsOpen(true)
    window.setTimeout(() => setNotesMounted(false), 240)
  }

  const toggleNodeSelection = (id) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, selected: !node.selected } : node))
  }

  const enterLinkMode = (nodeId) => {
    setSelectMode(false)
    setLinkSourceNodeId(nodeId)
    navigator.vibrate?.(22)
  }
  const cancelLinkPress = () => {
    if (linkPressRef.current.timer) {
      window.clearTimeout(linkPressRef.current.timer)
      linkPressRef.current = { timer: null, start: null }
    }
  }
  const beginNodeTouch = (event, nodeId) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) { cancelLinkPress(); return }
    if (event.target instanceof Element && event.target.closest('.node-label-input, .branch-toggle-handle, .node-drag-handle')) { cancelLinkPress(); return }
    cancelLinkPress()
    linkPressRef.current = {
      timer: window.setTimeout(() => {
        linkPressRef.current = { timer: null, start: null }
        enterLinkMode(nodeId)
      }, 650),
      start: { x: event.clientX, y: event.clientY },
    }
  }
  const moveNodeTouch = (event) => {
    const press = linkPressRef.current
    if (!press.timer || !press.start) return
    if (Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y) > 12) cancelLinkPress()
  }

  const closeTopOverlay = () => {
    if (notesOpen) { closeNotes(); return true }
    if (activeMenu) { setActiveMenu(null); return true }
    if (searchOpen) { setSearchOpen(false); setSearchQuery(''); return true }
    if (helpOpen) { setHelpOpen(false); return true }
    if (settingsOpen) { setSettingsOpen(false); return true }
    if (renameProjectOpen) { setRenameProjectOpen(false); return true }
    if (pendingDeleteProject) { setPendingDeleteProject(null); return true }
    if (pendingDeleteWorkspace) { setPendingDeleteWorkspace(null); return true }
    if (pendingCloseProjectId) { setPendingCloseProjectId(null); return true }
    if (linkSourceNodeId) { setLinkSourceNodeId(null); return true }
    if (selectMode) { setSelectMode(false); return true }
    return false
  }
  useEffect(() => {
    backOverlayRef.current = closeTopOverlay
  })

  useEffect(() => {
    if (libraryOpen) return undefined
    window.history.pushState({ waraqaGuard: true }, '')
    const handlePop = () => {
      if (backOverlayRef.current?.()) window.history.pushState({ waraqaGuard: true }, '')
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [libraryOpen])

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

  const updateNodeLabel = (id, label, labelMentions) => {
    setNodes((current) => current.map((node) => (
      node.id === id ? { ...node, data: { ...node.data, label, ...(Array.isArray(labelMentions) ? { labelMentions } : {}) } } : node
    )))
  }

  const renderedNodes = nodes.map((node) => ({
    ...node,
    ...(node.data.kind === 'idea' ? {
      width: Math.max(190, node.width || 0),
      height: Math.max(76, node.height || 0),
    } : {}),
    draggable: node.data.kind === 'branch' || node.draggable !== false,
    dragHandle: node.selected ? '.node-drag-handle' : undefined,
    data: {
      ...node.data,
      language: appLanguage,
      workspaceProjects,
      workspaceTasks,
      workspaceNotes,
      workspaceFlowcharts,
      onOpenMention: (mention) => openMentionRef.current?.(mention),
      selectMode,
      isLinkSource: linkSourceNodeId === node.id,
        incomingSides: visibleEdges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.targetHandle?.endsWith('right') ? 'right' : 'left'),
      onSelect: () => selectNode(node.id),
      onToggleSelect: () => toggleNodeSelection(node.id),
      onLabelChange: (label, labelMentions) => updateNodeLabel(node.id, label, labelMentions),
      onCloseNotes: closeNotes,
      onToggleBranch: (side) => toggleBranch(node, side),
      onTouchStart: (event) => beginNodeTouch(event, node.id),
      onTouchMove: moveNodeTouch,
      onTouchEnd: cancelLinkPress,
      dropHint: branchDropHint?.nodeId === node.id ? branchDropHint.side : null,
    },
  }))
  const protectedStartId = startNodeIdOf(nodes, edges)
  const renderedEdges = edges.map((edge) => ({
    ...edge,
    zIndex: edge.id === hoveredEdgeId ? 10 : edge.zIndex,
    className: [
      edge.className,
      edge.id === tautEdgeId ? 'thread-taut' : '',
      edge.id === hoveredEdgeId ? 'thread-hovered' : '',
    ].filter(Boolean).join(' '),
    hidden: nodes.some((node) => node.id === edge.source && node.hidden)
      || nodes.some((node) => node.id === edge.target && node.hidden),
  }))
  const searchResults = searchQuery.trim()
    ? nodes.filter((node) => `${node.data.label} ${node.data.note || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 8)
    : []

  const onNodesChange = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(
      changes.filter((change) => (selectMode || change.type !== 'select')
        && !(change.type === 'remove' && change.id === protectedStartId)),
      current,
    )),
    [protectedStartId, selectMode],
  )
  const onEdgesChange = useCallback(
    (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  )

  const remember = () => {
    setUndoStack((current) => [...current, { nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }].slice(-50))
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
    animateNodeLayout(layoutMode === 'auto' ? arrangeWithDagre(nodes, edges) : arrangeMapForward(nodes, edges))
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

  const canStartConnectionFrom = (nodeId, handleId) => {
    const outgoingSide = handleId === 'source-left' ? 'left' : 'right'
    const incomingSides = visibleEdges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.targetHandle?.endsWith('right') ? 'right' : 'left')
    return !incomingSides.includes(outgoingSide)
  }
  const isValidConnection = (connection) => (
    canStartConnectionFrom(connection.source, connection.sourceHandle)
    && connection.source !== connection.target
    && !getDescendantIds(connection.target, edges).has(connection.source)
  )

  const onConnect = (connection) => {
    // In loose mode either visible dot can start or finish a drag. Keep the
    // drag origin as the edge source, and attach the target to the opposite side.
    const direction = connection.sourceHandle === 'source-left' ? 'left' : 'right'
    const normalizedConnection = {
      ...connection,
      sourceHandle: `source-${direction}`,
      targetHandle: direction === 'left' ? 'source-right' : 'source-left',
    }
    if (!isValidConnection(normalizedConnection)) return
    const sourceNode = nodes.find((node) => node.id === normalizedConnection.source)
    const targetNode = nodes.find((node) => node.id === normalizedConnection.target)
    if (isIdeaConnectedToIdeaBranch(sourceNode, targetNode, nodes, edges)) return
    setUndoStack((current) => [...current, { nodes, edges }].slice(-50))
    setRedoStack([])
    let nextEdges = addEdge({
      ...normalizedConnection,
      type: edgeStyle,
      markerEnd: getMarkerEnd(arrowHead, edgeColor),
      style: { stroke: edgeColor, strokeWidth: edgeWidth },
    }, edges)
    const preferredParentEdge = nextEdges.find((edge) => edge.source === normalizedConnection.source
      && edge.target === normalizedConnection.target
      && edge.sourceHandle === normalizedConnection.sourceHandle
      && edge.targetHandle === normalizedConnection.targetHandle)
    if (preferredParentEdge) {
      nextEdges = [preferredParentEdge, ...nextEdges.filter((edge) => edge.id !== preferredParentEdge.id)]
    }
    const nextNodes = nodes.map((node) => (
      (node.id === normalizedConnection.source || node.id === normalizedConnection.target) && node.data.detached
        ? { ...node, data: { ...node.data, detached: false } }
        : node
    ))
    setEdges(nextEdges)
    const connectedChild = nextNodes.find((node) => node.id === normalizedConnection.target)
    const connectedParent = nextNodes.find((node) => node.id === normalizedConnection.source)
    let orderedNodes = arrangeMapForward(nextNodes, nextEdges, true, preferredParentEdge?.id)
    if (connectedChild?.data.kind === 'branch') {
      const siblings = orderedNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === normalizedConnection.source && edge.target === node.id))
        .sort(compareBranchOrder)
      orderedNodes = arrangeSiblingBranches(orderedNodes, nextEdges, normalizedConnection.source, siblings.map((node) => node.id))
    }
    if (connectedChild && connectedParent) {
      const arrangedParent = orderedNodes.find((node) => node.id === connectedParent.id) || connectedParent
      const arrangedChild = orderedNodes.find((node) => node.id === connectedChild.id) || connectedChild
      const parentWidth = nodeWidthOf(arrangedParent)
      const childWidth = nodeWidthOf(arrangedChild)
      const parentHeight = nodeHeightOf(arrangedParent)
      const childHeight = nodeHeightOf(arrangedChild)
      const columnWidth = Math.max(childWidth, ...nextEdges
        .filter((edge) => edge.source === connectedParent.id && edge.sourceHandle === normalizedConnection.sourceHandle)
        .map((edge) => nodeWidthOf(orderedNodes.find((node) => node.id === edge.target) || connectedChild)))
      const desiredX = direction === 'left'
        ? arrangedParent.position.x - columnWidth - 150
        : arrangedParent.position.x + parentWidth + 150
      const delta = {
        x: desiredX - arrangedChild.position.x,
        y: arrangedParent.position.y + (parentHeight - childHeight) / 2 - arrangedChild.position.y,
      }
      const movedIds = new Set([connectedChild.id, ...getDescendantIds(connectedChild.id, nextEdges)])
      movedIds.delete(connectedParent.id)
      orderedNodes = orderedNodes.map((node) => movedIds.has(node.id)
        ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
        : node)
      animateNodeLayout(orderedNodes)
    } else setNodes(orderedNodes)
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
        const snapshot = { id: activeProjectId, title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead, updatedAt: currentTimestamp() }
        const next = current.some((project) => project.id === activeProjectId)
          ? current.map((project) => project.id === activeProjectId ? { ...project, ...snapshot } : project)
          : [snapshot, ...current]
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
        return next
      })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeProjectId, title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead])

  const saveNow = () => {
    const snapshot = normalizeProjectHandles({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead })
    setEdges(snapshot.edges)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    if (activeProjectId) {
      const projectState = createProjectSavePoint(snapshot)
      projectSavePoints.current.set(activeProjectId, projectState)
      const currentProject = { id: activeProjectId, ...projectState, updatedAt: currentTimestamp() }
      let storedProjects = projects
      try {
        const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || 'null')
        if (Array.isArray(parsed)) storedProjects = parsed
      } catch { /* Keep the in-memory project list if storage is unreadable. */ }
      const next = storedProjects.some((project) => project.id === activeProjectId)
        ? storedProjects.map((project) => project.id === activeProjectId ? { ...project, ...currentProject } : project)
        : [currentProject, ...storedProjects]
      setProjects(next)
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
    }
  }

  const goToProjectHome = () => {
    saveNow()
    setActiveMenu(null)
    runPageTransition(() => {
      setActiveProjectId(null)
      setActiveNoteId(null)
      setMindMapHomeOpen(false)
      if (activeWorkspaceId) {
        setWorkspaceOpen(true)
        setLibraryOpen(false)
      } else {
        setWorkspaceOpen(false)
        setLibraryOpen(true)
      }
    }, 'backward')
  }

  async function saveWorkspaceBackup() {
    if (!activeWorkspace) {
      window.alert('افتح مشروعًا أولًا لحفظ نسخة منه.')
      return
    }

    setExportingWorkspace(true)
    try {
      let allProjects = projects
      if (activeProjectId && activeTool === 'mind-map') {
        saveNow()
        const snapshot = normalizeProjectHandles({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead })
        const activeProject = {
          ...snapshot,
          id: activeProjectId,
          workspaceId: activeWorkspaceId,
          updatedAt: currentTimestamp(),
        }
        allProjects = projects.some((project) => project.id === activeProjectId)
          ? projects.map((project) => project.id === activeProjectId ? activeProject : project)
          : [activeProject, ...projects]
      }

      const bundle = {
        format: 'waraqa-workspace',
        formatVersion: 1,
        exportedAt: isoTimestamp(),
        workspace: activeWorkspace,
        mindMaps: allProjects.filter((project) => project.workspaceId === activeWorkspaceId),
        notes: workspaceNotes,
        tasks: workspaceTasks,
        taskLists: workspaceTaskLists,
        flowcharts: workspaceFlowcharts,
        uiDesigns: workspaceUiDesigns,
      }

      if (desktopWindow?.exportWorkspace) {
        const folder = await desktopWindow.exportWorkspace(bundle)
        window.alert(`تم حفظ نسخة المشروع كاملة في:\n${folder}`)
      } else {
        const json = JSON.stringify(bundle, null, 2)
        const fileName = `warqa-${(activeWorkspace.title || 'project').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'project'}.json`
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
          await AndroidDownloads.saveJson({ fileName, content: json })
          window.alert('تم حفظ ملف نسخة المشروع في مجلد التنزيلات.')
        } else {
          const file = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(file)
          const link = document.createElement('a')
          link.href = url
          link.download = fileName
          link.click()
          URL.revokeObjectURL(url)
          window.alert('تم تنزيل ملف نسخة المشروع. لحفظه تلقائيًا داخل مجلد warqa استخدم تطبيق سطح المكتب.')
        }
      }
    } catch (error) {
      console.error('Could not export workspace backup.', error)
      window.alert('تعذر حفظ نسخة المشروع. تحقق من مساحة التخزين وحاول مرة أخرى.')
    } finally {
      setExportingWorkspace(false)
    }
  }
  async function exportWorkspaceArchive(targetWorkspace) {
    if (!targetWorkspace) return
    const workspaceId = targetWorkspace.id
    setExportingWorkspace(true)
    try {
      let allProjects = projects
      if (workspaceId === activeWorkspaceId && activeProjectId && activeTool === 'mind-map') {
        saveNow()
        const snapshot = normalizeProjectHandles({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead })
        const activeProject = { ...snapshot, id: activeProjectId, workspaceId, updatedAt: currentTimestamp() }
        allProjects = projects.some((project) => project.id === activeProjectId)
          ? projects.map((project) => project.id === activeProjectId ? activeProject : project)
          : [activeProject, ...projects]
      }
      const bundle = {
        format: 'waraqa-workspace', formatVersion: 1, exportedAt: isoTimestamp(), workspace: targetWorkspace,
        textDirection: appLanguage === 'en' ? 'ltr' : 'rtl',
        mindMaps: allProjects.filter((project) => project.workspaceId === workspaceId),
        notes: standaloneNotes.filter((note) => note.workspaceId === workspaceId),
        tasks: tasks.filter((task) => task.workspaceId === workspaceId),
        taskLists: taskLists.filter((list) => list.workspaceId === workspaceId),
        flowcharts: flowcharts.filter((flowchart) => flowchart.workspaceId === workspaceId),
        uiDesigns: uiDesigns.filter((design) => design.workspaceId === workspaceId),
      }
      const attachmentIds = new Set()
      const findAttachmentIds = (value) => {
        if (!value || typeof value !== 'object') return
        if (typeof value.fileId === 'string') attachmentIds.add(value.fileId)
        Object.values(value).forEach(findAttachmentIds)
      }
      bundle.notes.forEach(findAttachmentIds)
      const attachments = (await Promise.all([...attachmentIds].map(async (id) => {
        try { return await readNoteAttachment(id) } catch (error) { console.warn('Could not read a project attachment.', error); return null }
      }))).filter(Boolean)
      const previews = await createDesignPreviews(bundle.uiDesigns, {}, appLanguage)
      const archive = await createWorkspaceArchive(bundle, attachments, previews)
      const safeName = String(targetWorkspace.title || 'project').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'project'
      const url = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeName}-waraqa-project.zip`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (error) {
      console.error('Could not export complete project archive.', error)
      window.alert(appLanguage === 'en' ? 'Could not create the project archive.' : 'تعذر إنشاء حزمة المشروع.')
    } finally {
      setExportingWorkspace(false)
    }
  }
  async function saveOpenDocumentCopy() {
    if (!isWorkspaceDocumentOpen) return
    setExportingWorkspace(true)
    try {
      let documentData
      let baseName
      if (activeTool === 'mind-map') {
        saveNow()
        documentData = {
          format: 'waraqa-mind-map',
          formatVersion: 1,
          title,
          nodes,
          edges,
          edgeStyle,
          edgeColor,
          edgeWidth,
          arrowHead,
        }
        baseName = title || 'mind-map'
      } else if (activeTool === 'notes') {
        const note = workspaceNotes.find((item) => item.id === activeNoteId)
          || workspaceNotes.find((item) => openNoteIds.includes(item.id))
        if (!note) throw new Error('No open note to export.')
        documentData = { format: 'waraqa-note', formatVersion: 1, note }
        baseName = note.title || 'note'
      } else if (activeTool === 'flowchart') {
        const flowchart = workspaceFlowcharts.find((item) => item.id === activeFlowchartId)
        if (!flowchart) throw new Error('No open flowchart to export.')
        documentData = { format: 'waraqa-flowchart', formatVersion: 1, flowchart }
        baseName = flowchart.title || 'flowchart'
      } else if (activeTool === 'ui-design') {
        const design = workspaceUiDesigns.find((item) => item.id === activeUiDesignId) || workspaceUiDesigns[0]
        if (!design) throw new Error('No open interface design to export.')
        documentData = { format: 'waraqa-ui-design', formatVersion: 1, design }
        baseName = design.title || 'interface-design'
      } else {
        const defaultListId = `${activeWorkspaceId}-default-task-list`
        const taskListData = [...workspaceTaskLists]
        if (workspaceTasks.some((task) => !task.listId) && !taskListData.some((list) => list.id === defaultListId)) {
          taskListData.push({ id: defaultListId, title: appLanguage === 'en' ? 'My tasks' : 'مهامي', workspaceId: activeWorkspaceId })
        }
        documentData = {
          format: 'waraqa-tasks',
          formatVersion: 1,
          taskLists: taskListData,
          tasks: workspaceTasks.map((task) => ({ ...task, listId: task.listId || defaultListId })),
        }
        baseName = activeWorkspace.title || 'tasks'
      }

      const safeName = String(baseName).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'waraqa-item'
      const content = JSON.stringify(documentData, null, 2)
      let fileName = `${safeName}.json`
      let fileBlob = new Blob([content], { type: 'application/json' })
      if (activeTool === 'notes') {
        const attachmentIds = new Set()
        const collectAttachmentIds = (value) => {
          if (!value || typeof value !== 'object') return
          if (typeof value.fileId === 'string') attachmentIds.add(value.fileId)
          Object.values(value).forEach(collectAttachmentIds)
        }
        collectAttachmentIds(documentData.note)
        const attachments = []
        const attachmentFiles = []
        for (const [index, attachmentId] of [...attachmentIds].entries()) {
          const attachment = await readNoteAttachment(attachmentId)
          if (!attachment?.blob) throw new Error(`Could not read note attachment ${attachmentId}.`)
          const attachmentName = String(attachment.name || `attachment-${index + 1}`).replace(/[\\/:*?"<>|]+/g, '-').trim() || `attachment-${index + 1}`
          const path = `assets/attachments/${String(index + 1).padStart(3, '0')}-${attachmentName}`
          attachmentFiles.push({ path, data: attachment.blob })
          attachments.push({ id: attachment.id, name: attachment.name || attachmentName, type: attachment.type || attachment.blob.type || 'application/octet-stream', path })
        }
        fileBlob = await createZipArchive([
          { path: 'item.json', data: content },
          { path: 'assets/manifest.json', data: JSON.stringify({ attachments }, null, 2) },
          ...attachmentFiles,
        ])
        fileName = `${safeName}-waraqa-note.zip`
      }
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && activeTool !== 'notes') {
        await AndroidDownloads.saveJson({ fileName, content })
        window.alert(appLanguage === 'en' ? 'The open item was saved to Downloads.' : 'تم حفظ نسخة العنصر المفتوح في مجلد التنزيلات.')
      } else {
        const url = URL.createObjectURL(fileBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (error) {
      console.error('Could not save the open item.', error)
      window.alert(appLanguage === 'en' ? 'Could not save a copy of the open item.' : 'تعذر حفظ نسخة من العنصر المفتوح.')
    } finally {
      setExportingWorkspace(false)
    }
  }
  async function importOpenDocument(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !activeWorkspace) return
    try {
      if (!(await ensureProjectsFolder())) return
      let imported
      let archiveEntries = null
      if (/\.zip$/i.test(file.name)) {
        archiveEntries = await readZipArchive(file)
        const itemBytes = archiveEntries.get('item.json')
          || [...archiveEntries.entries()].find(([path]) => path.endsWith('/item.json'))?.[1]
        if (!itemBytes) throw new Error('The archive has no item.json document.')
        imported = JSON.parse(decodeZipText(itemBytes))
      } else imported = JSON.parse(await file.text())
      const importedType = imported.format === 'waraqa-note'
        ? 'notes'
        : imported.format === 'waraqa-tasks'
          ? 'tasks'
          : imported.format === 'waraqa-flowchart'
            ? 'flowchart'
          : imported.format === 'waraqa-ui-design'
            ? 'ui-design'
          : (imported.format === 'waraqa-mind-map' || (!imported.format && Array.isArray(imported.nodes) && Array.isArray(imported.edges)))
            ? 'mind-map'
            : null
      if (!importedType || imported.format === 'waraqa-workspace') throw new Error('Unsupported item file.')
      if (isWorkspaceDocumentOpen && importedType !== activeTool) throw new Error('The imported file does not match the open item.')

      if (importedType === 'ui-design') {
        if (!imported.design || !Array.isArray(imported.design.screens) || imported.design.screens.some((screen) => !screen || typeof screen.title !== 'string' || !Array.isArray(screen.components))) throw new Error('Invalid interface design.')
        const currentDesign = isWorkspaceDocumentOpen ? workspaceUiDesigns.find((item) => item.id === activeUiDesignId) : null
        const design = { ...imported.design, id: currentDesign?.id || newProjectId(), workspaceId: activeWorkspaceId, title: imported.design.title || (appLanguage === 'en' ? 'Imported interface design' : 'تصميم واجهات مستورد'), updatedAt: currentTimestamp() }
        handleWorkspaceUiDesignsChange(currentDesign
          ? workspaceUiDesigns.map((item) => item.id === currentDesign.id ? design : item)
          : [design, ...workspaceUiDesigns])
        setActiveUiDesignId(design.id)
        setActiveTool('ui-design')
        setActiveProjectId(null)
        setActiveNoteId(null)
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      } else if (importedType === 'flowchart') {
        if (!imported.flowchart || !Array.isArray(imported.flowchart.nodes) || !Array.isArray(imported.flowchart.edges)) throw new Error('Invalid flowchart.')
        const existingFlowchart = isWorkspaceDocumentOpen
          ? workspaceFlowcharts.find((flowchart) => flowchart.id === activeFlowchartId)
          : null
        const flowchart = {
          ...imported.flowchart,
          id: existingFlowchart?.id || newProjectId(),
          workspaceId: activeWorkspaceId,
          title: imported.flowchart.title || (appLanguage === 'en' ? 'Imported flowchart' : 'مخطط انسيابي مستورد'),
          nodes: imported.flowchart.nodes,
          edges: imported.flowchart.edges,
          updatedAt: currentTimestamp(),
        }
        const nextFlowcharts = existingFlowchart
          ? workspaceFlowcharts.map((item) => item.id === flowchart.id ? flowchart : item)
          : [flowchart, ...workspaceFlowcharts]
        handleWorkspaceFlowchartsChange(nextFlowcharts)
        setActiveFlowchartId(flowchart.id)
        setActiveTool('flowchart')
        setActiveProjectId(null)
        setActiveNoteId(null)
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      } else if (importedType === 'mind-map') {
        if (!Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) throw new Error('Invalid mind map.')
        const importedMap = normalizeProjectHandles(imported)
        const mapTitle = imported.title || (appLanguage === 'en' ? 'Imported mind map' : 'خريطة ذهنية مستوردة')
        if (isWorkspaceDocumentOpen) {
          remember()
          setTitle(mapTitle)
          setNodes(imported.nodes)
          setEdges(importedMap.edges)
          setEdgeStyle(imported.edgeStyle || 'smoothstep')
          setEdgeColor(imported.edgeColor || '#9aaea4')
          setEdgeWidth(imported.edgeWidth || 2)
          setArrowHead(imported.arrowHead || 'closed')
        } else {
          const project = {
            id: newProjectId(), workspaceId: activeWorkspaceId, title: mapTitle,
            nodes: imported.nodes, edges: importedMap.edges,
            edgeStyle: imported.edgeStyle || 'smoothstep', edgeColor: imported.edgeColor || '#9aaea4',
            edgeWidth: imported.edgeWidth || 2, arrowHead: imported.arrowHead || 'closed', updatedAt: currentTimestamp(),
          }
          const nextProjects = [project, ...projects]
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects))
          setProjects(nextProjects)
          projectSavePoints.current.set(project.id, createProjectSavePoint(project))
          setTitle(project.title)
          setNodes(project.nodes)
          setEdges(project.edges)
          setEdgeStyle(project.edgeStyle)
          setEdgeColor(project.edgeColor)
          setEdgeWidth(project.edgeWidth)
          setArrowHead(project.arrowHead)
          setActiveProjectId(project.id)
          setOpenProjectIds((current) => current.includes(project.id) ? current : [...current, project.id])
          setActiveNoteId(null)
          setActiveTool('mind-map')
          setMindMapHomeOpen(false)
          setWorkspaceOpen(false)
          setLibraryOpen(false)
        }
      } else if (importedType === 'notes') {
        if (!imported.note || typeof imported.note.title !== 'string' || !Array.isArray(imported.note.pages)) throw new Error('Invalid note.')
        if (archiveEntries) {
          const manifestBytes = archiveEntries.get('assets/manifest.json')
          if (manifestBytes) {
            const assetManifest = JSON.parse(decodeZipText(manifestBytes))
            for (const attachment of assetManifest.attachments || []) {
              const bytes = archiveEntries.get(attachment.path)
              if (!bytes || typeof attachment.id !== 'string') continue
              const fileCopy = new File([bytes], attachment.name || 'attachment', { type: attachment.type || 'application/octet-stream' })
              await saveNoteAttachmentWithId(attachment.id, fileCopy)
            }
          }
        }
        const replacement = { ...imported.note, id: newProjectId(), workspaceId: activeWorkspaceId, updatedAt: currentTimestamp() }
        const nextNotes = [replacement, ...standaloneNotes]
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
        handleStandaloneNotesChange(nextNotes)
        saveOpenNoteIds([...openNoteIds, replacement.id])
        setActiveNoteId(replacement.id)
        setActiveTool('notes')
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      } else {
        if (!Array.isArray(imported.tasks) || !Array.isArray(imported.taskLists)) throw new Error('Invalid tasks document.')
        if (imported.tasks.some((task) => !task || typeof task.title !== 'string') || imported.taskLists.some((list) => !list || typeof list.title !== 'string' || typeof list.id !== 'string')) throw new Error('Invalid tasks document.')
        const idMap = new Map(imported.taskLists.map((list) => [list.id, newProjectId()]))
        const defaultListId = `${activeWorkspaceId}-default-task-list`
        const needsDefaultList = imported.tasks.some((task) => !idMap.has(task.listId))
        const nextImportedLists = imported.taskLists.map((list) => ({ ...list, id: idMap.get(list.id), workspaceId: activeWorkspaceId }))
        if (needsDefaultList) nextImportedLists.push({ id: defaultListId, title: appLanguage === 'en' ? 'My tasks' : 'مهامي', workspaceId: activeWorkspaceId })
        const nextImportedTasks = imported.tasks.map((task) => ({
          ...task,
          id: newProjectId(),
          workspaceId: activeWorkspaceId,
          listId: idMap.get(task.listId) || defaultListId,
          completed: Boolean(task.completed),
        }))
        const nextTasks = [...tasks.filter((task) => task.workspaceId !== activeWorkspaceId), ...nextImportedTasks]
        const nextTaskLists = [...taskLists.filter((list) => list.workspaceId !== activeWorkspaceId), ...nextImportedLists]
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks))
        localStorage.setItem(TASK_LISTS_STORAGE_KEY, JSON.stringify(nextTaskLists))
        setTasks(nextTasks)
        setTaskLists(nextTaskLists)
        setActiveNoteId(null)
        setActiveTool('tasks')
        setMindMapHomeOpen(false)
        setWorkspaceOpen(false)
        setLibraryOpen(false)
      }
    } catch (error) {
      console.error('Could not import a copy into the open item.', error)
      window.alert(appLanguage === 'en' ? 'This file is invalid or does not match the open item type.' : 'الملف غير صالح أو لا يطابق نوع العنصر المفتوح.')
    }
  }
  useEffect(() => {
    const saveOnPageExit = () => shortcutActionsRef.current?.saveNow()
    window.addEventListener('pagehide', saveOnPageExit)
    return () => window.removeEventListener('pagehide', saveOnPageExit)
  }, [])

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
      const incomingSides = visibleEdges.filter((edge) => edge.target === parent.id).map((edge) => edge.targetHandle?.endsWith('right') ? 'right' : 'left')
      if (incomingSides.includes(branchDirection)) return
    }
    remember()
    const id = createId()
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
        label: parent ? 'فكرة فرعية' : 'فكرتي الجديدة',
        kind,
        ...(kind === 'idea' && !nodes.some((item) => item.data.isStart) && !nodes.some((item) => item.data.kind === 'idea') ? { isStart: true } : {}),
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
        targetHandle: branchDirection === 'left' ? 'source-right' : 'source-left',
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
      const id = createId()
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
        targetHandle: direction === 'left' ? 'source-right' : 'source-left',
        type: edgeStyle,
        markerEnd: getMarkerEnd(arrowHead, edgeColor),
        style: { stroke: edgeColor, strokeWidth: edgeWidth },
      })
      const nextNodes = nodes.map((item) => ({ ...item, selected: false })).concat(node)
      setEdges(nextEdges)
      animateNodeLayout(arrangeMapForward(nextNodes, nextEdges, true), id)
      return
    }
    const incomingSides = visibleEdges.filter((edge) => edge.target === selectedNode.id).map((edge) => edge.targetHandle?.endsWith('right') ? 'right' : 'left')
    if (incomingSides.includes(branchDirection)) return

    remember()
    const id = createId()
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
      targetHandle: branchDirection === 'left' ? 'source-right' : 'source-left',
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

  const toggleBranch = (rootNode = selectedNode, side = null) => {
    if (!rootNode) return
    const childIds = side
      ? edges.filter((edge) => edge.source === rootNode.id && edge.sourceHandle === `source-${side}`).map((edge) => edge.target)
      : edges.filter((edge) => edge.source === rootNode.id).map((edge) => edge.target)
    const descendantIds = new Set(childIds.flatMap((id) => [id, ...getDescendantIds(id, edges)]))
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

  const handleNodeNoteInput = (event) => {
    const { value, selectionStart: caret } = event.currentTarget
    const mentions = (selectedNode?.data.mentions || []).filter((mention) => value.includes(mention.text))
    updateSelected({ note: value, mentions })
    if (nodeNoteMentionPicker?.nodeId === selectedNode?.id) {
      const query = value.slice(nodeNoteMentionPicker.queryStart, caret)
      if (caret < nodeNoteMentionPicker.queryStart || query.includes('\n')) setNodeNoteMentionPicker(null)
      else setNodeNoteMentionPicker({ ...nodeNoteMentionPicker, end: caret, query })
    } else if (value[caret - 1] === '@') {
      setNodeNoteMentionPicker({ nodeId: selectedNode?.id, start: caret - 1, queryStart: caret, end: caret, step: 'type', kind: null, containerId: null, query: '' })
    }
  }

  const setNodeMentionKind = (kind) => {
    if (!nodeNoteMentionPicker) return
    const note = selectedNode?.data.note || ''
    updateSelected({ note: `${note.slice(0, nodeNoteMentionPicker.start + 1)}${note.slice(nodeNoteMentionPicker.end)}` })
    const queryStart = nodeNoteMentionPicker.start + 1
    setNodeNoteMentionPicker({ ...nodeNoteMentionPicker, step: kind === 'task' || kind === 'note' ? 'item' : 'container', kind, containerId: null, queryStart, end: queryStart, query: '' })
    requestAnimationFrame(() => { nodeNoteInputRef.current?.focus(); nodeNoteInputRef.current?.setSelectionRange(queryStart, queryStart) })
  }

  const setNodeMentionContainer = (container) => {
    if (!nodeNoteMentionPicker) return
    const note = selectedNode?.data.note || ''
    updateSelected({ note: `${note.slice(0, nodeNoteMentionPicker.start + 1)}${note.slice(nodeNoteMentionPicker.end)}` })
    const queryStart = nodeNoteMentionPicker.start + 1
    setNodeNoteMentionPicker({ ...nodeNoteMentionPicker, step: 'item', containerId: container.id, queryStart, end: queryStart, query: '' })
    requestAnimationFrame(() => { nodeNoteInputRef.current?.focus(); nodeNoteInputRef.current?.setSelectionRange(queryStart, queryStart) })
  }

  const backNodeMentionPicker = () => {
    if (!nodeNoteMentionPicker || !selectedNode) return
    const previousStep = nodeNoteMentionPicker.step === 'item' && !['task', 'note'].includes(nodeNoteMentionPicker.kind) ? 'container' : 'type'
    const note = selectedNode.data.note || ''
    const nextNote = `${note.slice(0, nodeNoteMentionPicker.start + 1)}${note.slice(nodeNoteMentionPicker.end)}`
    updateSelected({ note: nextNote })
    const queryStart = nodeNoteMentionPicker.start + 1
    setNodeNoteMentionPicker({ ...nodeNoteMentionPicker, step: previousStep, kind: previousStep === 'type' ? null : nodeNoteMentionPicker.kind, containerId: previousStep === 'type' ? null : nodeNoteMentionPicker.containerId, queryStart, end: queryStart, query: '' })
    requestAnimationFrame(() => { nodeNoteInputRef.current?.focus(); nodeNoteInputRef.current?.setSelectionRange(queryStart, queryStart) })
  }

  const insertNodeNoteMention = (item) => {
    const picker = nodeNoteMentionPicker
    if (!picker || picker.nodeId !== selectedNode?.id) return
    const container = picker.kind === 'mind-map' ? workspaceProjects.find((project) => project.id === picker.containerId)
      : picker.kind === 'flowchart' ? workspaceFlowcharts.find((flowchart) => flowchart.id === picker.containerId) : null
    if (!['task', 'note'].includes(picker.kind) && !container) return
    const itemTitle = picker.kind === 'task' ? (item.title || 'مهمة بدون عنوان') : picker.kind === 'note' ? (item.title || 'ملاحظة بدون عنوان') : (item.data?.label || 'بدون عنوان')
    const containerTitle = container?.title || ''
    const prefix = picker.kind === 'mind-map' ? 'ðŸ§ ' : picker.kind === 'task' ? 'âœ“' : picker.kind === 'note' ? 'ðŸ“' : 'â†—'
    const mentionText = `@${prefix} ${containerTitle ? `${containerTitle} / ` : ''}${itemTitle}`
    const note = selectedNode.data.note || ''
    const nextNote = `${note.slice(0, picker.start)}${mentionText}${note.slice(picker.end)}`
    const mention = picker.kind === 'mind-map'
      ? { type: 'mind-map-node', projectId: container.id, nodeId: item.id, projectTitle: containerTitle, nodeTitle: itemTitle, text: mentionText }
      : picker.kind === 'task'
        ? { type: 'task', taskId: item.id, taskTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
        : picker.kind === 'note'
          ? { type: 'note', noteId: item.id, noteTitle: itemTitle, workspaceId: item.workspaceId, text: mentionText }
          : { type: 'flowchart-node', flowchartId: container.id, flowchartTitle: containerTitle, nodeId: item.id, nodeTitle: itemTitle, text: mentionText }
    updateSelected({ note: nextNote, mentions: [...(selectedNode.data.mentions || []), mention] })
    setNodeNoteMentionPicker(null)
    const caret = picker.start + mentionText.length
    requestAnimationFrame(() => { nodeNoteInputRef.current?.focus(); nodeNoteInputRef.current?.setSelectionRange(caret, caret) })
  }

  const removeNodeById = (nodeId) => {
    if (nodeId === startNodeIdOf(nodes, edges) || !nodes.some((node) => node.id === nodeId)) return
    remember()
    const parentEdge = edges.find((edge) => edge.target === nodeId)
    const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    const nextNodes = nodes.filter((node) => node.id !== nodeId)
    setEdges(nextEdges)
    if (parentEdge) {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((edge) => edge.source === parentEdge.source && edge.target === node.id))
        .sort(compareBranchOrder)
      animateNodeLayout(arrangeSiblingBranches(nextNodes, nextEdges, parentEdge.source, siblings.map((node) => node.id)))
    } else setNodes(nextNodes)
  }

  const removeSelected = () => {
    if (selectedNode) removeNodeById(selectedNode.id)
  }

  const removeSelectedNodes = () => {
    const protectedId = startNodeIdOf(nodes, edges)
    const removableNodes = selectedNodes.filter((node) => node.id !== protectedId)
    if (!removableNodes.length) return
    remember()
    const selectedIds = new Set(removableNodes.map((node) => node.id))
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
    const protectedId = startNodeIdOf(nodes, edges)
    const deletedIds = new Set(deletedNodes.filter((node) => node.id !== protectedId).map((node) => node.id))
    if (!deletedIds.size) return
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
        targetHandle: 'source-left',
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

  const connectToLinkSource = (target) => {
    const source = nodes.find((node) => node.id === linkSourceNodeId)
    if (!isLinkableTarget(source, target)) return false
    remember()
    const edge = {
      id: `e-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      sourceHandle: 'source-right',
      targetHandle: 'source-left',
      type: edgeStyle,
      markerEnd: getMarkerEnd(arrowHead, edgeColor),
      style: { stroke: edgeColor, strokeWidth: edgeWidth },
    }
    const nextEdges = [...edges, edge]
    const detachedIds = new Set([source.id, target.id].filter((id) => nodes.find((node) => node.id === id)?.data.detached))
    const nextNodes = nodes.map((node) => detachedIds.has(node.id) ? { ...node, data: { ...node.data, detached: false } } : node)
    setEdges(nextEdges)
    if (target.data.kind === 'branch') {
      const siblings = nextNodes
        .filter((node) => node.data.kind === 'branch' && nextEdges.some((item) => item.source === source.id && item.target === node.id))
        .sort(compareBranchOrder)
      animateNodeLayout(arrangeMapForward(arrangeSiblingBranches(nextNodes, nextEdges, source.id, siblings.map((node) => node.id)), nextEdges, true), target.id)
    } else setNodes(nextNodes)
    return true
  }

  const startMultiSelect = (event) => {
    const isClassicDrag = event.ctrlKey && event.button === 2
    const isSelectModeDrag = selectMode && event.button === 0 && !event.ctrlKey
    if (!isClassicDrag && !isSelectModeDrag) return
    if (isSelectModeDrag && event.target instanceof Element && event.target.closest('.react-flow__node')) return
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
    const id = createId()
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
    const idMap = new Map(copiedNode.nodes.map((node) => [node.id, createId()]))
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
    setRedoStack((current) => [...current, { nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }])
    setNodes(previous.nodes)
    setEdges(previous.edges)
    setEdgeStyle(previous.edgeStyle)
    setEdgeColor(previous.edgeColor)
    setEdgeWidth(previous.edgeWidth)
    setArrowHead(previous.arrowHead)
    setUndoStack((current) => current.slice(0, -1))
  }

  const redo = () => {
    const next = redoStack.at(-1)
    if (!next) return
    setUndoStack((current) => [...current, { nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }])
    setNodes(next.nodes)
    setEdges(next.edges)
    setEdgeStyle(next.edgeStyle)
    setEdgeColor(next.edgeColor)
    setEdgeWidth(next.edgeWidth)
    setArrowHead(next.arrowHead)
    setRedoStack((current) => current.slice(0, -1))
  }

  useEffect(() => {
    shortcutActionsRef.current = { openSearch, saveNow, undo, redo, arrangeAllNodes, duplicateSelected, copySelected, pasteCopiedNode }
  })

  useEffect(() => {
    const handleShortcut = (event) => {
      const key = (event.code?.startsWith('Key') ? event.code.slice(3) : event.key).toLowerCase()
      const target = event.target
      const isEditingText = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))

      if (event.key === 'Escape') {
        setActiveMenu(null)
        setSearchOpen(false)
        setHelpOpen(false)
        setSettingsOpen(false)
        setLinkSourceNodeId(null)
        setSelectMode(false)
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
      } else if (key === 'l' && event.shiftKey) {
        event.preventDefault()
        shortcutActionsRef.current?.arrangeAllNodes()
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

  const exportMap = async () => {
    const json = JSON.stringify({
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
    }, null, 2)
    const fileName = (title || 'mind-map').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mind-map'

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      try {
        await AndroidDownloads.saveJson({ fileName: `${fileName}.json`, content: json })
        window.alert('تم حفظ ملف JSON في مجلد التنزيلات.')
        return
      } catch (error) {
        console.error('Could not save JSON to Downloads:', error)
        window.alert('تعذر حفظ الملف في التنزيلات. حاول مرة أخرى.')
        return
      }
    }

    const file = new Blob([json], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
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
      setEdges(normalizeProjectHandles(imported).edges)
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
    cancelLinkPress()
    dragSnapshot.current = { nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }
    setTautEdgeId(null)
    setBranchDropHint(null)
    if (!draggedNode || draggedNode.data.detached) return
    const parentEdge = edges.find((edge) => edge.target === draggedNode.id)
    const siblings = parentEdge && nodes
      .filter((node) => node.data.kind === 'branch' && edges.some((edge) => edge.source === parentEdge.source && edge.target === node.id) && node.id !== draggedNode.id)
      .sort(compareBranchOrder)
    if (!siblings?.length) return
  }
  const onNodeDrag = (_event, draggedNode) => {
    if (!draggedNode || draggedNode.data.detached || !dragSnapshot.current) {
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
        return siblingEdge && isSameBranchSide(edge, siblingEdge) && node.id !== draggedNode.id
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

      if (!draggedNode) return
      const parentEdge = snapshot.edges.find((edge) => edge.target === draggedNode.id)
      setTautEdgeId(null)
      if (draggedNode.data.detached) return
      if (!parentEdge) {
        if (draggedNode.data.kind !== 'branch' || !draggedNode.data.insertedBranch) return
        const layoutBase = nodes.map((item) => item.id === draggedNode.id
          ? { ...item, position: snapshot.nodes.find((entry) => entry.id === item.id).position }
          : item)
        animateNodeLayout(arrangeMapForward(layoutBase, snapshot.edges, true), draggedNode.id)
        return
      }
      const siblings = snapshot.nodes
        .filter((item) => {
          const siblingEdge = snapshot.edges.find((edge) => edge.source === parentEdge.source && edge.target === item.id)
          return siblingEdge && isSameBranchSide(parentEdge, siblingEdge)
        })
        .sort((left, right) => left.position.y - right.position.y)

      const remaining = siblings.filter((item) => item.id !== draggedNode.id)
      const draggedHeight = draggedNode.measured?.height ?? draggedNode.height ?? 64
      const insertionIndex = remaining.findIndex((item) => {
        const height = item.measured?.height ?? item.height ?? 64
        return draggedNode.position.y + draggedHeight / 2 < item.position.y + height / 2
      })
      if (siblings.length < 2) {
        const original = snapshot.nodes.find((item) => item.id === draggedNode.id)
        if (!original) return
        const deltaX = draggedNode.position.x - original.position.x
        const deltaY = draggedNode.position.y - original.position.y
        const movedIds = getDescendantIds(draggedNode.id, snapshot.edges)
        setNodes(nodes.map((node) => movedIds.has(node.id)
          ? { ...node, position: { x: node.position.x + deltaX, y: node.position.y + deltaY } }
          : node))
        return
      }
      const layoutBase = nodes.map((item) => item.id === draggedNode.id
        ? { ...item, position: snapshot.nodes.find((entry) => entry.id === item.id).position }
        : item)
      const orderedSiblings = [...remaining]
      orderedSiblings.splice(insertionIndex < 0 ? orderedSiblings.length : insertionIndex, 0, siblings.find((item) => item.id === draggedNode.id))
      const orderedNodes = arrangeSiblingBranches(layoutBase, snapshot.edges, parentEdge.source, orderedSiblings.map((item) => item.id), draggedNode.id)
      animateNodeLayout(arrangeMapForward(orderedNodes, snapshot.edges, true), draggedNode.id)
    }
  }

  const openProject = (project) => {
    setActiveTool('mind-map')
    setMindMapHomeOpen(false)
    if (project.workspaceId) setActiveWorkspaceId(project.workspaceId)
    if (activeProjectId === project.id) {
      saveNow()
      projectSavePoints.current.set(project.id, createProjectSavePoint({ title, nodes, edges, edgeStyle, edgeColor, edgeWidth, arrowHead }))
      setLibraryOpen(false)
      setWorkspaceOpen(false)
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
      setWorkspaceOpen(false)
    }, activeProjectId ? 'lateral' : 'forward')
  }

  const openFlowchart = (flowchart) => runPageTransition(() => {
    if (activeTool === 'mind-map') shortcutActionsRef.current?.saveNow()
    setActiveWorkspaceId(flowchart.workspaceId)
    setActiveProjectId(null)
    setActiveNoteId(null)
    setActiveFlowchartId(flowchart.id)
    setActiveTool('flowchart')
    setMindMapHomeOpen(false)
    setWorkspaceOpen(false)
    setLibraryOpen(false)
  }, 'lateral')

  const openUiDesign = (design) => runPageTransition(() => {
    if (activeTool === 'mind-map') shortcutActionsRef.current?.saveNow()
    setActiveWorkspaceId(design.workspaceId)
    setActiveProjectId(null)
    setActiveNoteId(null)
    setActiveUiDesignId(design.id)
    setActiveTool('ui-design')
    setMindMapHomeOpen(false)
    setWorkspaceOpen(false)
    setLibraryOpen(false)
  }, 'lateral')

  const openMention = (mentionOrProjectId, legacyNodeId) => {
    const mention = typeof mentionOrProjectId === 'string'
      ? { type: 'mind-map-node', projectId: mentionOrProjectId, nodeId: legacyNodeId }
      : mentionOrProjectId
    if (mention?.type === 'task') {
      const task = tasks.find((item) => item.id === mention.taskId)
      if (!task) return
      setPendingTaskMentionFocus(task.id)
      setActiveWorkspaceId(task.workspaceId || activeWorkspaceId)
      setActiveProjectId(null)
      setActiveNoteId(null)
      setActiveTool('tasks')
      setMindMapHomeOpen(false)
      setWorkspaceOpen(false)
      setLibraryOpen(false)
      return
    }
    if (mention?.type === 'note') {
      const note = standaloneNotes.find((item) => item.id === mention.noteId)
      if (note) selectNoteTab(note.id)
      return
    }
    if (mention?.type === 'flowchart-node') {
      const flowchart = flowcharts.find((item) => item.id === mention.flowchartId)
      if (!flowchart) return
      setPendingFlowchartMentionFocus({ flowchartId: flowchart.id, nodeId: mention.nodeId })
      openFlowchart(flowchart)
      return
    }
    const projectId = mention?.projectId
    const nodeId = mention?.nodeId
    const project = projects.find((item) => item.id === projectId)
    if (!project) {
      console.warn('Could not open mention: the referenced project no longer exists.', { projectId, nodeId })
      return
    }
    setPendingMentionFocus({ projectId, nodeId, openNodeNote: mention?.type === 'mind-map-note' })
    openProject(project)
    setActiveTool('mind-map')
  }
  openMentionRef.current = openMention

  useEffect(() => {
    if (!pendingMentionFocus || activeProjectId !== pendingMentionFocus.projectId) return
    const node = nodes.find((item) => item.id === pendingMentionFocus.nodeId)
    if (!node) {
      const frame = window.requestAnimationFrame(() => {
        console.warn('Could not open mention: the referenced node no longer exists.', pendingMentionFocus)
        setPendingMentionFocus(null)
      })
      return () => window.cancelAnimationFrame(frame)
    }

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
    const targetNode = { ...node, hidden: false }
    const frame = window.requestAnimationFrame(() => {
      setNodes((current) => current.map((item) => ({
        ...item,
        hidden: revealIds.has(item.id) ? false : item.hidden,
        selected: item.id === node.id,
      })))
      window.requestAnimationFrame(() => {
        if (pendingMentionFocus.openNodeNote) openNotes(targetNode)
        else focusNode(targetNode)
      })
      setPendingMentionFocus(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeProjectId, edges, nodes, pendingMentionFocus])

  const createProject = async () => {
    if (!(await ensureProjectsFolder())) return
    let workspaceId = activeWorkspaceId
    if (!workspaceId) {
      const workspace = { id: newProjectId(), title: 'مشروع جديد', createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
      workspaceId = workspace.id
      saveWorkspaces([workspace, ...workspaces])
      setActiveWorkspaceId(workspaceId)
    }
    const project = { id: newProjectId(), workspaceId, title: 'خريطة جديدة', nodes: [], edges: [], edgeStyle: 'smoothstep', edgeColor: '#9aaea4', edgeWidth: 2, arrowHead: 'closed', updatedAt: currentTimestamp() }
    setProjects((current) => { const next = [project, ...current]; localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); return next })
    openProject(project)
    setRenameProjectDraft(project.title)
    setRenameProjectOpen(true)
  }
  const importProjectFile = async (event) => {
    const selectedFiles = [...(event.target.files || [])]
    const file = selectedFiles[0]
    if (!file) return
    try {
      if (!(await ensureProjectsFolder())) return
      let archiveEntries = null
      let imported
      if (selectedFiles.some((item) => item.webkitRelativePath)) {
        archiveEntries = new Map()
        for (const item of selectedFiles) {
          const relativePath = item.webkitRelativePath.split('/').slice(1).join('/')
          if (relativePath) archiveEntries.set(relativePath, new Uint8Array(await item.arrayBuffer()))
        }
        const projectBytes = archiveEntries.get('project.json')
          || [...archiveEntries.entries()].find(([entryPath]) => entryPath.endsWith('/project.json'))?.[1]
        const workspaceBytes = archiveEntries.get('workspace.json')
          || [...archiveEntries.entries()].find(([entryPath]) => entryPath.endsWith('/workspace.json'))?.[1]
        const manifestBytes = archiveEntries.get('assets/manifest.json')
          || [...archiveEntries.entries()].find(([entryPath]) => entryPath.endsWith('/assets/manifest.json'))?.[1]
        if (!projectBytes && !workspaceBytes) throw new Error('The selected folder has no project.json or workspace.json.')
        if (manifestBytes && !archiveEntries.has('assets/manifest.json')) {
          for (const [entryPath, bytes] of [...archiveEntries.entries()]) {
            const marker = entryPath.lastIndexOf('/assets/')
            if (marker >= 0) archiveEntries.set(entryPath.slice(marker + 1), bytes)
          }
        }
        imported = JSON.parse(decodeZipText(projectBytes || workspaceBytes))
      } else if (/\.zip$/i.test(file.name)) {
        archiveEntries = await readZipArchive(file)
        const projectBytes = archiveEntries.get('project.json')
          || [...archiveEntries.entries()].find(([path]) => path.endsWith('/project.json'))?.[1]
        const itemBytes = archiveEntries.get('item.json')
          || [...archiveEntries.entries()].find(([path]) => path.endsWith('/item.json'))?.[1]
        if (!projectBytes && !itemBytes) throw new Error('The archive has no project or item JSON document.')
        imported = JSON.parse(decodeZipText(projectBytes || itemBytes))
      } else imported = JSON.parse(await file.text())
      if (imported.format === 'waraqa-note' && imported.formatVersion === 1) {
        if (!(await ensureProjectsFolder())) return
        if (!imported.note || typeof imported.note.title !== 'string' || !Array.isArray(imported.note.pages)) throw new Error('Invalid note document.')
        if (archiveEntries) {
          const manifestBytes = archiveEntries.get('assets/manifest.json')
          if (manifestBytes) {
            const assetManifest = JSON.parse(decodeZipText(manifestBytes))
            for (const attachment of assetManifest.attachments || []) {
              const bytes = archiveEntries.get(attachment.path)
              if (!bytes || typeof attachment.id !== 'string') continue
              const fileCopy = new File([bytes], attachment.name || 'attachment', { type: attachment.type || 'application/octet-stream' })
              await saveNoteAttachmentWithId(attachment.id, fileCopy)
            }
          }
        }
        const workspaceId = newProjectId()
        const noteId = newProjectId()
        const note = { ...imported.note, id: noteId, workspaceId, updatedAt: currentTimestamp() }
        const title = note.title.trim() || file.name.replace(/(?:-waraqa-note)?\.(?:json|zip)$/i, '') || 'ملاحظة مستوردة'
        const workspace = { id: workspaceId, title, createdAt: currentTimestamp(), updatedAt: currentTimestamp() }
        const nextNotes = [note, ...standaloneNotes]
        saveWorkspaces([workspace, ...workspaces])
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
        setStandaloneNotes(nextNotes)
        setActiveWorkspaceId(workspaceId)
        setActiveProjectId(null)
        setActiveNoteId(noteId)
        saveOpenNoteIds([...openNoteIds, noteId])
        setActiveTool('notes')
        setWorkspaceOpen(true)
        setMindMapHomeOpen(false)
        setLibraryOpen(false)
        setPendingDeleteWorkspace(null)
        setOpenProjectIds([])
        event.target.value = ''
        return
      }
      if (imported.format === 'waraqa-workspace' && imported.formatVersion === 1) {
        if (!(await ensureProjectsFolder())) return
        if (!imported.workspace || !Array.isArray(imported.mindMaps) || !Array.isArray(imported.notes)
          || (imported.tasks !== undefined && !Array.isArray(imported.tasks))
          || (imported.flowcharts !== undefined && !Array.isArray(imported.flowcharts))
          || (imported.uiDesigns !== undefined && !Array.isArray(imported.uiDesigns))
          || (imported.flowcharts || []).some((flowchart) => !flowchart || typeof flowchart.title !== 'string' || !Array.isArray(flowchart.nodes) || !Array.isArray(flowchart.edges))
          || (imported.uiDesigns || []).some((design) => !design || typeof design.title !== 'string' || !Array.isArray(design.screens) || design.screens.some((screen) => !screen || !Array.isArray(screen.components)))
          || imported.mindMaps.some((project) => !project || typeof project.id !== 'string' || !Array.isArray(project.nodes) || !Array.isArray(project.edges))
          || imported.notes.some((note) => !note || typeof note.id !== 'string' || typeof note.title !== 'string')) {
          throw new Error('Invalid workspace backup')
        }
        if (archiveEntries) {
          const manifestBytes = archiveEntries.get('assets/manifest.json')
          if (manifestBytes) {
            const assetManifest = JSON.parse(decodeZipText(manifestBytes))
            for (const attachment of assetManifest.attachments || []) {
              const bytes = archiveEntries.get(attachment.path)
              if (!bytes || typeof attachment.id !== 'string') continue
              const fileCopy = new File([bytes], attachment.name || 'attachment', { type: attachment.type || 'application/octet-stream' })
              await saveNoteAttachmentWithId(attachment.id, fileCopy)
            }
          }
        }
        const workspaceId = newProjectId()
        const workspace = {
          id: workspaceId,
          title: imported.workspace.title || file.name.replace(/\.json$/i, ''),
          createdAt: currentTimestamp(),
          updatedAt: currentTimestamp(),
        }
        const projectIds = new Map(imported.mindMaps.map((project) => [project.id, newProjectId()]))
        const projectNodeIds = new Map(imported.mindMaps.flatMap((project) => (project.nodes || []).map((node) => [node.id, newProjectId()])))
        const importedTaskIds = new Map((imported.tasks || []).map((task) => [task.id, newProjectId()]))
        const importedNoteIds = new Map(imported.notes.map((note) => [note.id, newProjectId()]))
        const importedFlowchartIds = new Map((imported.flowcharts || []).map((flowchart) => [flowchart.id, newProjectId()]))
        const flowchartNodeIds = new Map((imported.flowcharts || []).flatMap((flowchart) => (flowchart.nodes || []).map((node) => [node.id, newProjectId()])))
        const importedUiDesignIds = new Map((imported.uiDesigns || []).map((design) => [design.id, newProjectId()]))
        const uiScreenIds = new Map((imported.uiDesigns || []).flatMap((design) => (design.screens || []).map((screen) => [screen.id, newProjectId()])))
        const uiElementIds = new Map((imported.uiDesigns || []).flatMap((design) => (design.screens || []).flatMap((screen) => [
          ...(screen.components || []),
          ...Object.values(screen.viewportLayouts || {}).flat(),
        ].map((component) => [component.id, newProjectId()]))))
        const remapWorkspaceMention = (mention) => ({
          ...mention,
          ...(mention.type === 'task' ? { taskId: importedTaskIds.get(mention.taskId) || mention.taskId } : {}),
          ...(mention.type === 'note' ? { noteId: importedNoteIds.get(mention.noteId) || mention.noteId } : {}),
          ...(mention.type === 'flowchart-node' ? {
            flowchartId: importedFlowchartIds.get(mention.flowchartId) || mention.flowchartId,
            nodeId: flowchartNodeIds.get(mention.nodeId) || mention.nodeId,
          } : {}),
          ...(mention.type === 'mind-map-node' || mention.type === 'mind-map-note' || !mention.type ? {
            projectId: projectIds.get(mention.projectId) || mention.projectId,
            nodeId: projectNodeIds.get(mention.nodeId) || mention.nodeId,
          } : {}),
        })
        const importedProjects = imported.mindMaps.map((project) => normalizeProjectHandles({
          ...project,
          id: projectIds.get(project.id),
          workspaceId,
          nodes: project.nodes.map((node) => ({
            ...node,
            id: projectNodeIds.get(node.id),
            data: {
              ...node.data,
              ...(Array.isArray(node.data?.mentions) ? { mentions: node.data.mentions.map(remapWorkspaceMention) } : {}),
              ...(Array.isArray(node.data?.labelMentions) ? { labelMentions: node.data.labelMentions.map(remapWorkspaceMention) } : {}),
            },
          })),
          edges: project.edges.map((edge) => ({
            ...edge,
            source: projectNodeIds.get(edge.source) || edge.source,
            target: projectNodeIds.get(edge.target) || edge.target,
          })),
        }))
        const importedNotes = imported.notes.map((note) => ({
          ...note,
          id: importedNoteIds.get(note.id),
          workspaceId,
          pageTextBlocks: Array.isArray(note.pageTextBlocks)
            ? note.pageTextBlocks.map((page) => Array.isArray(page)
              ? page.map((block) => ({
                ...block,
                mentions: Array.isArray(block.mentions)
                  ? block.mentions.map((mention) => ({
                    ...remapWorkspaceMention(mention),
                  }))
                  : block.mentions,
              }))
              : page)
            : note.pageTextBlocks,
        }))
        const importedTaskLists = (imported.taskLists || []).map((list) => ({ ...list, id: newProjectId(), workspaceId }))
        const importedTaskListIds = new Map((imported.taskLists || []).map((list, index) => [list.id, importedTaskLists[index].id]))
        const importedTasks = (imported.tasks || []).map((task) => ({
          ...task,
          id: importedTaskIds.get(task.id),
          workspaceId,
          listId: importedTaskListIds.get(task.listId) || undefined,
          completed: Boolean(task.completed),
          ...(Array.isArray(task.mentions) ? { mentions: task.mentions.map(remapWorkspaceMention) } : {}),
        }))
        const importedFlowcharts = (imported.flowcharts || []).map((flowchart) => ({
          ...flowchart,
          id: importedFlowchartIds.get(flowchart.id),
          workspaceId,
          nodes: flowchart.nodes.map((node) => ({
            ...node,
            id: flowchartNodeIds.get(node.id),
            data: {
              ...node.data,
              ...(Array.isArray(node.data?.mentions) ? { mentions: node.data.mentions.map(remapWorkspaceMention) } : {}),
              ...(Array.isArray(node.data?.labelMentions) ? { labelMentions: node.data.labelMentions.map(remapWorkspaceMention) } : {}),
            },
          })),
          edges: flowchart.edges.map((edge) => ({
            ...edge,
            source: flowchartNodeIds.get(edge.source) || edge.source,
            target: flowchartNodeIds.get(edge.target) || edge.target,
          })),
        }))
        const importedUiDesigns = (imported.uiDesigns || []).map((design) => ({
          ...design,
          id: importedUiDesignIds.get(design.id),
          workspaceId,
          activeScreenId: uiScreenIds.get(design.activeScreenId) || uiScreenIds.get(design.screens[0]?.id),
          screens: design.screens.map((screen) => ({
            ...screen,
            id: uiScreenIds.get(screen.id),
            components: screen.components.map((component) => ({
              ...component,
              id: uiElementIds.get(component.id),
              targetScreenId: uiScreenIds.get(component.targetScreenId) || null,
            })),
            viewportLayouts: Object.fromEntries(Object.entries(screen.viewportLayouts || {}).map(([viewportId, components]) => [viewportId, components.map((component) => ({
              ...component,
              id: uiElementIds.get(component.id) || newProjectId(),
              targetScreenId: uiScreenIds.get(component.targetScreenId) || null,
            }))])),
          })),
        }))
        const nextProjects = [...importedProjects, ...projects]
        const nextNotes = [...importedNotes, ...standaloneNotes]
        const nextTasks = [...importedTasks, ...tasks]
        const nextTaskLists = [...importedTaskLists, ...taskLists]
        const nextFlowcharts = [...importedFlowcharts, ...flowcharts]
        const nextUiDesigns = [...importedUiDesigns, ...uiDesigns]
        saveWorkspaces([workspace, ...workspaces])
        setProjects(nextProjects)
        setStandaloneNotes(nextNotes)
        setTasks(nextTasks)
        setTaskLists(nextTaskLists)
        setFlowcharts(nextFlowcharts)
        setUiDesigns(nextUiDesigns)
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects))
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks))
        localStorage.setItem(TASK_LISTS_STORAGE_KEY, JSON.stringify(nextTaskLists))
        localStorage.setItem(FLOWCHARTS_STORAGE_KEY, JSON.stringify(nextFlowcharts))
        localStorage.setItem(UI_DESIGNS_STORAGE_KEY, JSON.stringify(nextUiDesigns))
        setActiveWorkspaceId(workspaceId)
        setActiveProjectId(null)
        setActiveNoteId(null)
        setWorkspaceOpen(true)
        setLibraryOpen(false)
        setActiveTool('mind-map')
        setPendingDeleteWorkspace(null)
        setOpenProjectIds([])
        window.alert('تم استيراد المشروع بكل خرائطه وملاحظاته.')
        event.target.value = ''
        return
      }
      if (!Array.isArray(imported.nodes) || !Array.isArray(imported.edges)) throw new Error('Invalid project')
      delete imported._metadata
      let workspaceId = activeWorkspaceId
      if (!workspaceId) {
        const workspace = {
          id: newProjectId(),
          title: imported.title || file.name.replace(/\.json$/i, ''),
          createdAt: currentTimestamp(),
          updatedAt: currentTimestamp(),
        }
        workspaceId = workspace.id
        saveWorkspaces([workspace, ...workspaces])
        setActiveWorkspaceId(workspaceId)
      }
      const project = normalizeProjectHandles({ ...imported, id: newProjectId(), workspaceId, title: imported.title || file.name.replace(/\.json$/i, ''), updatedAt: currentTimestamp() })
      setProjects((current) => { const next = [project, ...current]; localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); return next })
      openProject(project)
    } catch (error) {
      console.error('Could not import a project or standalone note.', error)
      window.alert(appLanguage === 'en' ? 'This file is not a supported Waraqa project or note.' : 'هذا الملف ليس مشروعًا أو ملاحظة مدعومة من ورقة.')
    }
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
  const confirmDeleteWorkspace = () => {
    if (!pendingDeleteWorkspace) return
    const workspaceId = pendingDeleteWorkspace.id
    desktopWindow?.removeWorkspaceFolder?.(workspaceId).catch((error) => console.error('Could not remove the saved project folder.', error))
    const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== workspaceId)
    const nextProjects = projects.filter((project) => project.workspaceId !== workspaceId)
    const nextNotes = standaloneNotes.filter((note) => note.workspaceId !== workspaceId)
    const nextTasks = tasks.filter((task) => task.workspaceId !== workspaceId)
    const nextTaskLists = taskLists.filter((list) => list.workspaceId !== workspaceId)
    const nextFlowcharts = flowcharts.filter((flowchart) => flowchart.workspaceId !== workspaceId)
    const nextUiDesigns = uiDesigns.filter((design) => design.workspaceId !== workspaceId)
    saveWorkspaces(nextWorkspaces)
    setProjects(nextProjects)
    setStandaloneNotes(nextNotes)
    setTasks(nextTasks)
    setTaskLists(nextTaskLists)
    setFlowcharts(nextFlowcharts)
    setUiDesigns(nextUiDesigns)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(nextProjects))
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(nextNotes))
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks))
    localStorage.setItem(TASK_LISTS_STORAGE_KEY, JSON.stringify(nextTaskLists))
    localStorage.setItem(FLOWCHARTS_STORAGE_KEY, JSON.stringify(nextFlowcharts))
    localStorage.setItem(UI_DESIGNS_STORAGE_KEY, JSON.stringify(nextUiDesigns))
    setOpenProjectIds((current) => current.filter((id) => !projects.some((project) => project.workspaceId === workspaceId && project.id === id)))
    setOpenNoteIds((current) => {
      const deletedNoteIds = new Set(standaloneNotes.filter((note) => note.workspaceId === workspaceId).map((note) => note.id))
      const next = current.filter((id) => !deletedNoteIds.has(id))
      localStorage.setItem(OPEN_NOTES_STORAGE_KEY, JSON.stringify(next))
      return next
    })
    if (activeWorkspaceId === workspaceId) {
      setActiveWorkspaceId(null)
      setActiveProjectId(null)
      setActiveNoteId(null)
      setWorkspaceOpen(false)
      setMindMapHomeOpen(false)
      setLibraryOpen(true)
    }
    setPendingDeleteWorkspace(null)
  }
  const finishCloseProjectTab = (id, projectList = projects) => {
    const remaining = openProjectIds.filter((projectId) => projectId !== id)
    setOpenProjectIds(remaining)
    projectSavePoints.current.delete(id)
    if (id === activeProjectId) {
      const nextProject = projectList.find((project) => remaining.includes(project.id) && project.workspaceId === activeWorkspaceId)
      if (nextProject) openProject(nextProject)
      else runPageTransition(() => {
        setActiveProjectId(null)
        setWorkspaceOpen(Boolean(activeWorkspaceId))
        setLibraryOpen(!activeWorkspaceId)
        setMindMapHomeOpen(Boolean(activeWorkspaceId))
      }, 'backward')
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

  if (workspaceOpen) return (
    <LocalizedContent language={appLanguage}>
    <main className={`library-shell workspace-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar library-topbar" aria-label="شريط النافذة">
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        {desktopWindow && <div className="window-controls" aria-label="أزرار النافذة">
          <button type="button" className="window-control" title="تصغير" aria-label="تصغير النافذة" onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? 'استعادة' : 'تكبير'} aria-label={desktopMaximized ? 'استعادة النافذة' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}>
            {desktopMaximized ? <Copy size={12} /> : <Square size={13} />}
          </button>
          <button type="button" className="window-control window-control-close" title="إغلاق" aria-label="إغلاق النافذة" onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      {mindMapHomeOpen ? (<>
        {sharedProjectTabs}
        <section className="mind-map-home">
          <aside className={`mind-map-home-sidebar${mapListCollapsed ? ' is-collapsed' : ''}`} aria-label={appLanguage === 'en' ? 'Mind maps in this workspace' : 'خرائط مساحة العمل'}>
            <div className="mind-map-home-heading">
              <button type="button" className="mind-map-list-toggle" aria-label={mapListCollapsed ? (appLanguage === 'en' ? 'Show mind maps' : 'إظهار قائمة الخرائط') : (appLanguage === 'en' ? 'Collapse mind maps' : 'طي قائمة الخرائط')} title={mapListCollapsed ? (appLanguage === 'en' ? 'Show mind maps' : 'إظهار قائمة الخرائط') : (appLanguage === 'en' ? 'Collapse mind maps' : 'طي قائمة الخرائط')} aria-expanded={!mapListCollapsed} onClick={() => setMapListCollapsed((collapsed) => {
                const next = !collapsed
                localStorage.setItem('waraqa-map-list-collapsed', String(next))
                return next
              })}>{mapListCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}</button>
              {!mapListCollapsed && <>
                <button type="button" className="workspace-back" onClick={() => setMindMapHomeOpen(false)} title={appLanguage === 'en' ? 'Back to workspace' : 'العودة لمساحة العمل'}><ArrowRight size={16} /></button>
                <strong><Workflow size={16} />{appLanguage === 'en' ? 'Mind maps' : 'الخرائط الذهنية'}</strong>
                <button type="button" className="mind-map-list-add" aria-label={appLanguage === 'en' ? 'Create mind map' : 'إنشاء خريطة ذهنية'} title={appLanguage === 'en' ? 'Create mind map' : 'إنشاء خريطة ذهنية'} onClick={createProject}><Plus size={16} /></button>
              </>}
            </div>
            {!mapListCollapsed && <div className="mind-map-home-items">
              {workspaceProjects.map((project) => <div className="mind-map-list-row" key={project.id}>
                <button type="button" className="mind-map-list-item" title={project.title || (appLanguage === 'en' ? 'Untitled mind map' : 'خريطة بدون عنوان')} onClick={() => openProject(project)}>
                  <Workflow size={15} /><span>{project.title || (appLanguage === 'en' ? 'Untitled mind map' : 'خريطة بدون عنوان')}</span>
                </button>
                <button type="button" className="mind-map-item-delete" aria-label={`${appLanguage === 'en' ? 'Delete mind map' : 'حذف الخريطة الذهنية'} ${project.title || ''}`} title={appLanguage === 'en' ? 'Delete mind map' : 'حذف الخريطة الذهنية'} onClick={() => requestDeleteProject(project.id)}><Trash2 size={14} /></button>
              </div>)}
              {!workspaceProjects.length && <span className="mind-map-list-empty">{appLanguage === 'en' ? 'No mind maps yet.' : 'لا توجد خرائط ذهنية بعد.'}</span>}
            </div>}
          </aside>
          <section className="mind-map-home-main">
            <span className="mind-map-home-icon"><Workflow size={30} /></span>
            <h1>{appLanguage === 'en' ? 'Start a mind map' : 'ابدأ خريطتك الذهنية'}</h1>
            <p>{workspaceProjects.length
              ? (appLanguage === 'en' ? 'Choose a mind map from the sidebar, or create a new one.' : 'اختر خريطة من الشريط الجانبي أو أنشئ خريطة جديدة.')
              : (appLanguage === 'en' ? 'Create your first mind map in this workspace.' : 'أنشئ أول خريطة ذهنية في مساحة العمل هذه.')}</p>
            <button type="button" className="library-button primary" onClick={createProject}><Plus size={17} />{appLanguage === 'en' ? 'Create mind map' : 'إنشاء خريطة ذهنية'}</button>
          </section>
        </section>
      </>) : <>
      <header className="library-header workspace-header">
        <div className="library-brand"><button type="button" className="workspace-back" onClick={() => runPageTransition(() => { setWorkspaceOpen(false); setActiveWorkspaceId(null); setActiveProjectId(null); setActiveNoteId(null); setLibraryOpen(true) }, 'backward')}><ArrowRight size={17} /> كل المشاريع</button><span className="brand-mark"><Workflow size={20} /></span><strong>ورقة</strong></div>
        <div className="library-actions">
          <DocumentImportButton onClick={() => documentImportRef.current?.click()} language={appLanguage} />
          <input ref={documentImportRef} type="file" accept="application/json,.json" onChange={importOpenDocument} hidden />
          <button className="library-button secondary" type="button" onClick={createWorkspaceNote}><StickyNote size={16} /> ملاحظة جديدة</button>
          <button className="library-button secondary" type="button" onClick={() => selectTool('ui-design')}><LayoutTemplate size={16} /> تصميم واجهات</button>
          <button className="library-button primary" type="button" onClick={createProject}><Plus size={18} /> خريطة جديدة</button>
        </div>
      </header>
      <section className="library-content workspace-content">
        <span className="library-kicker">مساحة المشروع</span>
        <input className="workspace-title-input" aria-label="اسم المشروع" value={activeWorkspace?.title || ''} onChange={(event) => renameWorkspace(activeWorkspaceId, event.target.value)} />
        <p className="library-subtitle">خرائطك الذهنية وملاحظاتك في مكان واحد.</p>
        <div className="workspace-document-grid">
          {workspaceProjects.map((project) => (
            <article className="workspace-document-card" key={project.id}>
              <button type="button" className="workspace-document-open" onClick={() => openProject(project)}>
                <span className="project-art"><Workflow size={25} /></span>
                <strong>{project.title || 'خريطة بدون عنوان'}</strong>
                <small>{project.nodes?.length || 0} عقدة Â· {project.edges?.length || 0} رابط</small>
              </button>
              <button type="button" className="project-delete" aria-label={`حذف ${project.title || 'الخريطة'}`} onClick={() => requestDeleteProject(project.id)}><Trash2 size={15} /></button>
            </article>
          ))}
          {workspaceNotes.map((note) => (
            <article className="workspace-document-card" key={note.id}>
              <button type="button" className="workspace-document-open" onClick={() => selectNoteTab(note.id)}>
                <span className="project-art"><StickyNote size={25} /></span>
                <strong>{note.title || 'ملاحظة بدون عنوان'}</strong>
                <small>{note.pages?.length || 1} صفحة</small>
              </button>
            </article>
          ))}
          {workspaceFlowcharts.map((flowchart) => (
            <article className="workspace-document-card" key={flowchart.id}>
              <button type="button" className="workspace-document-open" onClick={() => openFlowchart(flowchart)}>
                <span className="project-art"><GitBranch size={25} /></span>
                <strong>{flowchart.title || (appLanguage === 'en' ? 'Untitled flowchart' : 'مخطط انسيابي بدون عنوان')}</strong>
                <small>{flowchart.nodes.length} {appLanguage === 'en' ? 'shapes' : 'شكل'}</small>
              </button>
            </article>
          ))}
          {workspaceUiDesigns.map((design) => (
            <article className="workspace-document-card" key={design.id}>
              <button type="button" className="workspace-document-open" onClick={() => openUiDesign(design)}>
                <span className="project-art"><LayoutTemplate size={25} /></span>
                <strong>{design.title || (appLanguage === 'en' ? 'Untitled UI design' : 'تصميم واجهات بدون عنوان')}</strong>
                <small>{design.screens.length} {appLanguage === 'en' ? 'screens' : 'شاشة'}</small>
              </button>
            </article>
          ))}
          {workspaceTasks.length > 0 && <article className="workspace-document-card">
            <button type="button" className="workspace-document-open" onClick={() => selectTool('tasks')}>
              <span className="project-art"><ListTodo size={25} /></span>
              <strong>{appLanguage === 'en' ? 'Tasks' : 'المهام'}</strong>
              <small>{workspaceTasks.filter((task) => !task.completed).length} {appLanguage === 'en' ? 'remaining' : 'متبقية'}</small>
            </button>
          </article>}
          {!workspaceProjects.length && !workspaceNotes.length && !workspaceTasks.length && !workspaceFlowcharts.length && !workspaceUiDesigns.length && (
            <div className="workspace-empty">
              <span className="empty-bulb"><Lightbulb size={26} /></span>
              <h2>ابدأ مساحة مشروعك</h2>
              <p>أضف خريطة ذهنية أو ملاحظة جديدة لهذا المشروع.</p>
            </div>
          )}
        </div>
      </section>
      </>}
      {pendingDeleteProject && <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDeleteProject(null) }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-map-title" dir="rtl">
          <span className="confirm-icon"><Trash2 size={21} /></span>
          <h2 id="delete-map-title">حذف الخريطة؟</h2>
          <p>هل تريد حذف <strong>{pendingDeleteProject.title || 'خريطة بدون عنوان'}</strong> نهائيًا؟</p>
          <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={() => setPendingDeleteProject(null)}>إلغاء</button><button type="button" className="confirm-delete" onClick={confirmDeleteProject}>حذف الخريطة</button></div>
        </section>
      </div>}
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )

  if (activeTool === 'ui-design') return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell ui-design-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar flowchart-topbar" aria-label={appLanguage === 'en' ? 'Window bar' : 'شريط النافذة'}>
        <div className="brand-lockup topbar-brand" aria-label="ورقة"><span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span></div>
        <DocumentImportButton onClick={() => documentImportRef.current?.click()} language={appLanguage} />
        <input ref={documentImportRef} type="file" accept="application/json,.json" onChange={importOpenDocument} hidden />
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        {desktopWindow && <div className="window-controls" aria-label={appLanguage === 'en' ? 'Window controls' : 'أزرار النافذة'}>
          <button type="button" className="window-control" title={appLanguage === 'en' ? 'Minimize' : 'تصغير'} aria-label={appLanguage === 'en' ? 'Minimize window' : 'تصغير النافذة'} onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? (appLanguage === 'en' ? 'Restore' : 'استعادة') : (appLanguage === 'en' ? 'Maximize' : 'تكبير')} aria-label={desktopMaximized ? (appLanguage === 'en' ? 'Restore window' : 'استعادة النافذة') : (appLanguage === 'en' ? 'Maximize window' : 'تكبير النافذة')} onClick={() => desktopWindow.toggleMaximize()}>{desktopMaximized ? <Copy size={12} /> : <Square size={13} />}</button>
          <button type="button" className="window-control window-control-close" title={appLanguage === 'en' ? 'Close' : 'إغلاق'} aria-label={appLanguage === 'en' ? 'Close window' : 'إغلاق النافذة'} onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      {sharedProjectTabs}
      <UiDesignerWorkspace language={appLanguage} workspaceId={activeWorkspaceId} designs={workspaceUiDesigns} selectedDesignId={activeUiDesignId} onSelectedDesignChange={setActiveUiDesignId} onDesignsChange={handleWorkspaceUiDesignsChange} />
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )

  if (activeTool === 'flowchart') return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell flowchart-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar flowchart-topbar" aria-label={appLanguage === 'en' ? 'Window bar' : 'شريط النافذة'}>
        <div className="brand-lockup topbar-brand" aria-label="ورقة"><span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span></div>
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        {desktopWindow && <div className="window-controls" aria-label={appLanguage === 'en' ? 'Window controls' : 'أزرار النافذة'}>
          <button type="button" className="window-control" title={appLanguage === 'en' ? 'Minimize' : 'تصغير'} aria-label={appLanguage === 'en' ? 'Minimize window' : 'تصغير النافذة'} onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={appLanguage === 'en' ? 'Maximize' : 'تكبير'} aria-label={appLanguage === 'en' ? 'Maximize window' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}><Square size={13} /></button>
          <button type="button" className="window-control window-control-close" title={appLanguage === 'en' ? 'Close' : 'إغلاق'} aria-label={appLanguage === 'en' ? 'Close window' : 'إغلاق النافذة'} onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      {sharedProjectTabs}
      <FlowchartWorkspace
        language={appLanguage}
        workspaceId={activeWorkspaceId}
        flowcharts={workspaceFlowcharts}
        activeFlowchartId={activeFlowchartId}
        focusNodeId={pendingFlowchartMentionFocus?.flowchartId === activeFlowchartId ? pendingFlowchartMentionFocus.nodeId : null}
        onFocusNodeHandled={clearPendingFlowchartMentionFocus}
        onActiveFlowchartChange={setActiveFlowchartId}
        onFlowchartsChange={handleWorkspaceFlowchartsChange}
        projects={workspaceProjects}
        tasks={workspaceTasks}
        notes={workspaceNotes}
        onOpenMention={openMention}
      />
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )

  if (activeTool === 'notes') return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell notes-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar notes-topbar" aria-label="شريط النافذة">
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        {desktopWindow && <div className="window-controls" aria-label="أزرار النافذة">
          <button type="button" className="window-control" title="تصغير" aria-label="تصغير النافذة" onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? 'استعادة' : 'تكبير'} aria-label={desktopMaximized ? 'استعادة النافذة' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}>
            {desktopMaximized ? <Copy size={12} /> : <Square size={13} />}
          </button>
          <button type="button" className="window-control window-control-close" title="إغلاق" aria-label="إغلاق النافذة" onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      {sharedProjectTabs}
      <NotesWorkspace
        language={appLanguage}
        notes={standaloneNotes}
        onNotesChange={handleStandaloneNotesChange}
        workspaceId={activeWorkspaceId}
        workspaceTitle={activeWorkspace?.title}
        selectedNoteId={activeNoteId || workspaceNotes.find((note) => openNoteIds.includes(note.id))?.id || null}
        onSelectNote={openNoteFromList}
        projects={workspaceProjects}
        tasks={workspaceTasks}
        flowcharts={workspaceFlowcharts}
        noteDocuments={workspaceNotes}
        onOpenMention={openMention}
      />
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )

  if (activeTool === 'tasks') return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell tasks-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar tasks-topbar" aria-label={appLanguage === 'en' ? 'Window bar' : 'شريط النافذة'}>
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        {desktopWindow && <div className="window-controls" aria-label={appLanguage === 'en' ? 'Window controls' : 'أزرار النافذة'}>
          <button type="button" className="window-control" title={appLanguage === 'en' ? 'Minimize' : 'تصغير'} aria-label={appLanguage === 'en' ? 'Minimize window' : 'تصغير النافذة'} onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? (appLanguage === 'en' ? 'Restore' : 'استعادة') : (appLanguage === 'en' ? 'Maximize' : 'تكبير')} aria-label={desktopMaximized ? (appLanguage === 'en' ? 'Restore window' : 'استعادة النافذة') : (appLanguage === 'en' ? 'Maximize window' : 'تكبير النافذة')} onClick={() => desktopWindow.toggleMaximize()}>{desktopMaximized ? <Copy size={12} /> : <Square size={13} />}</button>
          <button type="button" className="window-control window-control-close" title={appLanguage === 'en' ? 'Close' : 'إغلاق'} aria-label={appLanguage === 'en' ? 'Close window' : 'إغلاق النافذة'} onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>}
      </header>
      {sharedProjectTabs}
      <TasksWorkspace language={appLanguage} tasks={workspaceTasks} taskLists={workspaceTaskLists} workspaceId={activeWorkspaceId} focusTaskId={pendingTaskMentionFocus} onFocusTaskHandled={clearPendingTaskMentionFocus} projects={workspaceProjects} notes={workspaceNotes} flowcharts={workspaceFlowcharts} onOpenMention={openMention} onTasksChange={handleWorkspaceTasksChange} onTaskListsChange={handleWorkspaceTaskListsChange} />
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )

  if (libraryOpen) return (
    <LocalizedContent language={appLanguage}>
    <main className={`library-shell library-home-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      {desktopWindow && <header className="topbar library-window-bar" aria-label="أزرار النافذة">
        <div className="window-controls" aria-label="أزرار النافذة">
          <button type="button" className="window-control" title="تصغير" aria-label="تصغير النافذة" onClick={() => desktopWindow.minimize()}><Minus size={15} /></button>
          <button type="button" className="window-control" title={desktopMaximized ? 'استعادة' : 'تكبير'} aria-label={desktopMaximized ? 'استعادة النافذة' : 'تكبير النافذة'} onClick={() => desktopWindow.toggleMaximize()}>
            {desktopMaximized ? <Copy size={12} /> : <Square size={13} />}
          </button>
          <button type="button" className="window-control window-control-close" title="إغلاق" aria-label="إغلاق النافذة" onClick={() => desktopWindow.close()}><X size={16} /></button>
        </div>
      </header>}
      <header className="library-header"><div className="library-brand"><span className="brand-mark"><Workflow size={20} /></span><strong>ورقة</strong><span>مساحة مشاريعك</span></div><div className="library-actions"><button type="button" className="library-button secondary" onClick={() => projectFolderImportRef.current?.click()}><ArrowUpFromLine size={17} /> استيراد مجلد</button><input ref={projectFolderImportRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={importProjectFile} /><button className="library-button primary" onClick={createWorkspace}><Plus size={18} /> مشروع جديد</button></div></header>
      <section className="library-content"><span className="library-kicker">مساحة العمل</span><h1>مشاريعك</h1><p className="library-subtitle">كل مشروع يضم خرائطك الذهنية وملاحظاتك.</p>
         {workspaces.length ? <div className="project-grid">{workspaces.map((workspace) => {
           const mapCount = projects.filter((project) => project.workspaceId === workspace.id).length
           const noteCount = standaloneNotes.filter((note) => note.workspaceId === workspace.id).length
           const taskCount = tasks.filter((task) => task.workspaceId === workspace.id).length
           return <article className="project-card" key={workspace.id}><button className="project-open" onClick={() => openWorkspace(workspace)}><span className="project-art"><Workflow size={28} /></span><strong>{workspace.title || 'مشروع بدون عنوان'}</strong><small>{mapCount} خريطة ذهنية Â· {noteCount} ملاحظة Â· {taskCount} مهمة</small><small>آخر تعديل: {workspace.updatedAt ? new Date(workspace.updatedAt).toLocaleDateString(appLanguage === 'en' ? 'en-GB' : 'ar-EG') : 'â€”'}</small></button><button className="project-export" title={appLanguage === 'en' ? 'Export AI-ready project' : 'تصدير حزمة المشروع'} disabled={exportingWorkspace} onClick={(event) => { event.stopPropagation(); exportWorkspaceArchive(workspace) }}><ArrowDownToLine size={15} /></button><button className="project-delete" aria-label="حذف المشروع" onClick={() => setPendingDeleteWorkspace(workspace)}><Trash2 size={16} /></button></article>
         })}</div> : <div className="library-empty"><span className="empty-bulb"><Lightbulb size={28} /></span><h2>ابدأ أول مشروع لك</h2><p>أنشئ مشروعًا يجمع خرائطك الذهنية وملاحظاتك.</p><button className="library-button primary" onClick={createWorkspace}><Plus size={18} /> إنشاء مشروع</button></div>}
      </section>
      {pendingDeleteWorkspace && <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDeleteWorkspace(null) }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-workspace-title" aria-describedby="delete-workspace-description" dir="rtl">
          <span className="confirm-icon"><Trash2 size={21} /></span>
          <h2 id="delete-workspace-title">حذف المشروع؟</h2>
          <p id="delete-workspace-description">سيتم حذف <strong>{pendingDeleteWorkspace.title || 'مشروع بدون عنوان'}</strong> وكل الخرائط والملاحظات الموجودة بداخله نهائيًا.</p>
          <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={() => setPendingDeleteWorkspace(null)}>إلغاء</button><button type="button" className="confirm-delete" onClick={confirmDeleteWorkspace}>حذف المشروع</button></div>
        </section>
      </div>}
    </main>
    </LocalizedContent>
  )

  return (
    <LocalizedContent language={appLanguage}>
    <main className={`app-shell${theme === 'dark' ? ' theme-dark' : ''}`} dir="rtl">
      <ToolSidebar activeTool={workspaceOpen && !mindMapHomeOpen ? null : activeTool} onSelect={selectTool} onHome={goToProjectHome} homeActive={workspaceOpen && !mindMapHomeOpen} language={appLanguage} />
      <header className="topbar">
        <div className="brand-lockup topbar-brand" aria-label="ورقة">
          <span className="brand-mark"><Workflow size={15} strokeWidth={2.2} /></span>
        </div>
        <SettingsButton onClick={() => setSettingsOpen(true)} language={appLanguage} />
        <ToolSwitcher activeTool={activeTool} onSelect={selectTool} language={appLanguage} />
        <button
          type="button"
          className="tools-toggle-button"
          aria-label={toolsOpen ? (appLanguage === 'en' ? 'Hide map tools' : 'إخفاء أدوات الخريطة') : (appLanguage === 'en' ? 'Show map tools' : 'إظهار أدوات الخريطة')}
          title={toolsOpen ? (appLanguage === 'en' ? 'Hide map tools' : 'إخفاء أدوات الخريطة') : (appLanguage === 'en' ? 'Show map tools' : 'إظهار أدوات الخريطة')}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
        >{toolsOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>
        <nav className="app-menubar" aria-label="قائمة التطبيق" role="menubar">
          <div className="app-menu-item">
            <button className={`app-menu-trigger${activeMenu === 'file' ? ' is-active' : ''}`} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={activeMenu === 'file'} onClick={() => setActiveMenu((menu) => menu === 'file' ? null : 'file')}>ملف</button>
            {activeMenu === 'file' && <div className="app-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { saveNow(); setActiveMenu(null) }}><Save size={15} /><span>حفظ المشروع</span><kbd>Ctrl+S</kbd></button>
              <button type="button" role="menuitem" onClick={() => { setActiveMenu(null); createProject() }}><Plus size={15} /><span>مشروع جديد</span></button>
              <button type="button" role="menuitem" onClick={() => { saveNow(); setActiveMenu(null); runPageTransition(() => { setActiveProjectId(null); setActiveWorkspaceId(null); setActiveNoteId(null); setWorkspaceOpen(false); setLibraryOpen(true) }, 'backward') }}><Workflow size={15} /><span>كل المشاريع</span></button>
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
              <button type="button" role="menuitem" onClick={() => { arrangeAllNodes(); setActiveMenu(null) }} disabled={nodes.length < 2}><Network size={15} /><span>ترتيب الخريطة</span><kbd>Ctrl+Shift+L</kbd></button>
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

            </div>}
          </div>
        </nav>

        <div className="mobile-history-controls" role="group" aria-label="التراجع والإعادة">
          <button type="button" className="mobile-history-button" title="تراجع" aria-label="تراجع" onClick={undo} disabled={!undoStack.length}><Undo2 size={17} /></button>
          <button type="button" className="mobile-history-button" title="إعادة" aria-label="إعادة" onClick={redo} disabled={!redoStack.length}><Redo2 size={17} /></button>
        </div>

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

      {sharedProjectTabs}

      <section className="workspace">
        <aside className={`mind-map-list-panel${mapListCollapsed ? ' is-collapsed' : ''}`} aria-label={appLanguage === 'en' ? 'Mind maps' : 'الخرائط الذهنية'}>
          <div className="mind-map-list-heading">
            <button
              type="button"
              className="mind-map-list-toggle"
              aria-label={mapListCollapsed ? (appLanguage === 'en' ? 'Show mind maps' : 'إظهار الخرائط') : (appLanguage === 'en' ? 'Hide mind maps' : 'طي قائمة الخرائط')}
              title={mapListCollapsed ? (appLanguage === 'en' ? 'Show mind maps' : 'إظهار الخرائط') : (appLanguage === 'en' ? 'Hide mind maps' : 'طي قائمة الخرائط')}
              aria-expanded={!mapListCollapsed}
              onClick={() => setMapListCollapsed((collapsed) => {
                const next = !collapsed
                localStorage.setItem('waraqa-map-list-collapsed', String(next))
                return next
              })}
            >{mapListCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}</button>
            {!mapListCollapsed && <>
              <strong><Workflow size={16} />{appLanguage === 'en' ? 'Mind maps' : 'الخرائط الذهنية'}</strong>
              <button type="button" className="mind-map-list-add" aria-label={appLanguage === 'en' ? 'Create mind map' : 'إنشاء خريطة ذهنية'} title={appLanguage === 'en' ? 'Create mind map' : 'إنشاء خريطة ذهنية'} onClick={createProject}><Plus size={16} /></button>
            </>}
          </div>
          {!mapListCollapsed && <div className="mind-map-list-items">
            {(activeWorkspaceId ? workspaceProjects : projects).map((project) => <div className="mind-map-list-row" key={project.id}>
              <button
                type="button"
                className={`mind-map-list-item${project.id === activeProjectId ? ' is-active' : ''}`}
                aria-current={project.id === activeProjectId ? 'page' : undefined}
                title={project.title || (appLanguage === 'en' ? 'Untitled mind map' : 'خريطة بدون عنوان')}
                onClick={() => openProject(project)}
              >
                <Workflow size={15} />
                <span>{project.title || (appLanguage === 'en' ? 'Untitled mind map' : 'خريطة بدون عنوان')}</span>
              </button>
              <button type="button" className="mind-map-item-delete" aria-label={`${appLanguage === 'en' ? 'Delete mind map' : 'حذف الخريطة الذهنية'} ${project.title || ''}`} title={appLanguage === 'en' ? 'Delete mind map' : 'حذف الخريطة الذهنية'} onClick={() => requestDeleteProject(project.id)}><Trash2 size={14} /></button>
            </div>)}
            {!(activeWorkspaceId ? workspaceProjects : projects).length && <span className="mind-map-list-empty">{appLanguage === 'en' ? 'Create a mind map to get started.' : 'أنشئ خريطة ذهنية للبدء.'}</span>}
          </div>}
        </aside>
        <aside className={`tool-panel${toolsOpen ? ' is-open' : ' is-collapsed'}`} aria-label="لوحة الأدوات">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">مساحة العمل</span>
              <h1>الأدوات</h1>
            </div>
            <button className="help-button" type="button" title="مساعدة" aria-label="مساعدة" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button>
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
              <button type="button" className={`tool-tile select-mode-tile${selectMode ? ' is-active' : ''}`} aria-pressed={selectMode} title="تحديد عدة عقد بالضغط أو بسحب مربع على المساحة" onClick={() => {
                setSelectMode((active) => !active)
                setLinkSourceNodeId(null)
              }}><MousePointer2 size={18} /><span>{selectMode ? 'إنهاء التحديد' : 'تحديد جماعي'}</span></button>
            </div>
          </div>

          <div className="tool-section layout-section">
            <h2>تنظيم الخريطة</h2>
            <div className="layout-modes" role="group" aria-label="نمط الترتيب">
              <button type="button" className={layoutMode === 'tree' ? 'is-active' : ''} onClick={() => changeLayoutMode('tree')}><Spline size={14} /> شجرة</button>
              <button type="button" className={layoutMode === 'auto' ? 'is-active' : ''} onClick={() => changeLayoutMode('auto')}><Network size={14} /> تلقائي</button>
            </div>
            <button className="layout-button" type="button" onClick={arrangeAllNodes} disabled={nodes.length < 2}>
              <Network size={17} />
              <span>{String.fromCharCode(0x62a,0x631,0x62a,0x64a,0x628,0x20,0x627,0x644,0x62e,0x631,0x64a,0x637,0x629,0x20,0x644,0x644,0x623,0x645,0x627,0x645)}</span>
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
            <span className="footer-separator">Â·</span>
            <span>{edges.length} رابط</span>
            <button type="button" className="footer-clear" title="مسح التحديد" aria-label="مسح التحديد" onClick={() => setNodes((current) => current.map((node) => ({ ...node, selected: false })))}><Minus size={15} /></button>
          </div>
        </aside>
        <button
          type="button"
          className="tool-panel-edge-toggle"
          style={{ right: `calc(${mapListCollapsed ? 42 : 220}px + ${toolsOpen ? 260 : 0}px - 16px)` }}
          aria-label={toolsOpen ? 'طي شريط الأدوات' : 'إظهار شريط الأدوات'}
          title={toolsOpen ? 'طي شريط الأدوات' : 'إظهار شريط الأدوات'}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
        >{toolsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>

        <div
          className={`canvas-wrap${selectionDrag ? ' is-selecting' : ''}${selectMode ? ' is-select-mode' : ''}`}
          dir="ltr"
          ref={canvasRef}
          onPointerDownCapture={startMultiSelect}
          onPointerMove={moveMultiSelect}
          onPointerUpCapture={finishMultiSelect}
          onPointerCancel={finishMultiSelect}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={handleCanvasDrop}
          onContextMenu={(event) => event.preventDefault()}
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
          {linkSourceNodeId && (
            <div className="link-mode-bar" dir="rtl">
              <span className="link-mode-text"><Link2 size={14} /> اختر عقدة أخرى للربط</span>
              <button type="button" className="link-mode-cancel" title="إلغاء الربط" aria-label="إلغاء الربط" onClick={() => setLinkSourceNodeId(null)}><X size={14} /></button>
            </div>
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
            onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
            onEdgeMouseLeave={() => setHoveredEdgeId(null)}
            onEdgeContextMenu={removeEdgeFromContextMenu}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            isValidConnection={isValidConnection}
            onInit={(instance) => { flowRef.current = instance }}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={(event, node) => {
              event.preventDefault()
              event.stopPropagation()
              removeNodeById(node.id)
            }}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={1.8}
            nodesConnectable={!selectMode}
            nodesDraggable={!selectMode}
            panOnDrag={!selectMode}
            zoomOnPinch
            zoomOnDoubleClick={false}
            onNodeClick={(event, node) => {
              if (selectMode) {
                toggleNodeSelection(node.id)
                return
              }
              selectNode(node.id)
              if (linkSourceNodeId && node.id !== linkSourceNodeId) {
                if (connectToLinkSource(node)) setLinkSourceNodeId(null)
                closeNotes()
                return
              }
              if (linkSourceNodeId) return
              if ((event.ctrlKey || event.metaKey) && !linkSourceNodeId) setLinkSourceNodeId(node.id)
              if (event.target.closest?.('.node-icon')) openNotes(node)
              else closeNotes()
            }}
            onPaneClick={() => {
              if (selectMode) return
              setLinkSourceNodeId(null)
              setNodes((current) => current.map((node) => node.selected ? { ...node, selected: false } : node))
              if (notesOpen) closeNotes()
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ type: edgeStyle }}
          >
            <Background color="#d9e1dc" gap={22} size={1.4} />
            <Controls position="bottom-left" showInteractive={false} />
            {miniMapVisible && <MiniMap position="top-right" nodeColor={(node) => getToneColor(node.data?.tone, node.data?.customColor)} maskColor="rgba(245, 248, 246, 0.78)" />}
          </ReactFlow>
          {!nodes.length && (
            <div className="empty-state" dir="rtl">
              <div className="empty-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="empty-bulb"><Lightbulb size={25} /></span><span className="spark spark-a">âœ³</span><span className="spark spark-b">âœ¦</span></div>
              <span className="empty-kicker">كل فكرة تبدأ من هنا</span>
              <h2>مساحة أفكارك مفتوحة</h2>
              <p>أضف فكرتك الأولى، ثم دع الأفكار تتفرع وتتصل ببعضها.</p>
              <button type="button" className="empty-add-button" onClick={() => addNode('idea')}><Plus size={17} /> أضف أول فكرة</button>
            </div>
          )}
          <div className="canvas-caption"><span className="canvas-live-dot" /> مساحة الرسم <span>Â·</span> {selectMode ? 'اضغط العقد لتحديدها أو اسحب مربعًا' : 'اسحب العقد لترتيبها'}</div>
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
              ref={nodeNoteInputRef}
              className="node-note-input"
              aria-label="ملاحظة العقدة المحددة"
              placeholder="اكتب ملاحظتك هنا..."
              value={selectedNode.data.note || ''}
              onChange={handleNodeNoteInput}
              onKeyDown={(event) => { if (event.key === 'Escape') setNodeNoteMentionPicker(null) }}
            />
            {nodeNoteMentionPicker?.nodeId === selectedNode.id && <div className="node-note-mention-picker" role="listbox">
              <div className="notes-mention-heading">
                <strong>{nodeNoteMentionPicker.step === 'type' ? 'اختر نوع العنصر' : nodeNoteMentionPicker.step === 'container' ? (nodeNoteMentionPicker.kind === 'mind-map' ? 'اختر الخريطة' : 'اختر المخطط') : (nodeNoteMentionPicker.kind === 'mind-map' ? 'اختر العقدة' : nodeNoteMentionPicker.kind === 'task' ? 'اختر المهمة' : nodeNoteMentionPicker.kind === 'note' ? 'اختر الملاحظة' : 'اختر الشكل')}</strong>
                {nodeNoteMentionPicker.step !== 'type' && <button type="button" onClick={backNodeMentionPicker}>رجوع</button>}
              </div>
              <div className="notes-mention-options">
                {(nodeNoteMentionPicker.step === 'type'
                  ? [
                    { id: 'mind-map', title: 'خريطة ذهنية', count: workspaceProjects.length },
                    { id: 'task', title: 'مهمة', count: workspaceTasks.length },
                    { id: 'note', title: 'ملاحظة', count: workspaceNotes.length },
                    { id: 'flowchart', title: 'مخطط انسيابي', count: workspaceFlowcharts.length },
                  ].filter((item) => `${item.title}`.includes(nodeNoteMentionPicker.query))
                  : nodeNoteMentionPicker.step === 'container'
                    ? (nodeNoteMentionPicker.kind === 'mind-map' ? workspaceProjects : workspaceFlowcharts).filter((item) => (item.title || '').toLowerCase().includes(nodeNoteMentionPicker.query.toLowerCase()))
                    : nodeNoteMentionPicker.kind === 'mind-map'
                      ? (workspaceProjects.find((item) => item.id === nodeNoteMentionPicker.containerId)?.nodes || []).filter((item) => (item.data?.label || '').toLowerCase().includes(nodeNoteMentionPicker.query.toLowerCase()))
                    : nodeNoteMentionPicker.kind === 'task'
                        ? workspaceTasks.filter((item) => (item.title || '').toLowerCase().includes(nodeNoteMentionPicker.query.toLowerCase()))
                        : nodeNoteMentionPicker.kind === 'note'
                          ? workspaceNotes.filter((item) => (item.title || '').toLowerCase().includes(nodeNoteMentionPicker.query.toLowerCase()))
                        : (workspaceFlowcharts.find((item) => item.id === nodeNoteMentionPicker.containerId)?.nodes || []).filter((item) => (item.data?.label || '').toLowerCase().includes(nodeNoteMentionPicker.query.toLowerCase()))
                ).map((item) => nodeNoteMentionPicker.step === 'type'
                  ? <button type="button" role="option" key={item.id} onClick={() => setNodeMentionKind(item.id)}><strong>{item.title}</strong><small>{item.count} {item.id === 'task' ? 'مهمة' : item.id === 'note' ? 'ملاحظة' : item.id === 'mind-map' ? 'خريطة' : 'مخطط'}</small></button>
                  : nodeNoteMentionPicker.step === 'container'
                    ? <button type="button" role="option" key={item.id} onClick={() => setNodeMentionContainer(item)}><strong>{item.title}</strong><small>{item.nodes?.length || 0} {nodeNoteMentionPicker.kind === 'mind-map' ? 'عقدة' : 'شكل'}</small></button>
                    : <button type="button" role="option" key={item.id} onClick={() => insertNodeNoteMention(item)}><strong>{nodeNoteMentionPicker.kind === 'task' || nodeNoteMentionPicker.kind === 'note' ? item.title : item.data?.label || 'بدون عنوان'}</strong></button>
                )}
              </div>
            </div>}
            {!!selectedNode.data.mentions?.length && <div className="node-note-mention-links" aria-label="العناصر المرتبطة بهذه العقدة">
              {selectedNode.data.mentions.map((mention, index) => <button type="button" key={`${mention.type}-${mention.text}-${index}`} onClick={() => openMention(mention)}>{mention.type === 'task' ? 'âœ“' : mention.type === 'note' ? 'ðŸ“' : mention.type === 'flowchart-node' ? 'â†—' : 'ðŸ§ '} {mention.taskTitle || mention.noteTitle || mention.nodeTitle}</button>)}
            </div>}
            <div className="notes-settings">
              <div className="emoji-picker-heading">
                <h3>إيموجي العقدة</h3>
                <button className="emoji-picker-toggle" type="button" aria-expanded={emojiPickerOpen} aria-controls="notes-emoji-picker" onClick={() => setEmojiPickerOpen((open) => !open)}>
                  {emojiPickerOpen ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
              <div id="notes-emoji-picker" hidden={!emojiPickerOpen}>
                {emojiPickerOpen && <>
                  <div className="notes-emoji-picker" role="group" aria-label="اختيار إيموجي للعقدة">
                    <button type="button" className={`notes-emoji-choice emoji-none${!selectedNode.data.emoji ? ' is-active' : ''}`} aria-label="بدون إيموجي" aria-pressed={!selectedNode.data.emoji} onClick={() => updateSelected({ emoji: '' })}>Ã—</button>
                    {nodeEmojis.map(({ emoji, label }) => <button key={emoji} type="button" className={`notes-emoji-choice${selectedNode.data.emoji === emoji ? ' is-active' : ''}`} aria-label={label} title={label} aria-pressed={selectedNode.data.emoji === emoji} onClick={() => updateSelected({ emoji })}><EmojiGlyph emoji={emoji} /></button>)}
                  </div>
                  <a className="emoji-credit" href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">الرسومات من Twemoji</a>
                </>}
              </div>
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
      {pendingDeleteProject && <div className="confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDeleteProject(null) }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-map-editor-title" dir="rtl">
          <span className="confirm-icon"><Trash2 size={21} /></span>
          <h2 id="delete-map-editor-title">{appLanguage === 'en' ? 'Delete mind map?' : 'حذف الخريطة الذهنية؟'}</h2>
          <p>{appLanguage === 'en' ? 'Delete' : 'هل تريد حذف'} <strong>{pendingDeleteProject.title || (appLanguage === 'en' ? 'Untitled mind map' : 'خريطة بدون عنوان')}</strong>?</p>
          <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={() => setPendingDeleteProject(null)}>{appLanguage === 'en' ? 'Cancel' : 'إلغاء'}</button><button type="button" className="confirm-delete" onClick={confirmDeleteProject}>{appLanguage === 'en' ? 'Delete' : 'حذف'}</button></div>
        </section>
      </div>}
      {closeProjectDialog}
      {settingsDialog}
      {helpDialog}
    </main>
    </LocalizedContent>
  )
}

export default App
