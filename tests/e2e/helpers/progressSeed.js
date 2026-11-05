// Test data for the Progress page end-to-end tests (progress-*.spec.js).
//
// It uses the server's own Firebase admin access (server/firebaseKey.json must be there, see
// the README), so the tests always start from the same state: a finished course taught by the
// test instructor, with the test student on it. Everything has a fixed "zz-e2e-progress" id
// and is deleted again afterwards, so the tests can be run any number of times.
// (Same idea as cancel-refund.spec.js.)

// The demo accounts from the README. Set E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD /
// E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD to use other accounts.
export const teacher = {
  email: process.env.E2E_TEACHER_EMAIL || 'make@gmail.com',
  password: process.env.E2E_TEACHER_PASSWORD || 'iammake',
}
export const student = {
  email: process.env.E2E_STUDENT_EMAIL || 'demo5@gmail.com',
  password: process.env.E2E_STUDENT_PASSWORD || 'iamdemo5',
}

// Each spec file gets its own course (Playwright runs the files at the same time, and one
// file's clean-up must never remove the other's data): testCourse('student') / testCourse('instructor')
export function testCourse(key) {
  const offerId = 'zz-e2e-progress-' + key
  return {
    offerId,
    bookingId: offerId + '-booking',
    title: 'zz E2E Juggling Basics (' + key + ')',
  }
}

const HOUR = 60 * 60 * 1000

let admin = null
async function firebase() {
  if (!admin) admin = await import('../../../server/config/firebaseAdmin.js')
  return admin
}

export async function uidOf(email) {
  const { adminAuth } = await firebase()
  return (await adminAuth.getUserByEmail(email)).uid
}

// A finished course: the instructor taught it two days ago and the student took it.
export async function seedCourse(course) {
  const { db } = await firebase()
  await cleanUp(course)
  const teacherUid = await uidOf(teacher.email)
  const studentUid = await uidOf(student.email)
  const teacherName = (await db.collection('users').doc(teacherUid).get()).data().name || 'Test Instructor'
  const studentName = (await db.collection('users').doc(studentUid).get()).data().name || 'Test Student'

  const startsAt = new Date(Date.now() - 48 * HOUR)
  await db.collection('offers').doc(course.offerId).set({
    teacherUid, teacherName, title: course.title, skill: 'Juggling', category: 'Sports',
    creditCost: 1, sessionDurationMinutes: 60, mode: 'online', stages: [{ name: 'Three-ball cascade' }], slots: [],
  })
  await db.collection('bookings').doc(course.bookingId).set({
    offerId: course.offerId, teacherUid, teacherName, learnerUid: studentUid, learnerName: studentName,
    title: course.title, skill: 'Juggling', category: 'Sports', status: 'finished',
    startsAt: startsAt.toISOString(), finishAfter: new Date(startsAt.getTime() + HOUR).toISOString(),
    finishedAt: new Date(startsAt.getTime() + 2 * HOUR).toISOString(), creditCost: 1, stageNames: ['Three-ball cascade'],
  })
  return { course, teacherUid, studentUid, teacherName, studentName }
}

// An assignment for the student, due in `dueInHours`.
export async function seedAssignment(id, title, people, dueInHours = 72) {
  const { db } = await firebase()
  await db.collection('assignments').doc(id).set({
    offerId: people.course.offerId, teacherUid: people.teacherUid, teacherName: people.teacherName,
    courseTitle: people.course.title, skill: 'Juggling', category: 'Sports', title,
    instructions: 'Film yourself doing 20 catches of the three-ball cascade.',
    dueAt: new Date(Date.now() + dueInHours * HOUR).toISOString(),
    learnerUids: [people.studentUid], learnerNames: { [people.studentUid]: people.studentName },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
}

// The student's work on that assignment (one photo and one video link), waiting for review.
export async function seedSubmission(assignmentId, people, photoDataUrl) {
  const { db } = await firebase()
  const subId = assignmentId + '_' + people.studentUid
  const mediaId = people.course.offerId + '-photo'
  const now = new Date().toISOString()
  await db.collection('progressMedia').doc(mediaId).set({
    submissionId: subId, assignmentId, learnerUid: people.studentUid, teacherUid: people.teacherUid,
    dataUrl: photoDataUrl, chars: photoDataUrl.length, createdAt: now,
  })
  await db.collection('submissions').doc(subId).set({
    assignmentId, offerId: people.course.offerId, teacherUid: people.teacherUid, teacherName: people.teacherName,
    learnerUid: people.studentUid, learnerName: people.studentName,
    note: 'I managed 15 catches in a row!', links: ['https://youtu.be/dQw4w9WgXcQ'], mediaIds: [mediaId],
    status: 'submitted', submittedAt: now, firstSubmittedAt: now, stars: null, feedback: '', reviewedAt: '',
    redoNote: '', redoUntil: '', comments: [], learnerNews: false, teacherNews: false, updatedAt: now,
  })
  return subId
}

// Everything on the test course: its assignments (also the ones a test made in the browser),
// their work and photos, the mastery grade, the booking and the course.
export async function cleanUp(course) {
  const { db } = await firebase()
  const assignments = await db.collection('assignments').where('offerId', '==', course.offerId).get()
  const submissions = await db.collection('submissions').where('offerId', '==', course.offerId).get()
  const refs = [...assignments.docs.map((d) => d.ref), ...submissions.docs.map((d) => d.ref)]
  for (const sub of submissions.docs) {
    for (const mediaId of sub.data().mediaIds || []) refs.push(db.collection('progressMedia').doc(mediaId))
  }
  const records = await db.collection('masteryRecords').where('offerId', '==', course.offerId).get()
  refs.push(...records.docs.map((d) => d.ref))
  refs.push(db.collection('bookings').doc(course.bookingId), db.collection('offers').doc(course.offerId))
  const batch = db.batch()
  for (const ref of refs) batch.delete(ref)
  await batch.commit()
}

// log in through the real login page and wait for Home
export async function logIn(page, account) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.waitForURL(/\/home/)
}
