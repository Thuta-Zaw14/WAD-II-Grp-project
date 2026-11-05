import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { verifyAdmin } from '../middleware/verifyAdmin.js'
import { getAllDocs, findDocsWhereEquals } from '../models/dbQuery.js'
import { settleDispute } from '../models/bookings.js'
import { readMessagesAsAdmin } from '../models/chat.js'
import { handleMessageReport, readReportContext } from '../models/messageReports.js'
import { isValidId } from '../models/discussions.js'

// Everything an admin can do. Every route except /check also needs verifyAdmin, so the
// server says no to anyone whose profile does not have isAdmin: true. (The router guard in
// the browser only hides the pages; this is the real lock.)
const router = express.Router()

const maxWarningLength = 500
const maxNoteLength = 300

// A made-up id such as "a/b" would make Firestore throw (it reads it as a path), so ids like
// that get a plain 404 here, before any route runs. router.param is OUTSIDE THE SLIDES: it runs
// for every route in this file that has :uid or :id in its address.
router.param('uid', (req, res, next, value) => {
  if (!isValidId(value)) return res.status(404).json({ error: 'User not found.' })
  next()
})
router.param('id', (req, res, next, value) => {
  if (!isValidId(value)) return res.status(404).json({ error: 'Not found.' })
  next()
})

// ---------- Small helpers ----------

// A report is a booking that someone pressed "Report a problem" on. reportedBy stays on the
// booking after an admin settles it, so the report keeps counting against the other person.
function hasReport(booking) {
  return typeof booking.reportedBy === 'string' && booking.reportedBy !== ''
}

// One report, in the form the admin pages show it
function reportOf(booking) {
  const byStudent = booking.reportedBy === booking.learnerUid
  return {
    bookingId: booking.id,
    title: booking.title,
    slotDate: booking.slotDate,
    slotTime: booking.slotTime,
    creditCost: booking.creditCost,
    status: booking.status,
    learnerUid: booking.learnerUid,
    learnerName: booking.learnerName,
    teacherUid: booking.teacherUid,
    teacherName: booking.teacherName,
    reporterUid: booking.reportedBy,
    reporterName: byStudent ? booking.learnerName : booking.teacherName,
    reporterRole: byStudent ? 'student' : 'teacher',
    againstUid: byStudent ? booking.teacherUid : booking.learnerUid,
    againstName: byStudent ? booking.teacherName : booking.learnerName,
    reason: booking.reportReason || '',
    reportedAt: booking.reportedAt || '',
    resolution: booking.resolution || '', // '' while it is still open
    resolutionNote: booking.resolutionNote || '',
    resolvedAt: booking.resolvedAt || '',
  }
}

// A report on ONE message (see models/messageReports.js), in the form the admin pages show it
function messageReportOf(report) {
  return {
    id: report.id,
    kind: report.kind, // 'public' (a discussion post) or 'private' (a chat message)
    containerId: report.containerId,
    n: report.n,
    title: report.title || '',
    messageText: report.messageText || '',
    messageAt: report.messageAt || '',
    authorUid: report.authorUid,
    authorName: report.authorName || '',
    reporterUid: report.reporterUid,
    reporterName: report.reporterName || '',
    reason: report.reason || '',
    createdAt: report.createdAt || '',
    handledAt: report.handledAt || '',
    outcome: report.outcome || '', // '' while it waits, then 'dismissed' or 'actioned'
    removedMessage: report.removedMessage === true,
    warned: report.warned === true,
    banned: report.banned === true,
    note: report.note || '',
  }
}

// A dismissed report does not count against the person it was about
function countsAgainstAuthor(report) {
  return report.outcome !== 'dismissed'
}

// What happened to a booking report / a message report, in words (for the user's profile page)
function disputeOutcomeText(booking) {
  if (booking.resolution === 'teacher-paid') return 'Teacher paid'
  if (booking.resolution === 'student-refunded') return 'Student refunded'
  return 'Waiting for a decision'
}

function messageOutcomeText(report) {
  if (report.outcome === '') return 'Waiting for a decision'
  if (report.outcome === 'dismissed') return 'Dismissed'
  const done = []
  if (report.removedMessage) done.push('message removed')
  if (report.warned) done.push('warned')
  if (report.banned) done.push('banned')
  return 'Action taken: ' + done.join(', ')
}

// The rows of the "Report History" on a user's profile: both kinds of report, in one shape
function profileRowOfDispute(booking) {
  const report = reportOf(booking)
  return {
    ...report,
    type: 'dispute',
    key: 'd_' + booking.id,
    what: 'Booking problem',
    outcome: disputeOutcomeText(booking),
    outcomeNote: report.resolutionNote,
  }
}

function profileRowOfMessage(report) {
  return {
    type: 'message',
    key: 'm_' + report.id,
    reporterUid: report.reporterUid,
    reporterName: report.reporterName || '',
    reporterRole: '',
    title: report.title || '',
    what: report.kind === 'public' ? 'Discussion post' : 'Chat message',
    reason: report.reason || '',
    reportedAt: report.createdAt || '',
    outcome: messageOutcomeText(report),
    outcomeNote: report.note || '',
  }
}

// A report a member sent from the Reports page about this person ('user' reports only;
// models/reports.js). It counts against them whatever its status, like a booking report.
const memberReportStatusText = {
  open: 'Waiting for a decision',
  'in-review': 'Being looked at',
  resolved: 'Resolved',
}

function isUserReport(report) {
  return report.type === 'user' && typeof report.targetId === 'string' && report.targetId !== ''
}

function profileRowOfMemberReport(report) {
  return {
    type: 'member',
    key: 'r_' + report.id,
    reporterUid: report.reporterUid,
    reporterName: report.reporterName || '',
    reporterRole: '',
    title: report.title || '',
    what: 'Member report',
    reason: report.description || '',
    reportedAt: report.createdAt || '',
    outcome: memberReportStatusText[report.status] || 'Waiting for a decision',
    outcomeNote: report.adminNote || '',
  }
}

// only the skill NAMES, and only if the profile holds a proper list (old data may not)
function skillNames(list) {
  const names = []
  if (!Array.isArray(list)) return names
  for (const skill of list) {
    if (skill && typeof skill.name === 'string') names.push(skill.name)
  }
  return names
}

function warningsOf(user) {
  return Array.isArray(user.warnings) ? user.warnings : []
}

// ---------- Am I an admin? ----------
// Any signed-in person may ask. The answer is yes or no (the login page and the router guard use it).
router.get('/check', verifyToken, async (req, res) => {
  try {
    const profile = await db.collection('users').doc(req.user.uid).get()
    res.json({ isAdmin: profile.exists && profile.data().isAdmin === true })
  } catch (err) {
    console.log('admin check failed:', err.message)
    res.status(500).json({ error: 'Could not check admin access.' })
  }
})

// ---------- Users ----------

// Every user (admins are left out), the ones with the most reports first
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await getAllDocs('users')
    const bookings = await getAllDocs('bookings')
    const messageReports = await getAllDocs('messageReports')
    const memberReports = await getAllDocs('reports')

    const reportCounts = {} // uid -> how many reports were made against them
    for (const report of memberReports) {
      if (!isUserReport(report)) continue
      reportCounts[report.targetId] = (reportCounts[report.targetId] || 0) + 1
    }
    for (const booking of bookings) {
      if (!hasReport(booking)) continue
      const against = reportOf(booking).againstUid
      reportCounts[against] = (reportCounts[against] || 0) + 1
    }
    // A message counts once however many people reported it, so a crowd of (perhaps fake)
    // accounts reporting the same post cannot push someone's number up.
    const countedMessages = new Set()
    for (const report of messageReports) {
      if (!countsAgainstAuthor(report)) continue
      const messageKey = report.kind + '_' + report.containerId + '_' + report.n
      if (countedMessages.has(messageKey)) continue
      countedMessages.add(messageKey)
      reportCounts[report.authorUid] = (reportCounts[report.authorUid] || 0) + 1
    }

    const list = []
    for (const user of users) {
      if (user.isAdmin === true) continue
      list.push({
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        credits: user.credits || 0,
        isBanned: user.isBanned === true,
        warnings: warningsOf(user).length,
        reports: reportCounts[user.id] || 0,
        createdAt: user.createdAt || '',
      })
    }
    list.sort((a, b) => b.reports - a.reports || (a.name < b.name ? -1 : 1))

    res.json(list)
  } catch (err) {
    console.log('admin users failed:', err.message)
    res.status(500).json({ error: 'Could not load the users.' })
  }
})

// One user, with the warnings they were given, the reports made against them, and how many
// message reports they filed themselves (and how many of those an admin dismissed)
router.get('/users/:uid', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users').doc(req.params.uid).get()
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'User not found.' })
    }
    const user = snapshot.data()

    const asLearner = await findDocsWhereEquals('bookings', 'learnerUid', snapshot.id)
    const asTeacher = await findDocsWhereEquals('bookings', 'teacherUid', snapshot.id)
    if (!asLearner.status || !asTeacher.status) {
      return res.status(500).json({ error: 'Could not load the reports.' })
    }

    const aboutMessages = await findDocsWhereEquals('messageReports', 'authorUid', snapshot.id)
    const filedByThem = await findDocsWhereEquals('messageReports', 'reporterUid', snapshot.id)
    const aboutThem = await findDocsWhereEquals('reports', 'targetId', snapshot.id)
    if (!aboutMessages.status || !filedByThem.status || !aboutThem.status) {
      return res.status(500).json({ error: 'Could not load the reports.' })
    }

    // someone who files many reports that all get dismissed is easy to see from these two numbers
    let dismissedCount = 0
    for (const report of filedByThem.docs) {
      if (report.outcome === 'dismissed') dismissedCount++
    }

    // the bookings this person is in where the OTHER person pressed "Report a problem",
    // and the messages of theirs that somebody reported (unless an admin dismissed the report)
    const reports = []
    for (const booking of [...asLearner.docs, ...asTeacher.docs]) {
      if (!hasReport(booking)) continue
      if (reportOf(booking).againstUid === snapshot.id) reports.push(profileRowOfDispute(booking))
    }
    for (const report of aboutMessages.docs) {
      if (countsAgainstAuthor(report)) reports.push(profileRowOfMessage(report))
    }
    for (const report of aboutThem.docs) {
      if (isUserReport(report)) reports.push(profileRowOfMemberReport(report))
    }
    reports.sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1)) // newest first

    res.json({
      id: snapshot.id,
      name: user.name || '',
      email: user.email || '',
      bio: user.bio || '',
      region: user.region || '',
      credits: user.credits || 0,
      isBanned: user.isBanned === true,
      createdAt: user.createdAt || '',
      skillsTeach: skillNames(user.skillsTeach),
      skillsLearn: skillNames(user.skillsLearn),
      warnings: warningsOf(user),
      reports: reports,
      messageReportsFiled: filedByThem.docs.length,
      messageReportsDismissed: dismissedCount,
    })
  } catch (err) {
    console.log('admin user failed:', err.message)
    res.status(500).json({ error: 'Could not load this user.' })
  }
})

// Ban or unban (the two routes below share this).
// A banned person is stopped by verifyToken on their next request. Their existing bookings
// are left alone: their students can still report a problem, and you settle it in Disputes.
async function setBanned(req, res, banned) {
  try {
    if (req.params.uid === req.user.uid) {
      return res.status(400).json({ error: "You can't ban yourself." })
    }
    const userRef = db.collection('users').doc(req.params.uid)
    const snapshot = await userRef.get()
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'User not found.' })
    }
    if (snapshot.data().isAdmin === true) {
      return res.status(400).json({ error: "An admin can't be banned." })
    }

    await userRef.update({ isBanned: banned, updatedAt: new Date().toISOString() })
    res.json({ id: snapshot.id, isBanned: banned })
  } catch (err) {
    console.log('ban failed:', err.message)
    res.status(500).json({ error: 'Could not change this account. Please try again.' })
  }
}

router.put('/users/:uid/ban', verifyToken, verifyAdmin, (req, res) => setBanned(req, res, true))
router.put('/users/:uid/unban', verifyToken, verifyAdmin, (req, res) => setBanned(req, res, false))

// ---------- Warnings ----------
// A warning is { reason, createdAt, by }. The warned person sees it on their home page.
// (Read, change, write: fine for a tool only admins use. Two admins warning the SAME person
// at the very same moment could lose one.)
router.post('/users/:uid/warnings', verifyToken, verifyAdmin, async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    return res.status(400).json({ error: 'Please write the reason for the warning.' })
  }
  if (reason.length > maxWarningLength) {
    return res.status(400).json({ error: 'A warning must be ' + maxWarningLength + ' characters or fewer.' })
  }

  try {
    const userRef = db.collection('users').doc(req.params.uid)
    const snapshot = await userRef.get()
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const warning = { reason: reason, createdAt: new Date().toISOString(), by: req.user.uid }
    await userRef.update({ warnings: [...warningsOf(snapshot.data()), warning] })
    res.status(201).json({ warning: warning })
  } catch (err) {
    console.log('warn failed:', err.message)
    res.status(500).json({ error: 'Could not save the warning. Please try again.' })
  }
})

// Take a warning back (it is the number in the list, counting from 0)
router.delete('/users/:uid/warnings/:index', verifyToken, verifyAdmin, async (req, res) => {
  const index = Number(req.params.index)
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: 'That warning does not exist.' })
  }

  try {
    const userRef = db.collection('users').doc(req.params.uid)
    const snapshot = await userRef.get()
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const warnings = warningsOf(snapshot.data())
    if (index >= warnings.length) {
      return res.status(404).json({ error: 'That warning does not exist.' })
    }

    const kept = []
    for (let i = 0; i < warnings.length; i++) {
      if (i !== index) kept.push(warnings[i])
    }
    await userRef.update({ warnings: kept })
    res.json({ warnings: kept })
  } catch (err) {
    console.log('remove warning failed:', err.message)
    res.status(500).json({ error: 'Could not remove the warning. Please try again.' })
  }
})

// ---------- Disputes ----------

// Bookings someone reported: the open ones (status 'disputed'), and the last 20 settled ones
router.get('/disputes', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const bookings = await getAllDocs('bookings')

    const open = []
    const settled = []
    for (const booking of bookings) {
      if (!hasReport(booking)) continue
      if (booking.status === 'disputed') {
        open.push(reportOf(booking))
      } else if (booking.resolution) {
        settled.push(reportOf(booking))
      }
    }
    open.sort((a, b) => (a.reportedAt < b.reportedAt ? -1 : 1)) // oldest first: waiting longest
    settled.sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1)) // newest first

    res.json({ open: open, settled: settled.slice(0, 20) })
  } catch (err) {
    console.log('admin disputes failed:', err.message)
    res.status(500).json({ error: 'Could not load the disputes.' })
  }
})

// The private chat of a reported booking, so the admin can see what was said.
// (Only reported bookings: an admin cannot open anyone's chat.)
router.get('/disputes/:id/messages', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await readMessagesAsAdmin(req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    const messages = []
    for (const message of result.messages) {
      messages.push({
        n: message.n,
        role: message.senderRole,
        senderName: message.senderName,
        text: message.text,
        createdAt: message.createdAt,
      })
    }
    res.json({ messages: messages })
  } catch (err) {
    console.log('admin chat failed:', err.message)
    res.status(500).json({ error: 'Could not load the chat.' })
  }
})

// Settle one: { decision: 'pay-teacher' | 'refund-student', note }
router.post('/disputes/:id/settle', verifyToken, verifyAdmin, async (req, res) => {
  const decision = req.body.decision
  if (decision !== 'pay-teacher' && decision !== 'refund-student') {
    return res.status(400).json({ error: 'Choose pay-teacher or refund-student.' })
  }
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : ''
  if (note.length > maxNoteLength) {
    return res.status(400).json({ error: 'The note must be ' + maxNoteLength + ' characters or fewer.' })
  }

  try {
    const result = await settleDispute(req.user.uid, req.params.id, decision, note)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ report: reportOf(result.booking) })
  } catch (err) {
    console.log('settleDispute failed:', err.message)
    res.status(500).json({ error: 'Could not settle the dispute. Please try again.' })
  }
})

// ---------- Message reports ----------
// Reports on ONE message: a post in a public discussion or a message in a private chat.

// The ones waiting (oldest first) and the last 20 handled
router.get('/message-reports', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const reports = await getAllDocs('messageReports')

    const open = []
    const handled = []
    for (const report of reports) {
      if (report.handledAt) {
        handled.push(messageReportOf(report))
      } else {
        open.push(messageReportOf(report))
      }
    }
    open.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) // waiting longest first
    handled.sort((a, b) => (a.handledAt < b.handledAt ? 1 : -1)) // newest first

    res.json({ open: open, handled: handled.slice(0, 20) })
  } catch (err) {
    console.log('admin message reports failed:', err.message)
    res.status(500).json({ error: 'Could not load the message reports.' })
  }
})

// What was said around a reported message: the whole chat (private) or 5 posts before and after (public)
router.get('/message-reports/:id/context', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('messageReports').doc(req.params.id).get()
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Report not found.' })
    }
    const result = await readReportContext(snapshot.data())
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ messages: result.messages, reportedN: snapshot.data().n })
  } catch (err) {
    console.log('admin message context failed:', err.message)
    res.status(500).json({ error: 'Could not load the messages.' })
  }
})

// Decide one: { removeMessage: true/false, warning: '' or the text, ban: true/false, note }
// Choosing nothing dismisses the report (it then does not count against the author).
router.post('/message-reports/:id/handle', verifyToken, verifyAdmin, async (req, res) => {
  for (const field of ['removeMessage', 'ban']) {
    if (req.body[field] !== undefined && typeof req.body[field] !== 'boolean') {
      return res.status(400).json({ error: field + ' must be true or false.' })
    }
  }
  for (const field of ['warning', 'note']) {
    if (req.body[field] !== undefined && typeof req.body[field] !== 'string') {
      return res.status(400).json({ error: field + ' must be text.' })
    }
  }
  const warning = (req.body.warning || '').trim()
  const note = (req.body.note || '').trim()
  if (warning.length > maxWarningLength) {
    return res.status(400).json({ error: 'A warning must be ' + maxWarningLength + ' characters or fewer.' })
  }
  if (note.length > maxNoteLength) {
    return res.status(400).json({ error: 'The note must be ' + maxNoteLength + ' characters or fewer.' })
  }

  try {
    const result = await handleMessageReport(req.user.uid, req.params.id, {
      removeMessage: req.body.removeMessage === true,
      warning: warning,
      ban: req.body.ban === true,
      note: note,
    })
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ report: messageReportOf(result.report) })
  } catch (err) {
    console.log('handleMessageReport failed:', err.message)
    res.status(500).json({ error: 'Could not save the decision. Please try again.' })
  }
})

export default router
