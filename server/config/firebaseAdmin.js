import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const serviceAccount = JSON.parse(
    readFileSync(
        new URL('../firebaseKey.json', import.meta.url),
        'utf8'
    )
)

const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount)
    })

export const adminAuth = getAuth(app)
export const db = getFirestore(app)
