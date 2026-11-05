// The private chat of one booking: only the student and the teacher of that booking can read
// or write in it. Messages live in their own collection, 'messages', one document each:
//
//   { bookingId, n, senderUid, senderRole, senderName, text, createdAt }
//
// n is the message's place in its chat (1, 2, 3 ...). The browser asks for "everything after n = 7",
// which is exact (no clock involved) and cheap.
//
// The booking document keeps a few numbers about its chat, so that "Is there something new
// for me?" can be answered without reading any messages:
//   messageCount          how many messages there are (also used to number the next one)
//   lastMessageBy         the uid of whoever wrote the latest message
//   learnerReadN / teacherReadN   the highest n each person has opened
//
// A chat is open for writing while the booking is 'booked' or 'disputed'. Once it is finished
// or cancelled it stays readable but nobody can add to it.
//
// OUTSIDE THE SLIDES: sending uses db.runTransaction() like the booking functions do, so two
// people writing at the same moment get two different numbers n.
import { db } from '../config/firebaseAdmin.js'
import { findDocsWhereEquals } from './dbQuery.js'
import { roleOf } from './bookingRules.js'

export const MAX_MESSAGE_LENGTH = 500
export const MAX_MESSAGES = 300 // per booking, so a chat can never grow without limit
const MIN_SECONDS_BETWEEN = 2 // the same person can send one message every 2 seconds

function fail(status, message) {
  return { status: status, error: message }
}

// can new messages still be added to this booking's chat?
export function chatIsOpen(booking) {
  return booking.status === 'booked' || booking.status === 'disputed'
}

// ---------- Send ----------
export async function sendMessage(uid, bookingId, text) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (!chatIsOpen(booking)) return fail(409, 'This chat is closed because the booking is ' + booking.status + '.')

    const count = booking.messageCount || 0
    if (count >= MAX_MESSAGES) return fail(409, 'This chat is full.')

    const now = new Date()
    if (booking.lastMessageBy === uid && booking.lastMessageAt) {
      const secondsAgo = (now.getTime() - new Date(booking.lastMessageAt).getTime()) / 1000
      if (secondsAgo < MIN_SECONDS_BETWEEN) return fail(429, 'Please wait a moment before sending another message.')
    }

    // --- writes ---
    const message = {
      bookingId: bookingId,
      n: count + 1,
      senderUid: uid,
      senderRole: role,
      senderName: role === 'learner' ? booking.learnerName : booking.teacherName,
      text: text,
      createdAt: now.toISOString(),
    }
    const messageRef = db.collection('messages').doc()
    t.set(messageRef, message)

    // writing a message means the writer has seen everything up to it
    const changes = { messageCount: count + 1, lastMessageBy: uid, lastMessageAt: message.createdAt }
    changes[role === 'learner' ? 'learnerReadN' : 'teacherReadN'] = count + 1
    t.update(bookingRef, changes)

    return { message: { id: messageRef.id, ...message }, booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Read ----------
// The messages with n bigger than "after" (0 = the whole chat), oldest first.
// Reading also marks them as seen by this person.
export async function readMessages(uid, bookingId, after) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  const bookingSnap = await bookingRef.get()
  if (!bookingSnap.exists) return fail(404, 'Booking not found.')
  const booking = bookingSnap.data()

  const role = roleOf(booking, uid)
  if (role === '') return fail(403, 'This is not your booking.')

  // The browser asks every few seconds. When it already has every message (the booking keeps the
  // count), answer without reading the messages at all, so an idle open chat costs one read.
  if (after >= (booking.messageCount || 0)) return { booking: booking, messages: [] }

  const found = await findDocsWhereEquals('messages', 'bookingId', bookingId)
  if (!found.status) return fail(500, 'Could not load the chat.')

  const messages = []
  for (const message of found.docs) {
    if (message.n > after) messages.push(message)
  }
  messages.sort((a, b) => a.n - b.n)

  // mark what was just read (a plain update: it only changes this person's own number)
  const readField = role === 'learner' ? 'learnerReadN' : 'teacherReadN'
  const newest = messages.length > 0 ? messages[messages.length - 1].n : 0
  if (newest > (booking[readField] || 0)) {
    await bookingRef.update({ [readField]: newest })
  }

  return { booking: booking, messages: messages }
}

// ---------- Read, for an admin ----------
// An admin may only open the chat of a booking that was reported (see routes/admins.js).
export async function readMessagesAsAdmin(bookingId) {
  const bookingSnap = await db.collection('bookings').doc(bookingId).get()
  if (!bookingSnap.exists) return fail(404, 'Booking not found.')
  const booking = bookingSnap.data()
  if (typeof booking.reportedBy !== 'string' || booking.reportedBy === '') {
    return fail(403, 'Only the chats of reported bookings can be opened.')
  }

  const found = await findDocsWhereEquals('messages', 'bookingId', bookingId)
  if (!found.status) return fail(500, 'Could not load the chat.')

  const messages = found.docs
  messages.sort((a, b) => a.n - b.n)
  return { booking: booking, messages: messages }
}
