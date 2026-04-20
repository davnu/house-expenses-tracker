import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

function documentRef(houseId: string, documentId: string, fileName: string) {
  return ref(storage, `houses/${houseId}/documents/${documentId}/${fileName}`)
}

function thumbnailRef(houseId: string, documentId: string) {
  return ref(storage, `houses/${houseId}/documents/${documentId}/thumb.jpg`)
}

export async function uploadDocument(
  houseId: string,
  documentId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const storageRef = documentRef(houseId, documentId, file.name)
  // See firebase-attachment-store.uploadAttachment for rationale: resumable
  // uploads give us bytesTransferred/totalBytes for real progress UI, which
  // matters once per-file sizes approach 25 MB on mobile connections.
  const task = uploadBytesResumable(storageRef, file, { cacheControl: 'private, max-age=86400' })
  if (onProgress) {
    task.on('state_changed', (snap) => {
      const fraction = snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0
      onProgress(fraction)
    })
  }
  await task
  return getDownloadURL(storageRef)
}

export async function uploadDocumentThumbnail(
  houseId: string,
  documentId: string,
  thumbnailBlob: Blob,
): Promise<string> {
  const storageRef = thumbnailRef(houseId, documentId)
  await uploadBytes(storageRef, thumbnailBlob, {
    cacheControl: 'private, max-age=86400',
    contentType: 'image/jpeg',
  })
  return getDownloadURL(storageRef)
}

export async function deleteDocumentFile(
  houseId: string,
  documentId: string,
  fileName: string
): Promise<void> {
  await Promise.all([
    deleteObject(documentRef(houseId, documentId, fileName)).catch(() => {}),
    deleteObject(thumbnailRef(houseId, documentId)).catch(() => {}),
  ])
}

export async function deleteDocumentFiles(
  houseId: string,
  documents: Array<{ id: string; name: string }>
): Promise<void> {
  await Promise.all(
    documents.map((d) => deleteDocumentFile(houseId, d.id, d.name))
  )
}
