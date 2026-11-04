// Reports that members file from the Reports page: a problem with a user, a course,
// the website, or anything else. (Reporting one chat message is models/messageReports.js,
// and reporting a booking is "Report a problem" in models/bookings.js.)
//
// A report is one document in 'reports':
//
//   { reporterUid, reporterName, title, type, targetId, targetName, description,
//     status, adminNote, createdAt, updatedAt, seenByReporter }
//
//   type            'user', 'course', 'website' or 'other'
//   targetId        who or what the report is about: the uid of the user ('user' reports) or the
//                   id of the course ('course' reports); '' for the other types
//   targetName      their name or the course title, copied when the report is made
//   status          'open' when filed, then 'in-review' or 'resolved' (set by an admin)
//   adminNote       what the admin says back ('' until they write something)
//   seenByReporter  false after an admin changes the report, until the reporter opens it.
//                   The Reports page shows a "!" on reports that have news.
import { db } from '../config/firebaseAdmin.js'
import { addDoc, findDocsWhereEquals, getAllDocs } from './dbQuery.js'
import { slotMoment, finishTime } from './bookingRules.js'

export const REPORT_TYPES = ['user', 'course', 'website', 'other']
export const REPORT_STATUSES = ['open', 'in-review', 'resolved']
export const MAX_TITLE_LENGTH = 100
export const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_NOTE_LENGTH = 500
const MAX_SEARCH_RESULTS = 8

function fail(status, message) {
  return { status: status, error: message }
}

// newest news first
function byLastUpdated(a, b) {
  return (a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1
}

// ---------- Who or what a report is about ----------

// A course is "ongoing" while at least one of its start times has not finished yet
// (the start plus the lesson's length is still ahead). Courses that have not started count too.
function isOngoing(offer, now) {
  const lessonMinutes = Number.isInteger(offer.sessionDurationMinutes) ? offer.sessionDurationMinutes : 60
  for (const slot of offer.slots || []) {
    const startsAt = slotMoment(slot.date, slot.time)
    if (Number.isNaN(startsAt.getTime())) continue
    if (finishTime(startsAt, lessonMinutes) > now) return true
  }
  return false
}

// true if the words typed appear in the text, ignoring capitals
function contains(text, typed) {
  return (text || '').toLowerCase().includes(typed.toLowerCase())
}

// The search box on the report form: existing members by name, or ongoing courses by title
// or teacher. -> [{ id, name, detail }]  (never emails or other private fields)
export async function searchTargets(uid, type, typed) {
  const results = []
  if (type === 'user') {
    for (const user of await getAllDocs('users')) {
      if (user.id === uid || user.isBanned === true || !user.name) continue // not myself
      if (contains(user.name, typed)) {
        results.push({ id: user.id, name: user.name, detail: user.region ? user.region + ' region' : '' })
      }
    }
  } else if (type === 'course') {
    const now = new Date()
    for (const offer of await getAllDocs('offers')) {
      if (offer.teacherUid === uid || !isOngoing(offer, now)) continue // not my own courses
      const title = offer.title || offer.skill || ''
      if (contains(title, typed) || contains(offer.teacherName, typed)) {
        results.push({ id: offer.id, name: title, detail: 'Taught by ' + (offer.teacherName || 'unknown') })
      }
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name))
  return results.slice(0, MAX_SEARCH_RESULTS)
}

// Checks the user or course picked on the form really exists (and, for a course, is ongoing).
// -> { name } or { status, error }
export async function findTarget(uid, type, targetId) {
  if (type === 'user') {
    const snap = await db.collection('users').doc(targetId).get()
    if (!snap.exists || !snap.data().name || snap.data().isBanned === true) {
      return fail(400, 'Please pick a member from the search results.')
    }
    if (targetId === uid) return fail(400, "You can't report yourself.")
    return { name: snap.data().name }
  }
  const snap = await db.collection('offers').doc(targetId).get()
  if (!snap.exists) return fail(400, 'Please pick a course from the search results.')
  if (snap.data().teacherUid === uid) return fail(400, "You can't report your own course.")
  if (!isOngoing(snap.data(), new Date())) return fail(400, 'That course is no longer running.')
  return { name: snap.data().title || snap.data().skill || '' }
}

// target = { id, name } of the user or course ('' for website and other reports)
export async function createReport(uid, title, type, target, description) {
  const userSnap = await db.collection('users').doc(uid).get()
  const user = userSnap.exists ? userSnap.data() : {}

  const now = new Date().toISOString()
  const report = {
    reporterUid: uid,
    reporterName: user.name || user.email || '',
    title: title,
    type: type,
    targetId: target.id,
    targetName: target.name,
    description: description,
    status: 'open',
    adminNote: '',
    createdAt: now,
    updatedAt: now,
    seenByReporter: true, // nothing new yet
  }

  const result = await addDoc('reports', report)
  if (!result.status) return fail(500, 'Could not send your report. Please try again.')
  return { report: { id: result.id, ...report } }
}

export async function findMyReports(uid) {
  const result = await findDocsWhereEquals('reports', 'reporterUid', uid)
  if (!result.status) return fail(500, 'Could not load your reports.')
  return { reports: result.docs.sort(byLastUpdated) }
}

// The reporter opened a report, so its news has been seen
export async function markReportSeen(uid, reportId) {
  const ref = db.collection('reports').doc(reportId)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data().reporterUid !== uid) return fail(404, 'Report not found.')

  await ref.update({ seenByReporter: true })
  return { report: { id: reportId, ...snapshot.data(), seenByReporter: true } }
}

// ---------- Admins ----------

export async function findAllReports() {
  const reports = await getAllDocs('reports')
  return { reports: reports.sort(byLastUpdated) }
}

// An admin moves a report along and/or writes back. The reporter sees a "!" until they open it.
export async function updateReport(reportId, status, adminNote) {
  const ref = db.collection('reports').doc(reportId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return fail(404, 'Report not found.')

  const changes = {
    status: status,
    adminNote: adminNote,
    updatedAt: new Date().toISOString(),
    seenByReporter: false,
  }
  await ref.update(changes)
  return { report: { id: reportId, ...snapshot.data(), ...changes } }
}
