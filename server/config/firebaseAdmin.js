import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'node:fs'

const serviceAccount = JSON.parse(
  readFileSync(new URL('../firebaseKey.json', import.meta.url))
)

initializeApp({ credential: cert(serviceAccount) })

export const adminAuth = getAuth()