// Reports that members file from the Reports page: a problem with a user, a course,
// the website, or anything else. (Reporting one chat message is models/messageReports.js,
// and reporting a booking is "Report a problem" in models/bookings.js.)
//
// A report is one document in 'reports':
//
//   { reporterUid, reporterName, title, type, description,
//     status, adminNote, createdAt, updatedAt, seenByReporter }
//
//   type            'user', 'course', 'website' or 'other'
//   status          'open' when filed, then 'in-review' or 'resolved' (set by an admin)
//   adminNote       what the admin says back ('' until they write something)
//   seenByReporter  false after an admin changes the report, until the reporter opens it.
//                   The Reports page shows a "!" on reports that have news.
import { db } from '../config/firebaseAdmin.js'
import { addDoc, findDocsWhereEquals, getAllDocs } from './dbQuery.js'

export const REPORT_TYPES = ['user', 'course', 'website', 'other']
export const REPORT_STATUSES = ['open', 'in-review', 'resolved']
export const MAX_TITLE_LENGTH = 100
export const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_NOTE_LENGTH = 500

function fail(status, message) {
  return { status: status, error: message }
}

// newest news first
function byLastUpdated(a, b) {
  return (a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1
}

export async function createReport(uid, title, type, description) {
  const userSnap = await db.collection('users').doc(uid).get()
  const user = userSnap.exists ? userSnap.data() : {}

  const now = new Date().toISOString()
  const report = {
    reporterUid: uid,
    reporterName: user.name || user.email || '',
    title: title,
    type: type,
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
