import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
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
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const storageRef = attachmentRef(houseId, attachmentId, file.name)
  // Resumable upload emits per-chunk progress via the state_changed observer.
  // With a 25 MB per-file cap, a 40-second upload with no UI feedback would
  // read as "app is frozen" on a slow connection. uploadBytesResumable is a
  // drop-in replacement that exposes bytesTransferred/totalBytes so callers
  // can render real progress without extra network roundtrips.
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

export async function uploadAttachmentThumbnail(
  houseId: string,
  attachmentId: string,
  thumbnailBlob: Blob,
): Promise<string> {
  const storageRef = thumbnailRef(houseId, attachmentId)
  // Thumbnails are ~3-8 KB — plain uploadBytes is enough; no progress needed.
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
