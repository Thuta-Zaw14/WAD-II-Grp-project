import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase'

async function uploadOne(file, uid) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `skills/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
  const fileRef = storageRef(storage, path)

  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return { url, path, type: file.type.startsWith('video/') ? 'video' : 'image' }
}

// Takes picker items: already-saved ones ({url,path,type}) pass through,
// new ones ({file,...}) are uploaded. Newly uploaded paths are pushed to
// `uploadedPaths` so the caller can clean up if the save later fails.
export async function uploadPending(items, uid, uploadedPaths) {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (!item.file) return { url: item.url, path: item.path, type: item.type }
      const saved = await uploadOne(item.file, uid)
      uploadedPaths.push(saved.path)
      return saved
    })
  )
  const failed = results.find((r) => r.status === 'rejected')
  if (failed) throw failed.reason
  return results.map((r) => r.value)
}

export function collectPaths(media = [], stages = []) {
  return [
    ...media.map((m) => m.path),
    ...stages.flatMap((s) => (s.media || []).map((m) => m.path)),
  ]
}

export async function deleteMany(paths) {
  await Promise.allSettled(paths.map((p) => deleteObject(storageRef(storage, p))))
}