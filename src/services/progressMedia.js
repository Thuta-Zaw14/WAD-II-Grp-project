import { getProgressMedia } from './api'

// The photos of homework are only sent to the student who took them and their instructor, so
// they are fetched with the login token (an <img src> could not send it). Each photo is fetched
// once and kept here while the app is open: going back to a page shows it straight away.
const cache = new Map() // mediaId -> Promise of the data: address

export function loadMedia(mediaId) {
  if (!cache.has(mediaId)) {
    const request = getProgressMedia(mediaId).then((media) => media.dataUrl)
    // a failed request is forgotten, so the next try asks again
    request.catch(() => cache.delete(mediaId))
    cache.set(mediaId, request)
  }
  return cache.get(mediaId)
}

// a photo the browser just sent: keep it, so it is not downloaded again right after
export function rememberMedia(mediaId, dataUrl) {
  cache.set(mediaId, Promise.resolve(dataUrl))
}

export function clearMediaCache() {
  cache.clear()
}
