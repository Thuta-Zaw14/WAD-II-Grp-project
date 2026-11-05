// Makes a photo small enough to save in Firestore (the free Spark plan has no Firebase Storage,
// and one Firestore document holds at most 1 MiB). A phone photo of 4 MB usually ends up around
// 150-300 kB here, which still looks sharp on screen.
//
// -> "data:image/jpeg;base64,..." (a picture written as text)
export const MAX_DATA_URL_CHARS = 850 * 1000 // a little under the server's limit (progressRules.js)
export const MAX_PICK_MB = 15 // bigger files are refused straight away

// try big and sharp first, then smaller and softer until it fits
const ATTEMPTS = [
  { side: 1600, quality: 0.8 },
  { side: 1280, quality: 0.75 },
  { side: 1024, quality: 0.65 },
  { side: 800, quality: 0.55 },
]

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(file.name + ' could not be opened. Try a JPG or PNG photo.'))
    }
    img.src = url
  })
}

export async function compressImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error((file && file.name ? file.name : 'That file') + ' is not a photo.')
  }
  if (file.size > MAX_PICK_MB * 1024 * 1024) {
    throw new Error(file.name + ' is too large (max ' + MAX_PICK_MB + ' MB).')
  }

  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  for (const attempt of ATTEMPTS) {
    const scale = Math.min(1, attempt.side / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    context.fillStyle = '#ffffff' // a see-through PNG gets a white background instead of black
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', attempt.quality)
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl
  }
  throw new Error(file.name + ' is too detailed to upload. Try a smaller photo.')
}
