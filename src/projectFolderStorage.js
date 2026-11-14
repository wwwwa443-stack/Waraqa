const DATABASE_NAME = 'waraqa-project-settings'
const STORE_NAME = 'settings'
const HANDLE_KEY = 'projects-folder-handle'
let databasePromise

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open project folder settings.'))
  })
  return databasePromise
}

async function accessStore(mode, action) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, mode)
  const store = transaction.objectStore(STORE_NAME)
  const request = action(store)
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not access project folder settings.'))
  })
}

export const readProjectsFolderHandle = () => accessStore('readonly', (store) => store.get(HANDLE_KEY))
export const saveProjectsFolderHandle = (handle) => accessStore('readwrite', (store) => store.put(handle, HANDLE_KEY))
