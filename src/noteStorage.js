export const NOTES_STORAGE_KEY = 'waraqa-standalone-notes'
export const OPEN_NOTES_STORAGE_KEY = 'waraqa-open-notes'

export function readStandaloneNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]')
    return Array.isArray(saved)
      ? saved.filter((note) => note && typeof note.id === 'string'
        && typeof note.title === 'string'
        && typeof note.content === 'string'
        && Number.isFinite(note.updatedAt)
        && !Number.isNaN(new Date(note.updatedAt).getTime()))
        .map((note) => ({
          ...note,
          pages: Array.isArray(note.pages)
            ? note.pages.filter((page) => typeof page === 'string')
            : [note.content],
        }))
        .map((note) => ({ ...note, pages: note.pages.length ? note.pages : [''] }))
      : []
  } catch (error) {
    console.error('Could not read saved notes.', error)
    return []
  }
}

export function readOpenStandaloneNoteIds(notes) {
  try {
    const saved = localStorage.getItem(OPEN_NOTES_STORAGE_KEY)
    if (saved === null) return notes.map((note) => note.id)
    const noteIds = new Set(notes.map((note) => note.id))
    const openIds = JSON.parse(saved)
    return Array.isArray(openIds) ? openIds.filter((id) => typeof id === 'string' && noteIds.has(id)) : []
  } catch (error) {
    console.error('Could not read open note tabs.', error)
    return notes.map((note) => note.id)
  }
}
