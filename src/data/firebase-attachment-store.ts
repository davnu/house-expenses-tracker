import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

function attachmentRef(houseId: string, attachmentId: string, fileName: string) {
  return ref(storage, `houses/${houseId}/attachments/${attachmentId}/${fileName}`)
}

export async function uploadAttachment(
  houseId: string,
  attachmentId: string,
  file: File
): Promise<string> {
  const storageRef = attachmentRef(houseId, attachmentId, file.name)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function deleteAttachment(
  houseId: string,
  attachmentId: string,
  fileName: string
): Promise<void> {
  const storageRef = attachmentRef(houseId, attachmentId, fileName)
  try {
    await deleteObject(storageRef)
  } catch {
    // File may already be deleted
  }
}

export async function deleteAttachments(
  houseId: string,
  attachments: Array<{ id: string; name: string }>
): Promise<void> {
  await Promise.all(
    attachments.map((a) => deleteAttachment(houseId, a.id, a.name))
  )
}
