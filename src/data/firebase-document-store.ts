import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

function documentRef(houseId: string, documentId: string, fileName: string) {
  return ref(storage, `houses/${houseId}/documents/${documentId}/${fileName}`)
}

export async function uploadDocument(
  houseId: string,
  documentId: string,
  file: File
): Promise<string> {
  const storageRef = documentRef(houseId, documentId, file.name)
  await uploadBytes(storageRef, file, { cacheControl: 'private, max-age=86400' })
  return getDownloadURL(storageRef)
}

export async function deleteDocumentFile(
  houseId: string,
  documentId: string,
  fileName: string
): Promise<void> {
  const storageRef = documentRef(houseId, documentId, fileName)
  try {
    await deleteObject(storageRef)
  } catch {
    // File may already be deleted
  }
}

export async function deleteDocumentFiles(
  houseId: string,
  documents: Array<{ id: string; name: string }>
): Promise<void> {
  await Promise.all(
    documents.map((d) => deleteDocumentFile(houseId, d.id, d.name))
  )
}
