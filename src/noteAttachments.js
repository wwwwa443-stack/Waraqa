const DATABASE_NAME = 'waraqa-note-attachments'
const STORE_NAME = 'files'
let databasePromise

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open attachment storage.'))
  })
  return databasePromise
}

export async function saveNoteAttachment(file) {
  const id = globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  await saveNoteAttachmentWithId(id, file)
  return { id, name: file.name, type: file.type, size: file.size }
}

export async function saveNoteAttachmentWithId(id, file) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).put({ id, name: file.name, type: file.type, size: file.size, blob: file })
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error || new Error('Could not save attachment.'))
    transaction.onabort = () => reject(transaction.error || new Error('Could not save attachment.'))
  })
  return { id, name: file.name, type: file.type, size: file.size }
}

export async function readNoteAttachment(id) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).get(id)
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Could not read attachment.'))
  })
}
