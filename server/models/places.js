// Real places for physical classes: searching OneMap, and checking that the place the browser
// sends back is one OneMap really knows. The settings are in config/places.js.
//
// A place, as the rest of the app uses it:
//   { name: 'BISHAN PUBLIC LIBRARY', address: '5 BISHAN PLACE ... SINGAPORE 579841',
//     postal: '579841', lat: 1.3508, lng: 103.8486, region: 'Central' }
//
// Here the SERVER calls another website, with fetch() (built into Node 18
// and newer; the server has no Axios). The browser never talks to OneMap itself: it asks our
// server, so a OneMap login (if one is ever needed) never reaches the browser.
// AbortSignal.timeout() gives up on OneMap after a few seconds instead of waiting forever.
import { ONEMAP_URL, SINGAPORE_BOX, MATCH_METRES } from '../config/places.js'
import { regionOfPoint } from '../config/skills.js'

const WAIT_MS = 8000 // how long to wait for OneMap

// ---------- The OneMap login (only used when ONEMAP_EMAIL and ONEMAP_PASSWORD are set) ----------
let token = ''
let tokenExpires = 0 // a time in milliseconds, like Date.now()

// -> the token to send, or '' when there is no OneMap account
async function getToken() {
  const email = process.env.ONEMAP_EMAIL || ''
  const password = process.env.ONEMAP_PASSWORD || ''
  if (email === '' || password === '') return ''

  // keep using the same token until an hour before it runs out
  if (token !== '' && Date.now() < tokenExpires - 60 * 60 * 1000) return token

  const response = await fetch(ONEMAP_URL + '/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password }),
    signal: AbortSignal.timeout(WAIT_MS),
  })
  if (!response.ok) throw new Error('OneMap login failed (' + response.status + ')')
  const data = await response.json()

  token = typeof data.access_token === 'string' ? data.access_token : ''
  const expires = Number(data.expiry_timestamp) * 1000 // OneMap gives seconds
  tokenExpires = Number.isNaN(expires) ? Date.now() + 24 * 60 * 60 * 1000 : expires
  return token
}

// ---------- Small helpers ----------

// OneMap writes 'NIL' when it has nothing for a field
function cleanText(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text === 'NIL' ? '' : text
}

export function insideSingapore(lat, lng) {
  return lat >= SINGAPORE_BOX.south && lat <= SINGAPORE_BOX.north && lng >= SINGAPORE_BOX.west && lng <= SINGAPORE_BOX.east
}

// Metres between two points. 1 degree is about 111 km, close enough for distances this small.
function metresBetween(a, b) {
  const dLat = (a.lat - b.lat) * 111000
  const dLng = (a.lng - b.lng) * 111000
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

// One OneMap result -> a place, or null if it cannot be used (no position, outside Singapore...)
function toPlace(result) {
  if (typeof result !== 'object' || result === null) return null
  const lat = Number(result.LATITUDE)
  // older OneMap answers spell it LONGTITUDE
  const lng = Number(result.LONGITUDE !== undefined ? result.LONGITUDE : result.LONGTITUDE)
  if (Number.isNaN(lat) || Number.isNaN(lng) || !insideSingapore(lat, lng)) return null

  const address = cleanText(result.ADDRESS)
  const name = cleanText(result.BUILDING) || cleanText(result.SEARCHVAL) || address
  if (name === '' || address === '') return null

  return {
    name: name.slice(0, 100),
    address: address.slice(0, 200),
    postal: cleanText(result.POSTAL).slice(0, 6),
    lat: lat,
    lng: lng,
    region: regionOfPoint(lat, lng),
  }
}

// ---------- Searching ----------
// The same search is often made twice (while typing, and again when the course is saved),
// so answers are remembered for a few minutes. That also keeps us well inside OneMap's limits.
const CACHE_MS = 10 * 60 * 1000
const CACHE_SIZE = 300
let cache = new Map() // typed text -> { places, savedAt }

// typed = a postal code, building name or street -> the places OneMap found (its first page)
// Throws if OneMap cannot be reached (the routes turn that into a friendly message).
export async function searchPlaces(typed) {
  const key = typed.trim().toLowerCase()
  const saved = cache.get(key)
  if (saved && Date.now() - saved.savedAt < CACHE_MS) return saved.places

  const url = ONEMAP_URL + '/api/common/elastic/search?searchVal=' + encodeURIComponent(key) +
    '&returnGeom=Y&getAddrDetails=Y&pageNum=1'
  const headers = {}
  const login = await getToken()
  if (login !== '') headers.Authorization = 'Bearer ' + login

  const response = await fetch(url, { headers: headers, signal: AbortSignal.timeout(WAIT_MS) })
  if (response.status === 401 || response.status === 403) {
    throw new Error('OneMap refused the search (' + response.status + '). It may need a login: see config/places.js')
  }
  if (!response.ok) throw new Error('OneMap answered ' + response.status)
  const data = await response.json()

  const places = []
  const results = Array.isArray(data.results) ? data.results : []
  for (const result of results) {
    const place = toPlace(result)
    if (place === null) continue
    // the same place can come back more than once (e.g. one result per entrance)
    let repeat = false
    for (const p of places) {
      if (p.name === place.name && p.address === place.address) repeat = true
    }
    if (!repeat) places.push(place)
  }

  if (cache.size >= CACHE_SIZE) cache = new Map() // simple: start again when it is full
  cache.set(key, { places: places, savedAt: Date.now() })
  return places
}

// ---------- Checking a place sent by the browser ----------
// The browser sends back the place the teacher picked from the search results. Anyone can send
// made-up numbers, so OneMap is asked again, and the place is kept only if a real result sits at
// the same spot. -> OneMap's copy of the place (never the browser's), or null.
// Throws if OneMap cannot be reached.
export async function verifyPlace(picked) {
  if (typeof picked !== 'object' || picked === null) return null
  if (typeof picked.lat !== 'number' || typeof picked.lng !== 'number') return null
  if (!insideSingapore(picked.lat, picked.lng)) return null

  const name = typeof picked.name === 'string' ? picked.name.trim() : ''
  const postal = typeof picked.postal === 'string' ? picked.postal.trim() : ''

  // 1. Search for the name that was picked: the very same place should come back.
  if (name !== '' && name.length <= 100) {
    for (const place of await searchPlaces(name)) {
      if (place.name === name && metresBetween(place, picked) <= MATCH_METRES) return place
    }
  }

  // 2. Otherwise search for the postal code and take the nearest result at that spot.
  if (postal !== '' && postal.length <= 6) {
    let best = null
    let bestMetres = MATCH_METRES
    for (const place of await searchPlaces(postal)) {
      const metres = metresBetween(place, picked)
      if (metres <= bestMetres) {
        best = place
        bestMetres = metres
      }
    }
    return best
  }
  return null
}
