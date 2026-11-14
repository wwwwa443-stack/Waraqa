export const TASKS_STORAGE_KEY = 'waraqa-tasks'
export const TASK_LISTS_STORAGE_KEY = 'waraqa-task-lists'

export function readTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY) || '[]')
    if (!Array.isArray(tasks)) return []
    return tasks.filter((task) => task && typeof task.id === 'string' && typeof task.title === 'string')
      .map((task) => ({
        ...task,
        completed: Boolean(task.completed),
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
      }))
  } catch (error) {
    console.error('Could not read saved tasks.', error)
    return []
  }
}

export function readTaskLists() {
  try {
    const lists = JSON.parse(localStorage.getItem(TASK_LISTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(lists)) return []
    return lists.filter((list) => list && typeof list.id === 'string' && typeof list.workspaceId === 'string')
      .map((list) => ({ ...list, title: typeof list.title === 'string' ? list.title : 'مهامي' }))
  } catch (error) {
    console.error('Could not read saved task lists.', error)
    return []
  }
}
