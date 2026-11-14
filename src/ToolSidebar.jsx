import { GitBranch, Home, LayoutTemplate, ListTodo, Settings2, StickyNote, Workflow } from 'lucide-react'

export function SettingsButton({ onClick, language }) {
  const label = language === 'en' ? 'Settings' : 'الإعدادات'
  return (
    <button type="button" className="topbar-settings" title={label} aria-label={label} onClick={onClick}>
      <Settings2 size={16} />
      <span>{label}</span>
    </button>
  )
}

export function ToolSwitcher({ activeTool, onSelect, language }) {
  const mindMapLabel = language === 'en' ? 'Mind map' : 'الخريطة الذهنية'
  const notesLabel = language === 'en' ? 'Notes' : 'الملاحظات'
  const tasksLabel = language === 'en' ? 'Tasks' : 'المهام'
  const flowchartLabel = language === 'en' ? 'Flowchart' : 'مخطط انسيابي'
  const designerLabel = language === 'en' ? 'UI design' : 'تصميم الواجهات'
  return (
    <nav className="topbar-tool-switcher" aria-label={language === 'en' ? 'App tools' : 'أدوات البرنامج'}>
      <button
        type="button"
        className={`topbar-tool-button${activeTool === 'mind-map' ? ' is-active' : ''}`}
        aria-label={mindMapLabel}
        aria-current={activeTool === 'mind-map' ? 'page' : undefined}
        title={mindMapLabel}
        onClick={() => onSelect('mind-map')}
      >
        <Workflow size={15} />
        <span>{mindMapLabel}</span>
      </button>
      <button
        type="button"
        className={`topbar-tool-button${activeTool === 'notes' ? ' is-active' : ''}`}
        aria-label={notesLabel}
        aria-current={activeTool === 'notes' ? 'page' : undefined}
        title={notesLabel}
        onClick={() => onSelect('notes')}
      >
        <StickyNote size={15} />
        <span>{notesLabel}</span>
      </button>
      <button
        type="button"
        className={`topbar-tool-button${activeTool === 'flowchart' ? ' is-active' : ''}`}
        aria-label={flowchartLabel}
        aria-current={activeTool === 'flowchart' ? 'page' : undefined}
        title={flowchartLabel}
        onClick={() => onSelect('flowchart')}
      >
        <GitBranch size={15} />
        <span>{flowchartLabel}</span>
      </button>
      <button
        type="button"
        className={`topbar-tool-button${activeTool === 'tasks' ? ' is-active' : ''}`}
        aria-label={tasksLabel}
        aria-current={activeTool === 'tasks' ? 'page' : undefined}
        title={tasksLabel}
        onClick={() => onSelect('tasks')}
      >
        <ListTodo size={15} />
        <span>{tasksLabel}</span>
      </button>
      <button type="button" className={`topbar-tool-button${activeTool === 'ui-design' ? ' is-active' : ''}`} aria-label={designerLabel} aria-current={activeTool === 'ui-design' ? 'page' : undefined} title={designerLabel} onClick={() => onSelect('ui-design')}>
        <LayoutTemplate size={15} /><span>{designerLabel}</span>
      </button>
    </nav>
  )
}

export default function ToolSidebar({ activeTool, onSelect, onHome, homeActive = false, language }) {
  const homeLabel = language === 'en' ? 'Projects home' : 'الصفحة الرئيسية'
  const mindMapLabel = language === 'en' ? 'Mind map' : 'الخريطة الذهنية'
  const notesLabel = language === 'en' ? 'Notes' : 'الملاحظات'
  const tasksLabel = language === 'en' ? 'Tasks' : 'المهام'
  const flowchartLabel = language === 'en' ? 'Flowchart' : 'مخطط انسيابي'
  const designerLabel = language === 'en' ? 'UI design' : 'تصميم الواجهات'
  return (
    <nav className="tool-sidebar" aria-label={language === 'en' ? 'Waraqa tools' : 'أدوات ورقة'}>
      <button type="button" className={`tool-sidebar-button tool-sidebar-home${homeActive ? ' is-active' : ''}`} aria-label={homeLabel} aria-current={homeActive ? 'page' : undefined} title={homeLabel} onClick={onHome}>
        <Home size={20} />
      </button>
      <button
        type="button"
        className={`tool-sidebar-button${activeTool === 'mind-map' ? ' is-active' : ''}`}
        aria-label={mindMapLabel}
        aria-current={activeTool === 'mind-map' ? 'page' : undefined}
        title={mindMapLabel}
        onClick={() => onSelect('mind-map')}
      >
        <Workflow size={20} />
      </button>
      <button
        type="button"
        className={`tool-sidebar-button${activeTool === 'notes' ? ' is-active' : ''}`}
        aria-label={notesLabel}
        aria-current={activeTool === 'notes' ? 'page' : undefined}
        title={notesLabel}
        onClick={() => onSelect('notes')}
      >
        <StickyNote size={20} />
      </button>
      <button
        type="button"
        className={`tool-sidebar-button${activeTool === 'flowchart' ? ' is-active' : ''}`}
        aria-label={flowchartLabel}
        aria-current={activeTool === 'flowchart' ? 'page' : undefined}
        title={flowchartLabel}
        onClick={() => onSelect('flowchart')}
      >
        <GitBranch size={20} />
      </button>
      <button
        type="button"
        className={`tool-sidebar-button${activeTool === 'tasks' ? ' is-active' : ''}`}
        aria-label={tasksLabel}
        aria-current={activeTool === 'tasks' ? 'page' : undefined}
        title={tasksLabel}
        onClick={() => onSelect('tasks')}
      >
        <ListTodo size={20} />
      </button>
      <button type="button" className={`tool-sidebar-button${activeTool === 'ui-design' ? ' is-active' : ''}`} aria-label={designerLabel} aria-current={activeTool === 'ui-design' ? 'page' : undefined} title={designerLabel} onClick={() => onSelect('ui-design')}>
        <LayoutTemplate size={20} />
      </button>
    </nav>
  )
}
