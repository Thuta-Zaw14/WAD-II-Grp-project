import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

// On your own computer the key is the file server/firebaseKey.json.
// On the hosting site there is no such file (it is never committed), so the same key is pasted
// into an environment variable called FIREBASE_KEY_JSON instead.
let serviceAccount
if (process.env.FIREBASE_KEY_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON)
} else {
  serviceAccount = JSON.parse(
    readFileSync(new URL('../firebaseKey.json', import.meta.url))
  )
}

initializeApp({ credential: cert(serviceAccount) })

export const adminAuth = getAuth()
export const db = getFirestore() // our database