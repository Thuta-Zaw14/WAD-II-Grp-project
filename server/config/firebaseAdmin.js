import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const serviceAccount = JSON.parse(
  readFileSync(new URL('../firebaseKey.json', import.meta.url))
)

initializeApp({ credential: cert(serviceAccount) })

export const adminAuth = getAuth()
export const db = getFirestore() // our database