// The settings for the meeting-place search on the teach form (see models/places.js).
//
// The search uses OneMap, the Singapore government's map service. OneMap only knows
// Singapore addresses, so a place outside Singapore can never be picked.
//
// The search should work without an account. If OneMap ever starts refusing it (the server
// log then says "OneMap refused the search"), register for free at onemap.gov.sg and put the
// login in server/.env:
//   ONEMAP_EMAIL=you@example.com
//   ONEMAP_PASSWORD=your-onemap-password
// The server then asks OneMap for a token (it lasts 3 days) and sends it with every search.

// Where OneMap is. Only changed for testing.
export const ONEMAP_URL = process.env.ONEMAP_URL || 'https://www.onemap.gov.sg'

// A box around Singapore. A place outside it is refused, whatever the browser sends.
export const SINGAPORE_BOX = { south: 1.15, north: 1.48, west: 103.6, east: 104.1 }

// When a course is saved, the place that was picked must match a real search result this closely
export const MATCH_METRES = 50

export const MIN_SEARCH_LENGTH = 2 // wait for a couple of letters before searching
export const MAX_SEARCH_LENGTH = 60
export const MAX_RESULTS = 8
