export const FLOWCHARTS_STORAGE_KEY = 'waraqa-flowcharts'

export function readFlowcharts() {
  try {
    const flowcharts = JSON.parse(localStorage.getItem(FLOWCHARTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(flowcharts)) return []
    return flowcharts.filter((flowchart) => flowchart && typeof flowchart.id === 'string' && typeof flowchart.workspaceId === 'string')
      .map((flowchart) => ({
        ...flowchart,
        title: typeof flowchart.title === 'string' ? flowchart.title : 'Flowchart',
        nodes: Array.isArray(flowchart.nodes) ? flowchart.nodes : [],
        edges: Array.isArray(flowchart.edges) ? flowchart.edges : [],
        updatedAt: Number.isFinite(flowchart.updatedAt) ? flowchart.updatedAt : Date.now(),
      }))
  } catch (error) {
    console.error('Could not read saved flowcharts.', error)
    return []
  }
}
