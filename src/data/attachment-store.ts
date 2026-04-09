const DB_NAME = 'house-expenses-attachments'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then((db) => {
    const transaction = db.transaction(STORE_NAME, mode)
    return transaction.objectStore(STORE_NAME)
  })
}

export async function saveAttachmentBlob(id: string, blob: Blob): Promise<void> {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const request = store.put(blob, id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const store = await tx('readonly')
  return new Promise((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteAttachmentBlob(id: string): Promise<void> {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteAttachmentBlobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const store = await tx('readwrite')
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve, reject) => {
          const request = store.delete(id)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
    )
  )
}
