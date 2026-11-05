// Reports about ONE message: a post in a public discussion, or a message in a private chat.
// (Reporting a whole booking is a different thing: "Report a problem", see models/bookings.js.)
//
// A report is one document in 'messageReports':
//
//   id = kind_containerId_n_reporterUid     e.g. public_<course id>_7_<reporter uid>
//   { kind, containerId, n, title, messageText, messageAt,
//     authorUid, authorName, reporterUid, reporterName, reason, createdAt,
//     handledAt, handledBy, outcome, removedMessage, warned, banned, note }
//
//   kind          'public' (a discussion post, containerId = course id) or
//                 'private' (a chat message, containerId = booking id)
//   messageText   a copy of the message made when it was reported, so the report still makes
//                 sense if the post is taken down later
//   outcome       '' while it waits for an admin, then 'dismissed' (nothing done) or 'actioned'
//
// The id is made of who reported what, so the same person cannot report the same message twice.
//
// OUTSIDE THE SLIDES: db.runTransaction() again, so a report is made once, and so an admin's
// decision (take the post down, warn, ban, mark the report handled) is saved as ONE step.
import { db } from '../config/firebaseAdmin.js'
import { findDocsWhereEquals } from './dbQuery.js'
import { roleOf } from './bookingRules.js'
import { postRef, discussionRef, markPostRemoved, readPostsAround } from './discussions.js'

export const MAX_REASON_LENGTH = 300

function fail(status, message) {
  return { status: status, error: message }
}

export function reportIdOf(kind, containerId, n, reporterUid) {
  return kind + '_' + containerId + '_' + n + '_' + reporterUid
}

// the document that is saved when someone reports a message
function buildReport(info) {
  return {
    kind: info.kind,
    containerId: info.containerId,
    n: info.n,
    title: info.title || '',
    messageText: info.messageText,
    messageAt: info.messageAt,
    authorUid: info.authorUid,
    authorName: info.authorName || '',
    reporterUid: info.reporterUid,
    reporterName: info.reporterName || '',
    reason: info.reason,
    createdAt: new Date().toISOString(),
    handledAt: '',
    handledBy: '',
    outcome: '',
    removedMessage: false,
    warned: false,
    banned: false,
    note: '',
  }
}

function nameOf(userSnap) {
  return userSnap.exists && typeof userSnap.data().name === 'string' ? userSnap.data().name : ''
}

// ---------- Report a message ----------
export async function createMessageReport(uid, kind, containerId, n, reason) {
  if (kind === 'public') return reportPublicPost(uid, containerId, n, reason)
  return reportPrivateMessage(uid, containerId, n, reason)
}

async function reportPublicPost(uid, offerId, n, reason) {
  const offerRef = db.collection('offers').doc(offerId)
  const pRef = postRef(offerId, n)
  const reportRef = db.collection('messageReports').doc(reportIdOf('public', offerId, n, uid))
  const reporterRef = db.collection('users').doc(uid)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const postSnap = await t.get(pRef)
    const offerSnap = await t.get(offerRef)
    if (!postSnap.exists || !offerSnap.exists) return fail(404, 'Message not found.')
    const reportSnap = await t.get(reportRef)
    const reporterSnap = await t.get(reporterRef)

    const post = postSnap.data()
    if (post.removed === true) return fail(409, 'This message was already removed.')
    if (post.authorUid === uid) return fail(400, "You can't report your own message.")
    if (reportSnap.exists) return fail(409, 'You already reported this message.')

    // --- writes ---
    const offer = offerSnap.data()
    const report = buildReport({
      kind: 'public',
      containerId: offerId,
      n: n,
      title: offer.title || offer.skill,
      messageText: post.text,
      messageAt: post.createdAt,
      authorUid: post.authorUid,
      authorName: post.authorName,
      reporterUid: uid,
      reporterName: nameOf(reporterSnap),
      reason: reason,
    })
    t.set(reportRef, report)
    return { report: report }
  })
}

async function reportPrivateMessage(uid, bookingId, n, reason) {
  // only the student and the teacher of the booking may report something from its chat.
  // (Checked first, so a stranger always gets the same answer whatever n is.)
  const bookingSnap = await db.collection('bookings').doc(bookingId).get()
  if (!bookingSnap.exists) return fail(404, 'Booking not found.')
  const booking = bookingSnap.data()
  if (roleOf(booking, uid) === '') return fail(403, 'This is not your booking.')

  const found = await findDocsWhereEquals('messages', 'bookingId', bookingId)
  if (!found.status) return fail(500, 'Could not load the chat.')
  let message = null
  for (const doc of found.docs) {
    if (doc.n === n) message = doc
  }
  if (message === null) return fail(404, 'Message not found.')
  if (message.senderUid === uid) return fail(400, "You can't report your own message.")

  const reportRef = db.collection('messageReports').doc(reportIdOf('private', bookingId, n, uid))
  const reporterRef = db.collection('users').doc(uid)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const reportSnap = await t.get(reportRef)
    if (reportSnap.exists) return fail(409, 'You already reported this message.')
    const reporterSnap = await t.get(reporterRef)

    // --- writes ---
    const report = buildReport({
      kind: 'private',
      containerId: bookingId,
      n: n,
      title: booking.title,
      messageText: message.text,
      messageAt: message.createdAt,
      authorUid: message.senderUid,
      authorName: message.senderName,
      reporterUid: uid,
      reporterName: nameOf(reporterSnap),
      reason: reason,
    })
    t.set(reportRef, report)
    return { report: report }
  })
}

// ---------- What an admin sees next to a report ----------
// A private message: the whole chat. A public post: the five posts before and after it.
// Removed posts are included (marked "removed"): the admin needs to see what was said.
export async function readReportContext(report) {
  if (report.kind === 'private') {
    const found = await findDocsWhereEquals('messages', 'bookingId', report.containerId)
    if (!found.status) return fail(500, 'Could not load the chat.')
    const messages = []
    for (const message of found.docs) {
      messages.push({
        n: message.n,
        authorName: message.senderName,
        role: message.senderRole,
        text: message.text,
        createdAt: message.createdAt,
        removed: false,
      })
    }
    messages.sort((a, b) => a.n - b.n)
    return { messages: messages }
  }

  const posts = await readPostsAround(report.containerId, report.n, 5)
  const messages = []
  for (const post of posts) {
    messages.push({
      n: post.n,
      authorName: post.authorName,
      role: post.isTeacher ? 'teacher' : '',
      text: post.text,
      createdAt: post.createdAt,
      removed: post.removed === true,
    })
  }
  messages.sort((a, b) => a.n - b.n)
  return { messages: messages }
}

// ---------- An admin decides ----------
// choices = { removeMessage: true/false, warning: '' or the text of a warning, ban: true/false, note }
// Nothing chosen = the report is dismissed. Everything chosen is saved together with the report.
export async function handleMessageReport(adminUid, reportId, choices) {
  const reportRef = db.collection('messageReports').doc(reportId)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const reportSnap = await t.get(reportRef)
    if (!reportSnap.exists) return fail(404, 'Report not found.')
    const report = reportSnap.data()
    if (report.handledAt) return fail(409, 'This report was already handled.')

    if (choices.removeMessage && report.kind !== 'public') {
      return fail(400, 'Only a post in a public discussion can be removed.')
    }

    let postSnap = null
    let discussionSnap = null
    if (choices.removeMessage) {
      postSnap = await t.get(postRef(report.containerId, report.n))
      if (!postSnap.exists) return fail(409, 'That post no longer exists (its course was deleted).')
      discussionSnap = await t.get(discussionRef(report.containerId))
    }

    let authorRef = null
    let authorSnap = null
    if (choices.warning !== '' || choices.ban) {
      authorRef = db.collection('users').doc(report.authorUid)
      authorSnap = await t.get(authorRef)
      if (!authorSnap.exists) return fail(404, 'The person who wrote this no longer has an account.')
      if (authorSnap.data().isAdmin === true) return fail(400, "An admin can't be warned or banned.")
    }

    // --- writes ---
    const now = new Date().toISOString()
    const result = {
      handledAt: now,
      handledBy: adminUid,
      outcome: choices.removeMessage || choices.warning !== '' || choices.ban ? 'actioned' : 'dismissed',
      removedMessage: false,
      warned: false,
      banned: false,
      note: choices.note,
    }

    if (choices.removeMessage) {
      // already taken down by its author or the teacher: nothing more to do, it is gone
      if (postSnap.data().removed !== true) {
        markPostRemoved(t, report.containerId, report.n, discussionSnap.exists ? discussionSnap.data() : {}, 'admin')
      }
      result.removedMessage = true
    }

    if (authorSnap !== null) {
      const changes = {}
      if (choices.warning !== '') {
        const warnings = Array.isArray(authorSnap.data().warnings) ? authorSnap.data().warnings : []
        changes.warnings = [...warnings, { reason: choices.warning, createdAt: now, by: adminUid }]
        result.warned = true
      }
      if (choices.ban) {
        changes.isBanned = true
        changes.updatedAt = now
        result.banned = true
      }
      t.update(authorRef, changes)
    }

    t.update(reportRef, result)
    return { report: { id: reportId, ...report, ...result } }
  })
}
