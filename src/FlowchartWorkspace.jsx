import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { AlignVerticalJustifyCenter, Circle, Database, Diamond, FileText, GitBranch, PanelRightClose, PanelRightOpen, Plus, Square, Trash2 } from 'lucide-react'

const createId = () => globalThis.crypto?.randomUUID?.() || `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const shapeOptions = [
  { type: 'terminator', title: ['بداية / نهاية', 'Start / End'], icon: Circle },
  { type: 'process', title: ['عملية', 'Process'], icon: Square },
  { type: 'decision', title: ['قرار', 'Decision'], icon: Diamond },
  { type: 'input-output', title: ['إدخال / إخراج', 'Input / Output'], icon: GitBranch },
  { type: 'document', title: ['مستند', 'Document'], icon: FileText },
  { type: 'database', title: ['قاعدة بيانات', 'Database'], icon: Database },
]

const measureShape = (shape, value = '', mentionCount = 0) => {
  const minWidth = shape === 'decision' ? 190 : shape === 'input-output' ? 180 : 158
  const minHeight = shape === 'decision' ? 128 : shape === 'input-output' ? 96 : 76
  const maxWidth = 300
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context) context.font = '500 12px "IBM Plex Sans Arabic", sans-serif'
  const lines = String(value || '').split('\n')
  const measuredWidth = Math.max(...lines.map((line) => context?.measureText(line).width || line.length * 8), 0)
  const widthPadding = shape === 'decision' ? 108 : shape === 'input-output' ? 86 : 60
  const width = Math.min(maxWidth, Math.max(minWidth, Math.ceil(measuredWidth + widthPadding)))
  const textWidthRatio = shape === 'decision' ? 0.60 : shape === 'input-output' ? 0.68 : 0.78
  const textWidth = Math.max(70, width * textWidthRatio)
  const visualLines = lines.reduce((total, line) => total + Math.max(1, Math.ceil((context?.measureText(line).width || line.length * 8) / textWidth)), 0)
  const heightPadding = shape === 'decision' ? 58 : shape === 'input-output' ? 46 : 34
  const height = Math.max(minHeight, Math.min(480, visualLines * 21 + heightPadding + (mentionCount ? 24 : 0)))
  return { nodeWidth: width, nodeHeight: height }
}

function FlowchartShape({ id, data, selected }) {
  const [picker, setPicker] = useState(null)
  const inputRef = useRef(null)
  const isEnglish = document.documentElement.lang === 'en'
  const shapeName = shapeOptions.find((shape) => shape.type === data.shape)?.title[isEnglish ? 1 : 0] || ''
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, data.nodeHeight || 270)}px`
  }, [data.label, data.nodeHeight, data.shape])
  const items = picker?.kind === 'mind-map' ? data.workspaceProjects?.find((item) => item.id === picker.containerId)?.nodes || []
    : picker?.kind === 'task' ? (data.workspaceTasks || []).filter((task) => task.id !== id)
      : picker?.kind === 'note' ? data.workspaceNotes || []
        : data.workspaceFlowcharts?.find((item) => item.id === picker?.containerId)?.nodes || []
  const options = picker?.step === 'type'
    ? [
      { id: 'mind-map', title: isEnglish ? 'Mind map' : 'خريطة ذهنية', count: data.workspaceProjects?.length || 0 },
      { id: 'task', title: isEnglish ? 'Task' : 'مهمة', count: data.workspaceTasks?.length || 0 },
      { id: 'note', title: isEnglish ? 'Note' : 'ملاحظة', count: data.workspaceNotes?.length || 0 },
      { id: 'flowchart', title: isEnglish ? 'Flowchart' : 'مخطط انسيابي', count: data.workspaceFlowcharts?.length || 0 },
    ].filter((item) => `${item.title} ${item.count}`.toLocaleLowerCase().includes(picker.query.toLocaleLowerCase()))
    : picker?.step === 'container'
      ? (picker.kind === 'mind-map' ? data.workspaceProjects || [] : data.workspaceFlowcharts || []).filter((item) => (item.title || '').toLocaleLowerCase().includes(picker.query.toLocaleLowerCase()))
      : items.filter((item) => `${picker?.kind === 'task' || picker?.kind === 'note' ? item.title || '' : item.data?.label || ''}`.toLocaleLowerCase().includes(picker?.query?.toLocaleLowerCase() || ''))

  useLayoutEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, Math.max(34, (data.nodeHeight || 76) - 24))}px`
  }, [data.label, data.nodeHeight])

  const handleChange = (event) => {
    const value = event.target.value
    const caret = event.target.selectionStart
    const labelMentions = (data.labelMentions || []).filter((mention) => value.includes(mention.text))
    data.onLabelChange?.(id, value, labelMentions)
    if (picker) {
      const query = value.slice(picker.queryStart, caret)
      if (caret < picker.queryStart || query.includes('\n')) setPicker(null)
      else setPicker({ ...picker, end: caret, query })
    } else if (value[caret - 1] === '@') {
      setPicker({ start: caret - 1, queryStart: caret, end: caret, step: 'type', kind: null, containerId: null, query: '' })
    }
  }
  const moveStep = (step, kind = picker?.kind, containerId = picker?.containerId) => {
    if (!picker) return
    const currentLabel = data.label || ''
    const label = `${currentLabel.slice(0, picker.start + 1)}${currentLabel.slice(picker.end)}`
    data.onLabelChange?.(id, label, (data.labelMentions || []).filter((mention) => label.includes(mention.text)))
    const queryStart = picker.start + 1
    setPicker({ ...picker, step, kind, containerId, queryStart, end: queryStart, query: '' })
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(queryStart, queryStart) })
  }
  const insertMention = (item) => {
    if (!picker) return
    const container = picker.kind === 'mind-map' ? data.workspaceProjects?.find((project) => project.id === picker.containerId)
      : picker.kind === 'flowchart' ? data.workspaceFlowcharts?.find((flowchart) => flowchart.id === picker.containerId) : null
    if (!['task', 'note'].includes(picker.kind) && !container) return
    const targetTitle = picker.kind === 'task' || picker.kind === 'note' ? item.title || (isEnglish ? 'Untitled' : 'بدون عنوان') : item.data?.label || (isEnglish ? 'Untitled' : 'بدون عنوان')
    const containerTitle = container?.title || ''
    const prefix = picker.kind === 'mind-map' ? '🧠' : picker.kind === 'task' ? '✓' : picker.kind === 'note' ? '📝' : '↗'
    const mentionText = `@${prefix} ${containerTitle ? `${containerTitle} / ` : ''}${targetTitle}`
    const label = `${(data.label || '').slice(0, picker.start)}${mentionText}${(data.label || '').slice(picker.end)}`
    const mention = picker.kind === 'mind-map'
      ? { type: 'mind-map-node', projectId: container.id, nodeId: item.id, projectTitle: containerTitle, nodeTitle: targetTitle, text: mentionText }
      : picker.kind === 'task'
        ? { type: 'task', taskId: item.id, taskTitle: targetTitle, workspaceId: item.workspaceId, text: mentionText }
        : picker.kind === 'note'
          ? { type: 'note', noteId: item.id, noteTitle: targetTitle, workspaceId: item.workspaceId, text: mentionText }
          : { type: 'flowchart-node', flowchartId: container.id, flowchartTitle: containerTitle, nodeId: item.id, nodeTitle: targetTitle, workspaceId: container.workspaceId, text: mentionText }
    data.onLabelChange?.(id, label, [...(data.labelMentions || []), mention])
    setPicker(null)
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(picker.start + mentionText.length, picker.start + mentionText.length) })
  }
  const adjustPickerStep = (option) => {
    if (picker.step === 'type') moveStep(option.id === 'task' || option.id === 'note' ? 'item' : 'container', option.id, null)
    else if (picker.step === 'container') moveStep('item', picker.kind, option.id)
    else insertMention(option)
  }
  return <div className={`flowchart-node-shape flowchart-shape-${data.shape}${selected ? ' is-selected' : ''}`} style={{ width: data.nodeWidth || 158, height: data.nodeHeight || 76 }}>
    <Handle type="target" position={Position.Top} />
    <textarea
      ref={inputRef}
      className="flowchart-node-label"
      aria-label={`${shapeName}: ${data.label || ''}`}
      value={data.label || ''}
      placeholder={shapeName}
      rows={1}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={handleChange}
      onKeyDown={(event) => { if (event.key === 'Escape' && picker) { event.preventDefault(); setPicker(null) } }}
    />
    {!!data.labelMentions?.length && <div className="flowchart-node-mentions">
      {data.labelMentions.map((mention, index) => <button type="button" key={`${mention.type}-${mention.text}-${index}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); data.onOpenMention?.(mention) }}>{mention.taskTitle || mention.noteTitle || mention.nodeTitle}</button>)}
    </div>}
    {picker && <div className="flowchart-node-mention-picker nodrag nopan" role="listbox" aria-label={isEnglish ? 'Choose item to mention' : 'اختر عنصرًا للمنشن'} onPointerDown={(event) => event.preventDefault()}>
      <div className="notes-mention-heading">
        <strong>{picker.step === 'type' ? (isEnglish ? 'Choose type' : 'اختر النوع') : picker.step === 'container' ? (isEnglish ? 'Choose map or flowchart' : 'اختر الملف') : (isEnglish ? 'Choose item' : 'اختر العنصر')}</strong>
        {picker.step !== 'type' && <button type="button" onClick={() => moveStep(picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? 'container' : 'type', picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? picker.kind : null, picker.step === 'item' && !['task', 'note'].includes(picker.kind) ? picker.containerId : null)}>{isEnglish ? 'Back' : 'رجوع'}</button>}
      </div>
      <div className="notes-mention-options">
        {options.map((option) => <button type="button" role="option" key={option.id} onClick={() => picker.step === 'type' ? moveStep(option.id === 'task' || option.id === 'note' ? 'item' : 'container', option.id, null) : picker.step === 'container' ? moveStep('item', picker.kind, option.id) : insertMention(option)}><strong>{option.title || option.data?.label || option.data?.label || (isEnglish ? 'Untitled' : 'بدون عنوان')}</strong>{option.count != null && <small>{option.count}</small>}</button>)}
        {!options.length && <span className="notes-mention-empty">{isEnglish ? 'No matching items' : 'لا توجد عناصر مطابقة'}</span>}
      </div>
    </div>}
    <Handle type="source" position={Position.Bottom} />
  </div>
}

const nodeTypes = { flowchartShape: FlowchartShape }
const cleanNodes = (nodes) => nodes.map((node) => {
  const { onLabelChange, onOpenMention, workspaceProjects, workspaceTasks, workspaceNotes, workspaceFlowcharts, ...data } = node.data || {}
  return { ...node, data }
})
const getNodeSize = (node) => ({
  width: node.data?.nodeWidth || node.width || (node.data?.shape === 'decision' ? 130 : 158),
  height: node.data?.nodeHeight || node.height || (node.data?.shape === 'decision' ? 100 : 76),
})

export default function FlowchartWorkspace({ language, workspaceId, flowcharts, activeFlowchartId, onActiveFlowchartChange, onFlowchartsChange, focusNodeId, onFocusNodeHandled, projects = [], tasks = [], notes = [], onOpenMention }) {
  const isEnglish = language === 'en'
  const text = (arabic, english) => isEnglish ? english : arabic
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('waraqa-flowchart-list-collapsed') === 'true')
  const [reactFlowInstance, setReactFlowInstance] = useState(null)
  const activeFlowchart = flowcharts.find((flowchart) => flowchart.id === activeFlowchartId) || flowcharts[0] || null

  useEffect(() => {
    if (!activeFlowchartId && flowcharts[0]) onActiveFlowchartChange(flowcharts[0].id)
    if (activeFlowchartId && !flowcharts.some((flowchart) => flowchart.id === activeFlowchartId)) onActiveFlowchartChange(flowcharts[0]?.id || null)
  }, [activeFlowchartId, flowcharts, onActiveFlowchartChange])

  useEffect(() => {
    if (!focusNodeId || !activeFlowchart?.nodes.some((node) => node.id === focusNodeId) || !reactFlowInstance) return
    const frame = requestAnimationFrame(() => {
      reactFlowInstance.setNodes((current) => current.map((node) => ({ ...node, selected: node.id === focusNodeId })))
      reactFlowInstance.fitView({ nodes: [{ id: focusNodeId }], padding: 0.65, duration: 450 })
      onFocusNodeHandled?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusNodeId, activeFlowchart?.id, reactFlowInstance, onFocusNodeHandled])

  const updateFlowchart = (transform) => {
    if (!activeFlowchart) return
    onFlowchartsChange(flowcharts.map((flowchart) => flowchart.id === activeFlowchart.id
      ? { ...transform(flowchart), updatedAt: Date.now() }
      : flowchart))
  }
  const createFlowchart = () => {
    const flowchart = {
      id: createId(), workspaceId, title: text('مخطط انسيابي جديد', 'New flowchart'),
      nodes: [], edges: [], createdAt: Date.now(), updatedAt: Date.now(),
    }
    onFlowchartsChange([flowchart, ...flowcharts])
    onActiveFlowchartChange(flowchart.id)
  }
  const deleteFlowchart = (flowchartId) => {
    const flowchart = flowcharts.find((item) => item.id === flowchartId)
    if (!flowchart) return
    const confirmed = window.confirm(text(`حذف «${flowchart.title}»؟`, `Delete “${flowchart.title}”?`))
    if (!confirmed) return
    const next = flowcharts.filter((item) => item.id !== flowchartId)
    onFlowchartsChange(next)
    if (activeFlowchartId === flowchartId) onActiveFlowchartChange(next[0]?.id || null)
  }
  const addShape = (shape) => {
    if (!activeFlowchart) return
    const count = activeFlowchart.nodes.length
    const node = {
      id: createId(),
      type: 'flowchartShape',
      position: { x: 120 + (count % 3) * 210, y: 110 + Math.floor(count / 3) * 145 },
      data: { shape: shape.type, label: '', ...measureShape(shape.type, '') },
    }
    updateFlowchart((flowchart) => ({ ...flowchart, nodes: [...flowchart.nodes, node] }))
  }
  const updateLabel = (nodeId, label, labelMentions = []) => updateFlowchart((flowchart) => ({
    ...flowchart,
    nodes: flowchart.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, label, labelMentions, ...measureShape(node.data.shape, label, labelMentions.length) } } : node),
  }))
  const displayNodes = activeFlowchart?.nodes.map((node) => ({
    ...node,
    data: { ...measureShape(node.data.shape, node.data.label, node.data.labelMentions?.length || 0), ...node.data, workspaceProjects: projects, workspaceTasks: tasks, workspaceNotes: notes, workspaceFlowcharts: flowcharts, onLabelChange: updateLabel, onOpenMention },
  })) || []
  const onNodesChange = (changes) => updateFlowchart((flowchart) => ({ ...flowchart, nodes: cleanNodes(applyNodeChanges(changes, displayNodes)) }))
  const onEdgesChange = (changes) => updateFlowchart((flowchart) => ({ ...flowchart, edges: applyEdgeChanges(changes, flowchart.edges) }))
  const onConnect = (connection) => updateFlowchart((flowchart) => ({
    ...flowchart,
    edges: addEdge({ ...connection, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#6c9a7d', strokeWidth: 2 } }, flowchart.edges),
  }))
  const autoArrange = () => {
    if (!activeFlowchart || activeFlowchart.nodes.length < 2) return
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
    graph.setGraph({ rankdir: 'TB', nodesep: 72, ranksep: 92, marginx: 44, marginy: 44 })
    activeFlowchart.nodes.forEach((node) => graph.setNode(node.id, getNodeSize(node)))
    activeFlowchart.edges.forEach((edge) => {
      if (edge.source && edge.target && graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target)
    })
    dagre.layout(graph)
    const graphNodes = activeFlowchart.nodes.map((node) => {
      const { x, y } = graph.node(node.id)
      const { width, height } = getNodeSize(node)
      return { ...node, position: { x: x - width / 2, y: y - height / 2 } }
    })
    const minX = Math.min(...graphNodes.map((node) => node.position.x))
    const minY = Math.min(...graphNodes.map((node) => node.position.y))
    updateFlowchart((flowchart) => ({
      ...flowchart,
      nodes: graphNodes.map((node) => ({
        ...node,
        position: { x: node.position.x - minX + 44, y: node.position.y - minY + 44 },
      })),
    }))
  }

  return <div className={`flowchart-workspace${sidebarCollapsed ? ' flowchart-sidebar-collapsed' : ''}`} dir={isEnglish ? 'ltr' : 'rtl'}>
    <aside className={`flowchart-list-panel${sidebarCollapsed ? ' is-collapsed' : ''}`}>
      <header className="flowchart-list-heading">
        <button type="button" className="flowchart-sidebar-toggle" aria-label={sidebarCollapsed ? text('إظهار المخططات', 'Show flowcharts') : text('طي المخططات', 'Collapse flowcharts')} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? text('إظهار المخططات', 'Show flowcharts') : text('طي المخططات', 'Collapse flowcharts')} onClick={() => {
          const next = !sidebarCollapsed
          localStorage.setItem('waraqa-flowchart-list-collapsed', String(next))
          setSidebarCollapsed(next)
        }}>{sidebarCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}</button>
        {!sidebarCollapsed && <>
          <div className="flowchart-list-title"><strong><GitBranch size={16} />{text('المخططات الانسيابية', 'Flowcharts')}</strong><small>{flowcharts.length} {text('مخطط', 'diagrams')}</small></div>
          <button type="button" className="flowchart-create-button" aria-label={text('مخطط جديد', 'New flowchart')} title={text('مخطط جديد', 'New flowchart')} onClick={createFlowchart}><Plus size={17} /></button>
        </>}
      </header>
      {!sidebarCollapsed && <nav className="flowchart-list-items" aria-label={text('قائمة المخططات', 'Flowchart list')}>
        {flowcharts.map((flowchart) => <div className={`flowchart-list-row${flowchart.id === activeFlowchart?.id ? ' is-active' : ''}`} key={flowchart.id}>
          <button type="button" className="flowchart-list-select" aria-current={flowchart.id === activeFlowchart?.id ? 'page' : undefined} onClick={() => onActiveFlowchartChange(flowchart.id)}>
            <GitBranch size={15} /><span>{flowchart.title}</span><small>{flowchart.nodes.length}</small>
          </button>
          <button type="button" className="flowchart-list-delete" aria-label={`${text('حذف', 'Delete')} ${flowchart.title}`} title={text('حذف المخطط', 'Delete flowchart')} onClick={() => deleteFlowchart(flowchart.id)}><Trash2 size={14} /></button>
        </div>)}
        {!flowcharts.length && <div className="flowchart-list-empty">{text('أنشئ أول مخطط انسيابي للبدء.', 'Create your first flowchart to get started.')}</div>}
      </nav>}
    </aside>
    <main className="flowchart-main">
      {activeFlowchart ? <>
        <header className="flowchart-document-heading">
          <div><span><GitBranch size={19} /></span><input aria-label={text('اسم المخطط', 'Flowchart name')} value={activeFlowchart.title} onChange={(event) => updateFlowchart((flowchart) => ({ ...flowchart, title: event.target.value }))} /></div>
        </header>
        <section className="flowchart-builder">
          <div className="flowchart-shape-toolbar" role="toolbar" aria-label={text('أشكال المخطط الانسيابي', 'Flowchart shapes')}>
            <div className="flowchart-toolbar-heading"><strong>{text('الأشكال', 'Shapes')}</strong><span>{text('اضغط لإضافة شكل', 'Click to add')}</span></div>
            {shapeOptions.map((shape) => {
              const Icon = shape.icon
              return <button type="button" className={`flowchart-shape-button flowchart-tool-${shape.type}`} key={shape.type} onClick={() => addShape(shape)} title={text(shape.title[0], shape.title[1])}>
                <span className="flowchart-tool-icon"><Icon size={17} /></span><span>{text(shape.title[0], shape.title[1])}</span>
              </button>
            })}
            <button type="button" className="flowchart-layout-button" onClick={autoArrange} disabled={!activeFlowchart.nodes.length} title={text('ترتيب المخطط تلقائيًا', 'Arrange flowchart automatically')}>
              <AlignVerticalJustifyCenter size={17} /><span>{text('ترتيب تلقائي', 'Auto arrange')}</span>
            </button>
          </div>
          <div className="flowchart-canvas">
            <ReactFlow
              nodes={displayNodes}
              edges={activeFlowchart.edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeContextMenu={(event, node) => {
                event.preventDefault()
                updateFlowchart((flowchart) => ({
                  ...flowchart,
                  nodes: flowchart.nodes.filter((item) => item.id !== node.id),
                  edges: flowchart.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
                }))
              }}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              deleteKeyCode={['Backspace', 'Delete']}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#cbd8ce" gap={22} size={1} />
              <Controls />
            </ReactFlow>
            {!activeFlowchart.nodes.length && <div className="flowchart-canvas-hint" aria-hidden="true">{text('اختَر شكلًا من الشريط لإضافته هنا', 'Choose a shape from the toolbar to add it here')}</div>}
          </div>
        </section>
      </> : <section className="flowchart-empty-state">
        <span><GitBranch size={28} /></span>
        <h1>{text('ابدأ مخططك الانسيابي', 'Start a flowchart')}</h1>
        <p>{text('أنشئ مخططًا جديدًا ثم أضف الأشكال من شريط الأدوات.', 'Create a flowchart, then add shapes from the toolbar.')}</p>
        <button type="button" onClick={createFlowchart}><Plus size={17} />{text('إنشاء مخطط انسيابي', 'Create flowchart')}</button>
      </section>}
    </main>
  </div>
}
