import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../config/firebaseAdmin.js'

export async function getUsersOfSession(sessionId) {
  const snapshot = await db.collection('sessions').doc(sessionId).get()
  if (!snapshot.exists) {
    return []
  }
  return snapshot.data().participants || []
}

export async function addUserToSession(sessionId, uid) {
  await db.collection('sessions').doc(sessionId).update({
    participants: FieldValue.arrayUnion(uid),
  })
}

export async function removeUserFromSession(sessionId, uid) {
  await db.collection('sessions').doc(sessionId).update({
    participants: FieldValue.arrayRemove(uid),
  })
}