// Run ONCE with:  npm run clean-demo   (from the server folder), then delete this file.
// Deletes the old demo courses that the old seed script added. They have no real teacher
// (teacherUid is 'seed' or missing), so nobody could be paid for them and they cannot be booked.
import { db } from '../config/firebaseAdmin.js'

const snapshot = await db.collection('offers').get()

let deleted = 0
for (const doc of snapshot.docs) {
  const teacherUid = doc.data().teacherUid
  if (!teacherUid || teacherUid === 'seed') {
    await doc.ref.delete()
    deleted++
  }
}

console.log('Deleted ' + deleted + ' demo course(s), kept ' + (snapshot.size - deleted))
process.exit(0)
