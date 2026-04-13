import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

function attachmentRef(houseId: string, attachmentId: string, fileName: string) {
  return ref(storage, `houses/${houseId}/attachments/${attachmentId}/${fileName}`)
}

function thumbnailRef(houseId: string, attachmentId: string) {
  return ref(storage, `houses/${houseId}/attachments/${attachmentId}/thumb.jpg`)
}

export async function uploadAttachment(
  houseId: string,
  attachmentId: string,
  file: File
): Promise<string> {
  const storageRef = attachmentRef(houseId, attachmentId, file.name)
  await uploadBytes(storageRef, file, { cacheControl: 'private, max-age=86400' })
  return getDownloadURL(storageRef)
}

export async function uploadAttachmentThumbnail(
  houseId: string,
  attachmentId: string,
  thumbnailBlob: Blob,
): Promise<string> {
  const storageRef = thumbnailRef(houseId, attachmentId)
  await uploadBytes(storageRef, thumbnailBlob, {
    cacheControl: 'private, max-age=86400',
    contentType: 'image/jpeg',
  })
  return getDownloadURL(storageRef)
}

export async function deleteAttachment(
  houseId: string,
  attachmentId: string,
  fileName: string
): Promise<void> {
  await Promise.all([
    deleteObject(attachmentRef(houseId, attachmentId, fileName)).catch(() => {}),
    deleteObject(thumbnailRef(houseId, attachmentId)).catch(() => {}),
  ])
}

export async function deleteAttachments(
  houseId: string,
  attachments: Array<{ id: string; name: string }>
): Promise<void> {
  await Promise.all(
    attachments.map((a) => deleteAttachment(houseId, a.id, a.name))
  )
}
