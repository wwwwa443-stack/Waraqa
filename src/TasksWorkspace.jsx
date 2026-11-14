import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Circle, ListTodo, PanelRightClose, PanelRightOpen, Plus, Trash2 } from 'lucide-react'

const makeId = () => globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function TasksWorkspace({ language, tasks, taskLists, workspaceId, focusTaskId, onFocusTaskHandled, projects = [], notes = [], flowcharts = [], onOpenMention, onTasksChange, onTaskListsChange }) {
  const [draft, setDraft] = useState('')
  const [listDraft, setListDraft] = useState('')
  const [listError, setListError] = useState('')
  const [activeListId, setActiveListId] = useState(null)
  const [focusedTaskId, setFocusedTaskId] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [mentionPicker, setMentionPicker] = useState(null)
  const [draftMentions, setDraftMentions] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('waraqa-task-lists-collapsed') === 'true')
  const listNameInputRef = useRef(null)
  const taskTitleInputRef = useRef(null)
  const isEnglish = language === 'en'
  const text = (arabic, english) => isEnglish ? english : arabic
  const defaultListId = `${workspaceId}-default-task-list`
  const lists = taskLists.length ? taskLists : [{ id: defaultListId, title: text('مهامي', 'My tasks'), workspaceId }]
  const selectedList = lists.find((list) => list.id === activeListId) || lists[0]
  const visibleTasks = tasks.filter((task) => (task.listId || defaultListId) === selectedList.id)
  const orderedTasks = useMemo(() => [...visibleTasks].sort((left, right) => (
    Number(left.completed) - Number(right.completed) || (left.createdAt || 0) - (right.createdAt || 0)
  )), [visibleTasks])
  const completedCount = visibleTasks.filter((task) => task.completed).length
  const updateTask = (taskId, changes) => onTasksChange(tasks.map((task) => task.id === taskId ? { ...task, ...changes, updatedAt: Date.now() } : task))
  const toggleSidebar = () => setSidebarCollapsed((collapsed) => {
    const next = !collapsed
    localStorage.setItem('waraqa-task-lists-collapsed', String(next))
    return next
  })

  useEffect(() => {
    if (!focusTaskId) return
    const task = tasks.find((item) => item.id === focusTaskId)
    if (!task) return
    setActiveListId(task.listId || defaultListId)
    setFocusedTaskId(task.id)
  }, [focusTaskId, tasks, defaultListId])

  useEffect(() => {
    if (!focusedTaskId || !visibleTasks.some((task) => task.id === focusedTaskId)) return
    const frame = requestAnimationFrame(() => {
      [...document.querySelectorAll('.task-item[data-task-id]')].find((item) => item.dataset.taskId === focusedTaskId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => {
        setFocusedTaskId(null)
        onFocusTaskHandled?.()
      }, 1800)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusedTaskId, visibleTasks, onFocusTaskHandled])

  const addTask = (event) => {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    onTasksChange([...tasks, { id: makeId(), title, completed: false, mentions: draftMentions, createdAt: Date.now(), workspaceId, listId: selectedList.id }])
    setDraft('')
    setDraftMentions([])
    setMentionPicker(null)
  }
  const addList = (event) => {
    event.preventDefault()
    const title = listDraft.trim()
    if (!title) {
      setListError(text('اكتب اسم القائمة أولًا', 'Enter a list name first'))
      listNameInputRef.current?.focus()
      return
    }
    const list = { id: makeId(), title, createdAt: Date.now(), workspaceId }
    const defaultList = { id: defaultListId, title: text('مهامي', 'My tasks'), workspaceId }
    onTaskListsChange(taskLists.length ? [...taskLists, list] : [defaultList, list])
    setActiveListId(list.id)
    setListDraft('')
    setListError('')
  }
  const deleteList = (listId) => {
    onTaskListsChange(taskLists.filter((list) => list.id !== listId))
    onTasksChange(tasks.filter((task) => task.listId !== listId))
    if (activeListId === listId) setActiveListId(lists.find((list) => list.id !== listId)?.id || null)
  }

  const handleTaskTitleChange = (task, value, caret) => {
    const currentMentions = task ? task.mentions || [] : draftMentions
    const mentions = currentMentions.filter((mention) => value.includes(mention.text))
    if (task) updateTask(task.id, { title: value, mentions })
    else { setDraft(value); setDraftMentions(mentions) }
    const ownerId = task?.id ?? null
    if (mentionPicker?.taskId === ownerId) {
      const query = value.slice(mentionPicker.queryStart, caret)
      if (caret < mentionPicker.queryStart || query.includes('\n')) setMentionPicker(null)
      else setMentionPicker({ ...mentionPicker, end: caret, query })
    } else if (value[caret - 1] === '@') {
      setMentionPicker({ taskId: ownerId, start: caret - 1, queryStart: caret, end: caret, step: 'type', kind: null, containerId: null, query: '' })
    }
  }
  const moveMentionStep = (step, kind = mentionPicker?.kind, containerId = mentionPicker?.containerId) => {
    const task = tasks.find((item) => item.id === mentionPicker?.taskId)
    if (!mentionPicker || (mentionPicker.taskId !== null && !task)) return
    const currentTitle = task ? task.title : draft
    const title = `${currentTitle.slice(0, mentionPicker.start + 1)}${currentTitle.slice(mentionPicker.end)}`
    const mentions = (task ? task.mentions || [] : draftMentions).filter((mention) => title.includes(mention.text))
    if (task) updateTask(task.id, { title, mentions })
    else { setDraft(title); setDraftMentions(mentions) }
    const queryStart = mentionPicker.start + 1
    setMentionPicker({ ...mentionPicker, step, kind, containerId, queryStart, end: queryStart, query: '' })
    requestAnimationFrame(() => {
      const input = task ? taskTitleInputRef.current : document.querySelector('.tasks-add-form input')
      input?.focus()
      input?.setSelectionRange(queryStart, queryStart)
    })
  }
  const mentionTypes = [
    { id: 'mind-map', title: text('خريطة ذهنية', 'Mind map'), count: projects.length },
    { id: 'task', title: text('مهمة', 'Task'), count: tasks.length },
    { id: 'note', title: text('ملاحظة', 'Note'), count: notes.length },
    { id: 'flowchart', title: text('مخطط انسيابي', 'Flowchart'), count: flowcharts.length },
  ]
  const getMentionOptions = (picker) => {
    if (!picker) return []
    const query = picker.query.toLocaleLowerCase()
    if (picker.step === 'type') return mentionTypes.filter((item) => `${item.title} ${item.count}`.toLocaleLowerCase().includes(query))
    if (picker.step === 'container') return (picker.kind === 'mind-map' ? projects : flowcharts)
      .filter((item) => (item.title || '').toLocaleLowerCase().includes(query))
      .map((item) => ({ id: item.id, title: item.title || text('بدون عنوان', 'Untitled'), detail: `${item.nodes?.length || 0}`, optionType: 'container', value: item }))
    const items = picker.kind === 'mind-map'
      ? (projects.find((item) => item.id === picker.containerId)?.nodes || [])
      : picker.kind === 'task'
        ? tasks.filter((item) => item.id !== picker.taskId)
        : picker.kind === 'note'
          ? notes
          : (flowcharts.find((item) => item.id === picker.containerId)?.nodes || [])
    return items.filter((item) => `${picker.kind === 'task' || picker.kind === 'note' ? item.title || '' : item.data?.label || ''}`.toLocaleLowerCase().includes(query))
      .map((item) => ({ id: item.id, title: picker.kind === 'task' || picker.kind === 'note' ? item.title || text('بدون عنوان', 'Untitled') : item.data?.label || text('بدون عنوان', 'Untitled'), optionType: 'item', value: item }))
  }
  const insertTaskMention = (item) => {
    const picker = mentionPicker
    const task = tasks.find((entry) => entry.id === picker?.taskId)
    if (!picker || (picker.taskId !== null && !task)) return
    const currentTitle = task ? task.title : draft
    const currentMentions = task ? task.mentions || [] : draftMentions
    const container = picker.kind === 'mind-map' ? projects.find((entry) => entry.id === picker.containerId)
      : picker.kind === 'flowchart' ? flowcharts.find((entry) => entry.id === picker.containerId) : null
    if (!['task', 'note'].includes(picker.kind) && !container) return
    const targetTitle = picker.kind === 'task' || picker.kind === 'note' ? item.title || text('بدون عنوان', 'Untitled') : item.data?.label || text('بدون عنوان', 'Untitled')
    const containerTitle = container?.title || ''
    const prefix = picker.kind === 'mind-map' ? '🧠' : picker.kind === 'task' ? '✓' : picker.kind === 'note' ? '📝' : '↗'
    const mentionText = `@${prefix} ${containerTitle ? `${containerTitle} / ` : ''}${targetTitle}`
    const title = `${currentTitle.slice(0, picker.start)}${mentionText}${currentTitle.slice(picker.end)}`
    const mention = picker.kind === 'mind-map'
      ? { type: 'mind-map-node', projectId: container.id, nodeId: item.id, projectTitle: containerTitle, nodeTitle: targetTitle, text: mentionText }
      : picker.kind === 'task'
        ? { type: 'task', taskId: item.id, taskTitle: targetTitle, workspaceId: item.workspaceId, text: mentionText }
        : picker.kind === 'note'
          ? { type: 'note', noteId: item.id, noteTitle: targetTitle, workspaceId: item.workspaceId, text: mentionText }
          : { type: 'flowchart-node', flowchartId: container.id, flowchartTitle: containerTitle, nodeId: item.id, nodeTitle: targetTitle, workspaceId: container.workspaceId, text: mentionText }
    if (task) updateTask(task.id, { title, mentions: [...currentMentions, mention] })
    else { setDraft(title); setDraftMentions([...currentMentions, mention]) }
    if (task) setEditingTaskId(task.id)
    const caret = picker.start + mentionText.length
    requestAnimationFrame(() => {
      const input = task ? taskTitleInputRef.current : document.querySelector('.tasks-add-form input')
      input?.focus()
      input?.setSelectionRange(caret, caret)
    })
  }

  const renderTaskTitle = (task) => {
    const mentions = (task.mentions || []).map((mention) => ({ ...mention, index: task.title.indexOf(mention.text) })).filter((mention) => mention.index >= 0).sort((left, right) => left.index - right.index)
    const parts = []
    let cursor = 0
    mentions.forEach((mention, index) => {
      if (mention.index < cursor) return
      if (mention.index > cursor) parts.push(task.title.slice(cursor, mention.index))
      const title = mention.taskTitle || mention.noteTitle || mention.nodeTitle || mention.text
      parts.push(<button type="button" className="task-inline-mention" key={`${mention.text}-${index}`} title={mention.projectTitle || mention.flowchartTitle || ''} onClick={(event) => { event.stopPropagation(); onOpenMention?.(mention) }}>{title}</button>)
      cursor = mention.index + mention.text.length
    })
    if (cursor < task.title.length) parts.push(task.title.slice(cursor))
    return parts.length ? parts : task.title
  }
  const renderMentionPicker = (picker) => <div className="task-mention-picker" role="listbox" aria-label={text('اختيار عنصر للمنشن', 'Choose an item to mention')} onPointerDown={(event) => event.preventDefault()}>
    <div className="notes-mention-heading">
      <strong>{picker.step === 'type' ? text('اختر نوع العنصر', 'Choose item type') : picker.step === 'container' ? text(picker.kind === 'mind-map' ? 'اختر الخريطة' : 'اختر المخطط', picker.kind === 'mind-map' ? 'Choose map' : 'Choose flowchart') : text(picker.kind === 'mind-map' ? 'اختر العقدة' : picker.kind === 'task' ? 'اختر المهمة' : picker.kind === 'note' ? 'اختر الملاحظة' : 'اختر الشكل', picker.kind === 'mind-map' ? 'Choose node' : picker.kind === 'task' ? 'Choose task' : picker.kind === 'note' ? 'Choose note' : 'Choose shape')}</strong>
      {picker.step !== 'type' && <button type="button" onClick={() => moveMentionStep(picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? 'container' : 'type', picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? picker.kind : null, picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? picker.containerId : null)}>{text('رجوع', 'Back')}</button>}
    </div>
    <div className="notes-mention-options">
      {getMentionOptions(picker).map((option) => <button type="button" role="option" key={option.id} onClick={() => {
        if (picker.step === 'type') moveMentionStep(option.id === 'task' || option.id === 'note' ? 'item' : 'container', option.id, null)
        else if (picker.step === 'container') moveMentionStep('item', picker.kind, option.value.id)
        else insertTaskMention(option.value)
      }}><strong>{option.title}</strong>{option.detail ? <small>{option.detail}</small> : option.optionType === undefined && picker.step === 'type' ? <small>{option.count}</small> : null}</button>)}
      {!getMentionOptions(picker).length && <span className="notes-mention-empty">{text('لا توجد نتائج مطابقة', 'No matching items')}</span>}
    </div>
  </div>

  return (
    <div className={`tasks-layout${sidebarCollapsed ? ' tasks-sidebar-collapsed' : ''}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <aside className="tasks-list-panel">
        <div className="tasks-list-panel-heading">
          <button type="button" className="tasks-sidebar-toggle" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? text('إظهار قوائم المهام', 'Show task lists') : text('طي قوائم المهام', 'Collapse task lists')} title={sidebarCollapsed ? text('إظهار قوائم المهام', 'Show task lists') : text('طي قوائم المهام', 'Collapse task lists')}>
            {sidebarCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
          </button>
          <strong><ListTodo size={16} />{text('قوائم المهام', 'Task lists')}</strong>
          <span>{lists.length}</span>
          {!sidebarCollapsed && <button type="submit" form="tasks-list-create-form" className="tasks-list-add-button" aria-label={text('إضافة قائمة مهام جديدة', 'Add a new task list')} title={text('إضافة قائمة مهام جديدة', 'Add a new task list')}><Plus size={17} /></button>}
        </div>
        <nav className="tasks-list-nav" aria-label={text('قوائم المهام', 'Task lists')}>
          {lists.map((list) => {
            const count = tasks.filter((task) => (task.listId || defaultListId) === list.id && !task.completed).length
            return <div className={`tasks-list-row${selectedList.id === list.id ? ' is-active' : ''}`} key={list.id}>
              <button type="button" className="tasks-list-select" onClick={() => setActiveListId(list.id)} aria-current={selectedList.id === list.id ? 'page' : undefined}>
                <ListTodo size={16} /><span>{list.title}</span><small>{count}</small>
              </button>
              {taskLists.some((savedList) => savedList.id === list.id) && <button type="button" className="tasks-list-delete" title={text('حذف القائمة', 'Delete list')} aria-label={`${text('حذف القائمة', 'Delete list')} ${list.title}`} onClick={() => deleteList(list.id)}><Trash2 size={14} /></button>}
            </div>
          })}
        </nav>
        {listError && <span className="tasks-list-validation" role="alert">{listError}</span>}
        <form id="tasks-list-create-form" className={`tasks-list-create${listError ? ' is-invalid' : ''}`} onSubmit={addList}>
          <input ref={listNameInputRef} value={listDraft} onChange={(event) => { setListDraft(event.target.value); setListError('') }} placeholder={text('اسم قائمة جديدة', 'New list name')} aria-label={text('اسم قائمة جديدة', 'New list name')} />
          <button type="submit" aria-label={text('إنشاء قائمة', 'Create list')}><Plus size={17} /></button>
        </form>
      </aside>
      <main className="tasks-workspace">
        <header className="tasks-heading">
          <div className="tasks-heading-icon"><ListTodo size={20} /></div>
          <div><h1>{selectedList.title}</h1><p>{text('نظّم مهامك وتابع إنجازها.', 'Organize tasks and track progress.')}</p></div>
          <span className="tasks-progress">{completedCount} / {visibleTasks.length} {text('مكتملة', 'done')}</span>
        </header>
        <form className="tasks-add-form" onSubmit={addTask}>
          <Plus size={18} aria-hidden="true" />
          <input aria-label={text('مهمة جديدة', 'New task')} placeholder={text('اكتب مهمة جديدة...', 'Add a task...')} value={draft} onChange={(event) => handleTaskTitleChange(null, event.target.value, event.target.selectionStart)} onKeyDown={(event) => { if (event.key === 'Escape' && mentionPicker?.taskId === null) setMentionPicker(null) }} />
          <button type="submit" disabled={!draft.trim()}><Plus size={16} /><span>{text('إضافة', 'Add')}</span></button>
          {mentionPicker?.taskId === null && renderMentionPicker(mentionPicker)}
        </form>
        {orderedTasks.length ? <ul className="tasks-list">
          {orderedTasks.map((task) => <li data-task-id={task.id} className={`task-item${task.completed ? ' is-completed' : ''}${focusedTaskId === task.id ? ' is-mentioned' : ''}${editingTaskId === task.id ? ' is-editing' : ''}`} key={task.id}>
            <button type="button" className="task-complete-button" aria-label={task.completed ? text('إعادة فتح المهمة', 'Mark task incomplete') : text('إكمال المهمة', 'Mark task complete')} aria-pressed={task.completed} onClick={() => onTasksChange(tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item))}>{task.completed ? <Check size={15} /> : <Circle size={17} />}</button>
            {editingTaskId === task.id ? <input
              ref={taskTitleInputRef}
              className="task-title task-title-input"
              autoFocus
              value={task.title}
              aria-label={text('عنوان المهمة', 'Task title')}
              onChange={(event) => handleTaskTitleChange(task, event.target.value, event.target.selectionStart)}
              onBlur={() => { setEditingTaskId((current) => current === task.id ? null : current); setMentionPicker((current) => current?.taskId === task.id ? null : current) }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && mentionPicker?.taskId === task.id) { event.preventDefault(); setMentionPicker(null); return }
                if (event.key === 'Enter') { event.preventDefault(); setEditingTaskId(null); setMentionPicker(null) }
              }}
            /> : <button type="button" className="task-title task-title-button" onClick={() => setEditingTaskId(task.id)} title={text('اضغط لتحرير المهمة وإضافة منشن', 'Click to edit task and add a mention')}>{renderTaskTitle(task)}</button>}
            {mentionPicker?.taskId === task.id && renderMentionPicker(mentionPicker)}
            <button type="button" className="task-delete-button" aria-label={text(`حذف ${task.title}`, `Delete ${task.title}`)} title={text('حذف المهمة', 'Delete task')} onClick={() => onTasksChange(tasks.filter((item) => item.id !== task.id))}><Trash2 size={15} /></button>
          </li>)}
        </ul> : <div className="tasks-empty"><span><ListTodo size={23} /></span><strong>{text('لا توجد مهام بعد', 'No tasks yet')}</strong><p>{text('أضف أول مهمة إلى هذه القائمة.', 'Add the first task to this list.')}</p></div>}
      </main>
    </div>
  )
}
