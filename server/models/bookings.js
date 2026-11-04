// Everything that moves a booking (or a credit). This file replaces models/Sessions.js.
//
// A booking is one student on one start time of one course. It lives in the
// 'bookings' collection and is the single record of the whole story:
//
//   status 'booked'    -> the student paid; the credit is HELD (taken from the student, not yet
//                         given to the teacher). The clock then moves it through
//                         upcoming / in progress / ready to finish (see bookingRules.js).
//   status 'finished'  -> the student AND the teacher confirmed. The teacher gets the credit
//                         and the student gets a skill card. If the student was invited by a friend
//                         and this is their first finished course, the friend is rewarded too.
//   status 'cancelled' -> the student cancelled (until 24 hours before the start), the teacher
//                         removed the student (Kick), or the teacher cancelled the whole start time
//                         (cancelledBy 'teacher'). Always refunded, and the seat is freed. (Bookings
//                         saved with refunded: false come from an older rule that paid the teacher
//                         for a late cancel; they are only shown, never made any more.)
//
// A booking can also be MOVED to another start time of the same course: by the student
// (moveBooking) or, for everyone at that time, by the teacher (moveStartTime). The credits, the
// chat and the reflections stay with the booking. The rules are in bookingRules.js.
//   status 'disputed'  -> someone reported a problem. The credit stays held until an admin settles
//                         it (Disputes tab of the admin page): either the teacher is paid (the
//                         booking becomes 'finished', with resolution 'teacher-paid') or the
//                         student is refunded (it becomes 'cancelled', 'student-refunded').
//                         An admin-settled booking gets no skill card and no invite reward.
//
// OUTSIDE THE SLIDES: every function below uses db.runTransaction(). A transaction reads and
// writes several documents as ONE step, and if another request changes any of them in the
// middle, Firestore runs the function again with the new data. That is what stops two students
// taking the last seat, or a student spending the same credit twice. The rule: do all the
// reads (t.get) first, then all the writes (t.set / t.update).
//
// Every function returns { booking, offer } on success or { status, error } when the
// request is not allowed (status is the HTTP code the route sends back).
import { db } from '../config/firebaseAdmin.js'
import { findDocsWhereEquals } from './dbQuery.js'
import { MAX_REFERRAL_REWARDS, REFERRAL_REWARD_INVITER, REFERRAL_REWARD_FRIEND } from '../config/credits.js'
import {
  slotMoment, cancelDeadline, finishTime, singaporeDate, describeMoment, roleOf, phaseOf,
  moveDeadline, earliestNewTime, freeCancelUntil, MAX_MOVES, MOVE_HOURS_BEFORE, NEW_TIME_HOURS_AHEAD,
} from './bookingRules.js'

const MAX_OPEN_REPORTS = 2 // reports one person can have waiting for an admin at the same time

function fail(status, message) {
  return { status: status, error: message }
}

function creditsText(count) {
  return count + ' credit' + (count === 1 ? '' : 's')
}

// the uids of one slot (an old slot may not have the list yet)
function bookedByOf(slot) {
  return Array.isArray(slot.bookedBy) ? slot.bookedBy : []
}

// The course details a booking keeps its own copy of (shown on My Classes): what the student
// agreed to when they booked. A course is one lesson; sessionDurationMinutes is its length.
// Only the labels are updated later (see syncBookingsWithOffer). The rest cannot change while
// the booking is active, because routes/offers.js refuses those edits.
function courseDetailsOf(offer) {
  const stageNames = []
  for (const stage of offer.stages || []) stageNames.push(stage.name)
  return {
    title: offer.title || offer.skill || '',
    skill: offer.skill || '',
    category: offer.category || '',
    mode: offer.mode || '',
    region: offer.region || '',
    place: offer.place || '',
    address: offer.address || '', // the full address, for courses whose place was picked on the map
    stageNames: stageNames,
    sessionDurationMinutes: Number.isInteger(offer.sessionDurationMinutes) ? offer.sessionDurationMinutes : 60,
  }
}

// The names a booking shows for its course. These are only labels, so a course edit can safely
// update them in bookings that are still running (a typo in the title, a new teacher name).
function labelsOf(offer) {
  return {
    title: offer.title || offer.skill || '',
    skill: offer.skill || '',
    category: offer.category || '',
  }
}

// The teacher edited a course: update the LABELS in each of its active bookings (booked or
// disputed), so the students see the new title. Nothing else is copied: what the student agreed
// to (class type, place, equipment, difficulty, lesson length, stages, price, start time) stays
// as it was. routes/offers.js refuses edits to those while a booking is active.
// Finished and cancelled bookings keep the course exactly as it was when they took it.
// OUTSIDE THE SLIDES: db.batch() saves all the updates together, in one go.
// -> how many bookings were updated
export async function syncBookingsWithOffer(offerId, offer) {
  const result = await findDocsWhereEquals('bookings', 'offerId', offerId)
  if (!result.status) throw new Error('could not load the bookings of course ' + offerId)

  const labels = labelsOf(offer)
  const nowText = new Date().toISOString()
  const batch = db.batch()
  let count = 0
  for (const booking of result.docs) {
    if (booking.status !== 'booked' && booking.status !== 'disputed') continue

    const changes = { ...labels, updatedAt: nowText }
    if (offer.teacherName) changes.teacherName = offer.teacherName
    batch.update(db.collection('bookings').doc(booking.id), changes)
    count++
  }
  if (count > 0) await batch.commit()
  return count
}

function stageProgressOf(booking) {
  const stageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
  const savedProgress = Array.isArray(booking.stageProgress) ? booking.stageProgress : []
  return stageNames.map((_, index) => {
    const saved = savedProgress[index] || {}
    return {
      reflection: typeof saved.reflection === 'string' ? saved.reflection : '',
      submittedAt: saved.submittedAt || '',
      approved: saved.approved === true,
      approvedAt: saved.approvedAt || '',
    }
  })
}

export async function submitStageReflection(uid, bookingId, stageIndex, reflection) {
  const cleanReflection = typeof reflection === 'string' ? reflection.trim() : ''
  if (!cleanReflection) return fail(400, 'Write a reflection before submitting this stage.')
  if (cleanReflection.length > 2000) return fail(400, 'A stage reflection must be 2000 characters or fewer.')

  const bookingRef = db.collection('bookings').doc(bookingId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(bookingRef)
    if (!snapshot.exists) return fail(404, 'Booking not found.')

    const booking = snapshot.data()
    if (booking.learnerUid !== uid) return fail(403, 'Only the learner can update course progress.')
    if (booking.status !== 'booked') return fail(409, 'Progress can only be updated for an active course.')
    if (phaseOf(booking, new Date()) === 'upcoming') return fail(409, 'Reflections open once the course has started.')

    const stageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= stageNames.length) {
      return fail(400, 'That course stage is not valid.')
    }

    const progress = stageProgressOf(booking)
    if (progress.slice(0, stageIndex).some((stage) => !stage.approved)) {
      return fail(409, 'Complete the previous stage before submitting this reflection.')
    }
    if (progress[stageIndex].approved) return fail(409, 'This stage has already been approved.')
    const now = new Date().toISOString()
    progress[stageIndex] = {
      reflection: cleanReflection,
      submittedAt: now,
      approved: false,
      approvedAt: '',
    }

    const changes = {
      stageProgress: progress,
      progressUpdatedAt: now,
      updatedAt: now,
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

export async function approveBookingStage(uid, bookingId, stageIndex) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(bookingRef)
    if (!snapshot.exists) return fail(404, 'Booking not found.')

    const booking = snapshot.data()
    if (booking.teacherUid !== uid) return fail(403, 'Only the instructor can approve a stage.')
    if (booking.status !== 'booked') return fail(409, 'Stages can only be approved for an active course.')
    if (phaseOf(booking, new Date()) === 'upcoming') return fail(409, 'Stages can be approved once the course has started.')

    const stageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= stageNames.length) {
      return fail(400, 'That course stage is not valid.')
    }

    const progress = stageProgressOf(booking)
    if (progress.slice(0, stageIndex).some((stage) => !stage.approved)) {
      return fail(409, 'Approve the previous stage before reviewing this one.')
    }
    if (!progress[stageIndex].reflection) return fail(409, 'The learner must submit a reflection first.')
    if (progress[stageIndex].approved) return fail(409, 'This stage has already been approved.')

    const now = new Date().toISOString()
    progress[stageIndex] = { ...progress[stageIndex], approved: true, approvedAt: now }
    const changes = {
      stageProgress: progress,
      progressUpdatedAt: now,
      // a red number for the student until they open the class's Details (markSeenByLearner)
      learnerUnseenApprovals: (booking.learnerUnseenApprovals || 0) + 1,
      updatedAt: now,
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Book ----------
export async function bookSlot(uid, offerId, slotId) {
  const offerRef = db.collection('offers').doc(offerId)
  const learnerRef = db.collection('users').doc(uid)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const offer = offerSnap.data()

    if (typeof offer.teacherUid !== 'string' || offer.teacherUid === '') {
      return fail(409, 'This course cannot be booked.')
    }
    if (offer.teacherUid === uid) return fail(400, "You can't book your own course.")

    const learnerSnap = await t.get(learnerRef)
    if (!learnerSnap.exists) return fail(400, 'Set up your profile first.')
    const learner = learnerSnap.data()
    if (!learner.name || learner.name.trim() === '') return fail(400, 'Add your name on your profile first.')

    const teacherSnap = await t.get(db.collection('users').doc(offer.teacherUid))
    if (!teacherSnap.exists) return fail(409, 'This course cannot be booked: its teacher has no account.')

    // --- checks ---
    const slots = offer.slots || []
    let slotIndex = -1
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].id === slotId) slotIndex = i
      if (bookedByOf(slots[i]).includes(uid)) return fail(409, 'You have already booked this course.')
    }
    if (slotIndex === -1) return fail(404, 'That start time no longer exists.')
    const slot = slots[slotIndex]

    const now = new Date()
    const startsAt = slotMoment(slot.date, slot.time)
    if (startsAt <= now) return fail(409, 'That start time has already passed.')

    const bookedBy = bookedByOf(slot)
    if (bookedBy.length >= (slot.capacity || 1)) return fail(409, 'That start time is full.')

    const cost = offer.creditCost
    if (!Number.isInteger(cost) || cost < 1) return fail(409, 'This course cannot be booked.')
    const credits = learner.credits || 0
    if (credits < cost) {
      return fail(409, 'You need ' + creditsText(cost) + ' to book this, but you have ' + credits + '.')
    }

    // --- writes ---
    const newSlots = []
    for (const old of slots) {
      if (old.id === slotId) {
        newSlots.push({ ...old, bookedBy: [...bookedBy, uid] })
      } else {
        newSlots.push(old)
      }
    }
    t.update(offerRef, { slots: newSlots })
    t.update(learnerRef, { credits: credits - cost }) // the credit is held from now on

    // The booking keeps its own copy of the course details for My Classes. When the teacher
    // edits the course, syncBookingsWithOffer updates only the labels (title, skill, category).
    const details = courseDetailsOf(offer)
    const nowText = now.toISOString()

    const bookingRef = db.collection('bookings').doc()
    const booking = {
      offerId: offerId,
      slotId: slotId,
      learnerUid: uid,
      learnerName: learner.name.trim(),
      teacherUid: offer.teacherUid,
      teacherName: offer.teacherName || teacherSnap.data().name || '',
      ...details,
      stageProgress: details.stageNames.map(() => ({
        reflection: '',
        submittedAt: '',
        approved: false,
        approvedAt: '',
      })),
      slotDate: slot.date,
      slotTime: slot.time,
      startsAt: startsAt.toISOString(),
      // when both people can confirm it is finished: once the one lesson is over
      finishAfter: finishTime(startsAt, details.sessionDurationMinutes).toISOString(),
      creditCost: cost, // the price at the time of booking, even if the teacher changes it later
      status: 'booked',
      teacherSeenJoin: false, // a red number for the teacher until they open the course's Students list
      learnerConfirmed: false,
      teacherConfirmed: false,
      createdAt: nowText,
      updatedAt: nowText,
    }
    t.set(bookingRef, booking)

    return {
      booking: { id: bookingRef.id, ...booking },
      offer: { id: offerId, ...offer, slots: newSlots },
    }
  })
}

// ---------- Cancel (the student only, for a full refund) ----------
// Allowed until 24 hours before the start. Two exceptions (see freeCancelUntil in bookingRules.js):
// if the TEACHER moved the class, until it starts; if the student moved it within the last 24
// hours before its start, not at all. A cancel never pays the teacher: credits only reach a teacher
// through a finished class or an admin's decision. A student who can't come after that can message
// the teacher (who can remove them with a full refund) or report a problem once it has started.
export async function cancelBooking(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (role !== 'learner') return fail(403, 'Only the student can cancel a booking.')
    if (booking.status !== 'booked') return fail(409, 'This booking is ' + booking.status + '.')

    const now = new Date()
    const startsAt = new Date(booking.startsAt)
    if (now >= startsAt) {
      return fail(409, 'This class has already started, so it can no longer be cancelled. Use "Report a problem" if something went wrong.')
    }
    const deadline = freeCancelUntil(booking)
    if (deadline === null) {
      return fail(409, 'You moved this class less than 24 hours before it started, so it can no longer be cancelled. If you can\'t come, message ' + booking.teacherName + ': they can remove you with a full refund.')
    }
    if (now >= deadline) {
      return fail(409, 'Free cancellation ended 24 hours before the start. If you can\'t come, move it to another time or message ' + booking.teacherName + ': they can remove you with a full refund.')
    }

    const offerRef = db.collection('offers').doc(booking.offerId)
    const learnerRef = db.collection('users').doc(uid)
    const offerSnap = await t.get(offerRef)
    const learnerSnap = await t.get(learnerRef)
    // without the account there is nowhere to put the refund, so do not cancel and lose the credit
    if (!learnerSnap.exists) return fail(409, 'Your account could not be found, so the credit cannot be refunded.')

    // --- writes ---
    const changes = {
      status: 'cancelled',
      cancelledAt: now.toISOString(),
      refunded: true,
      teacherNotice: 'cancelled', // the teacher is told on Home and My Classes until they dismiss it
      teacherNoticeSeen: false,
      teacherNoticeAt: now.toISOString(),
      learnerNoticeSeen: true, // anything the teacher told the student is old news now
      updatedAt: now.toISOString(),
    }
    t.update(bookingRef, changes)
    t.update(learnerRef, { credits: (learnerSnap.data().credits || 0) + booking.creditCost })

    let offer = null
    if (offerSnap.exists) {
      // free the seat: take this student's uid off the slot
      const newSlots = []
      for (const slot of offerSnap.data().slots || []) {
        if (slot.id === booking.slotId) {
          const stillBooked = []
          for (const other of bookedByOf(slot)) {
            if (other !== uid) stillBooked.push(other)
          }
          newSlots.push({ ...slot, bookedBy: stillBooked })
        } else {
          newSlots.push(slot)
        }
      }
      t.update(offerRef, { slots: newSlots })
      offer = { id: offerSnap.id, ...offerSnap.data(), slots: newSlots }
    }

    return { booking: { id: bookingId, ...booking, ...changes }, offer: offer }
  })
}

function hoursText(hours) {
  return hours + ' hour' + (hours === 1 ? '' : 's')
}

// How long a booking lasts (from its start until it can be marked finished). A move keeps this
// length. It is read from the booking itself, because bookings made before courses became one
// lesson can last several weeks.
function lengthOf(booking) {
  const length = new Date(booking.finishAfter).getTime() - new Date(booking.startsAt).getTime()
  if (Number.isFinite(length) && length > 0) return length
  return (booking.sessionDurationMinutes || 60) * 60 * 1000
}

// ---------- Move (the student moves their booking to another start time of the same course) ----------
// Allowed until 2 hours before the current start, to a start time with a free seat that is more
// than 24 hours away, at most twice per booking. A move made within the last 24 hours before the
// start marks the booking "moved late": it can then no longer be cancelled (otherwise a late move
// followed by a cancel would get round the 24-hour cancel rule). The teacher gets a notice.
export async function moveBooking(uid, bookingId, newSlotId) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (role !== 'learner') return fail(403, 'Only the student can move a booking. To move a whole start time, use "Start times" on My Classes.')
    if (booking.status !== 'booked') return fail(409, 'This booking is ' + booking.status + '.')

    const offerRef = db.collection('offers').doc(booking.offerId)
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const slots = offerSnap.data().slots || []

    // --- checks ---
    const now = new Date()
    const oldStart = new Date(booking.startsAt)
    if (now >= moveDeadline(oldStart)) {
      return fail(409, 'A class can be moved until ' + hoursText(MOVE_HOURS_BEFORE) + ' before it starts.')
    }
    const moves = booking.studentMoves || 0
    if (moves >= MAX_MOVES) return fail(409, 'You have already moved this class ' + MAX_MOVES + ' times.')
    if (newSlotId === booking.slotId) return fail(400, 'That is already your start time.')

    let newSlot = null
    for (const slot of slots) {
      if (slot.id === newSlotId) newSlot = slot
    }
    if (newSlot === null) return fail(404, 'That start time no longer exists.')
    const newStart = slotMoment(newSlot.date, newSlot.time)
    if (newStart <= earliestNewTime(now)) {
      return fail(409, 'Pick a start time more than ' + hoursText(NEW_TIME_HOURS_AHEAD) + ' from now.')
    }
    if (bookedByOf(newSlot).length >= (newSlot.capacity || 1)) return fail(409, 'That start time is full.')

    // --- writes ---
    // the seat moves: off the old start time, onto the new one
    const newSlots = []
    for (const slot of slots) {
      if (slot.id === booking.slotId) {
        const stillBooked = []
        for (const other of bookedByOf(slot)) {
          if (other !== uid) stillBooked.push(other)
        }
        newSlots.push({ ...slot, bookedBy: stillBooked })
      } else if (slot.id === newSlotId) {
        newSlots.push({ ...slot, bookedBy: [...bookedByOf(slot), uid] })
      } else {
        newSlots.push(slot)
      }
    }
    t.update(offerRef, { slots: newSlots })

    const nowText = now.toISOString()
    const changes = {
      slotId: newSlotId,
      slotDate: newSlot.date,
      slotTime: newSlot.time,
      startsAt: newStart.toISOString(),
      finishAfter: new Date(newStart.getTime() + lengthOf(booking)).toISOString(),
      studentMoves: moves + 1,
      // moved within the last 24 hours before the start: no cancelling from now on
      movedLate: booking.movedLate === true || now >= cancelDeadline(oldStart),
      teacherMoved: false, // the student picked this time themselves
      teacherNotice: 'moved', // the teacher is told on Home and My Classes until they dismiss it
      teacherNoticeSeen: false,
      teacherNoticeFrom: booking.startsAt,
      teacherNoticeTo: newStart.toISOString(),
      teacherNoticeAt: nowText,
      learnerNoticeSeen: true, // anything the teacher told the student is old news now
      updatedAt: nowText,
    }
    t.update(bookingRef, changes)

    return {
      booking: { id: bookingId, ...booking, ...changes },
      offer: { id: offerSnap.id, ...offerSnap.data(), slots: newSlots },
    }
  })
}

// ---------- The teacher moves or cancels a whole start time ----------
// One start time can hold several students, so these act on all of them at once.
// Nobody booked: the start time is simply changed or removed (a new time must still be in the future).
// Students booked:
//   - move: until 2 hours before the start, to a new time more than 24 hours away, at most twice per
//     start time. Each student gets a notice and may cancel for a full refund until the new start,
//     because they never agreed to it. An optional note from the teacher goes with the notice.
//   - cancel: until the start, with a reason. Every student is refunded in full and gets a notice;
//     the start time is removed.

// The open bookings of one start time. Read INSIDE the transaction t (OUTSIDE THE SLIDES: a query
// in a transaction), so a student who books this time at the same moment is counted too.
async function bookingsOfSlot(t, offerId, slotId) {
  const snapshot = await t.get(db.collection('bookings').where('offerId', '==', offerId))
  const list = []
  for (const doc of snapshot.docs) {
    const booking = doc.data()
    if (booking.slotId === slotId && booking.status === 'booked') list.push({ id: doc.id, ...booking })
  }
  return list
}

function findSlot(slots, slotId) {
  for (const slot of slots) {
    if (slot.id === slotId) return slot
  }
  return null
}

// newDate / newTime are already checked by the route ("2026-11-08", "14:00"); note may be ''
export async function moveStartTime(uid, offerId, slotId, newDate, newTime, note) {
  const offerRef = db.collection('offers').doc(offerId)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const offer = offerSnap.data()
    if (offer.teacherUid !== uid) return fail(403, 'This is not your course.')

    const slots = offer.slots || []
    const slot = findSlot(slots, slotId)
    if (slot === null) return fail(404, 'That start time no longer exists.')
    const students = await bookingsOfSlot(t, offerId, slotId)

    // --- checks ---
    const now = new Date()
    const oldStart = slotMoment(slot.date, slot.time)
    if (oldStart <= now) return fail(409, 'This start time has already begun, so it can no longer be moved.')
    const newId = newDate + '-' + newTime
    if (newId === slotId) return fail(400, 'That is the same start time.')
    if (findSlot(slots, newId) !== null) return fail(409, 'This course already starts at that time.')
    const newStart = slotMoment(newDate, newTime)
    if (newStart <= now) return fail(400, 'The new start time must be in the future.')

    const hasStudents = students.length > 0 || bookedByOf(slot).length > 0
    const moves = slot.moves || 0
    if (hasStudents) {
      if (now >= moveDeadline(oldStart)) {
        return fail(409, 'A start time with students can be moved until ' + hoursText(MOVE_HOURS_BEFORE) + ' before it begins. You can still cancel it.')
      }
      if (newStart <= earliestNewTime(now)) {
        return fail(409, 'Pick a new time more than ' + hoursText(NEW_TIME_HOURS_AHEAD) + ' from now, so your students have time to see it.')
      }
      if (moves >= MAX_MOVES) return fail(409, 'You have already moved this start time ' + MAX_MOVES + ' times.')
    }

    // --- writes ---
    // the same seats (and the same students) at the new time
    const movedSlot = { ...slot, id: newId, date: newDate, time: newTime, moves: hasStudents ? moves + 1 : moves }
    const newSlots = []
    for (const other of slots) {
      newSlots.push(other.id === slotId ? movedSlot : other)
    }
    newSlots.sort((a, b) => (a.id < b.id ? -1 : 1)) // soonest first
    const nowText = now.toISOString()
    t.update(offerRef, { slots: newSlots, updatedAt: nowText })

    for (const booking of students) {
      t.update(db.collection('bookings').doc(booking.id), {
        slotId: newId,
        slotDate: newDate,
        slotTime: newTime,
        startsAt: newStart.toISOString(),
        finishAfter: new Date(newStart.getTime() + lengthOf(booking)).toISOString(),
        teacherMoved: true, // the student may now cancel for a full refund until the new start
        learnerNotice: 'teacherMoved', // the student is told on Home and My Classes until they dismiss it
        learnerNoticeSeen: false,
        learnerNoticeFrom: booking.startsAt,
        learnerNoticeTo: newStart.toISOString(),
        learnerNoticeNote: note,
        learnerNoticeAt: nowText,
        teacherNoticeSeen: true, // the teacher acted on this time, so their own notice is old news
        updatedAt: nowText,
      })
    }

    return { offer: { id: offerId, ...offer, slots: newSlots, updatedAt: nowText }, students: students.length }
  })
}

// reason may be '' only when nobody has booked the start time (the route trims it)
export async function cancelStartTime(uid, offerId, slotId, reason) {
  const offerRef = db.collection('offers').doc(offerId)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const offer = offerSnap.data()
    if (offer.teacherUid !== uid) return fail(403, 'This is not your course.')

    const slots = offer.slots || []
    const slot = findSlot(slots, slotId)
    if (slot === null) return fail(404, 'That start time no longer exists.')
    const students = await bookingsOfSlot(t, offerId, slotId)

    const now = new Date()
    if (slotMoment(slot.date, slot.time) <= now) {
      return fail(409, 'This start time has already begun, so it can no longer be cancelled. You can still remove a student (Kick).')
    }
    if (students.length > 0 && reason === '') return fail(400, 'Please give a reason. Your students will see it.')

    // every student is refunded, so read their accounts now (all reads come before the writes)
    const refunds = {} // uid -> credits to give back
    for (const booking of students) {
      refunds[booking.learnerUid] = (refunds[booking.learnerUid] || 0) + booking.creditCost
    }
    const balances = {} // uid -> credits now
    for (const learnerUid of Object.keys(refunds)) {
      const snap = await t.get(db.collection('users').doc(learnerUid))
      // without the account there is nowhere to put the refund, so do not cancel and lose the credit
      if (!snap.exists) return fail(409, "A student's account could not be found, so their credits cannot be refunded.")
      balances[learnerUid] = snap.data().credits || 0
    }

    // --- writes ---
    const nowText = now.toISOString()
    for (const booking of students) {
      t.update(db.collection('bookings').doc(booking.id), {
        status: 'cancelled',
        cancelledAt: nowText,
        cancelledBy: 'teacher',
        startTimeCancelled: true, // the whole start time was cancelled (a Kick removes one student)
        removalReason: reason,
        refunded: true,
        learnerNotice: 'teacherCancelled', // the student is told on Home and My Classes
        learnerNoticeSeen: false,
        learnerNoticeNote: reason,
        learnerNoticeAt: nowText,
        teacherNoticeSeen: true, // the teacher acted on this time, so their own notice is old news
        updatedAt: nowText,
      })
    }
    for (const learnerUid of Object.keys(refunds)) {
      t.update(db.collection('users').doc(learnerUid), { credits: balances[learnerUid] + refunds[learnerUid] })
    }

    // the start time is gone
    const newSlots = []
    for (const other of slots) {
      if (other.id !== slotId) newSlots.push(other)
    }
    t.update(offerRef, { slots: newSlots, updatedAt: nowText })

    return { offer: { id: offerId, ...offer, slots: newSlots, updatedAt: nowText }, students: students.length }
  })
}

// ---------- "Got it" on a notice (Home and My Classes) ----------
// The teacher's notices: a student cancelled or moved. The student's: the teacher moved or
// cancelled the start time. Each person only dismisses their own side.
export async function dismissNotice(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  const snapshot = await bookingRef.get()
  if (!snapshot.exists) return fail(404, 'Booking not found.')
  const booking = snapshot.data()
  const role = roleOf(booking, uid)
  if (role === '') return fail(403, 'This is not your booking.')

  const changes = role === 'teacher'
    ? { teacherNoticeSeen: true, teacherNoticeSeenAt: new Date().toISOString() }
    : { learnerNoticeSeen: true }
  await bookingRef.update(changes)
  return { booking: { id: bookingId, ...booking, ...changes } }
}

// ---------- The teacher has seen this booking (the red numbers on Home, My Classes, the nav bar) ----------
// Called when the teacher opens the Students list of a course (a student who just joined is no
// longer new). "Got it" on a notice now uses dismissNotice above.
export async function markSeenByTeacher(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  const snapshot = await bookingRef.get()
  if (!snapshot.exists) return fail(404, 'Booking not found.')
  const booking = snapshot.data()
  if (booking.teacherUid !== uid) return fail(403, 'Only the teacher can do this.')

  const nowText = new Date().toISOString()
  const changes = { teacherSeenJoin: true }
  if (booking.status === 'cancelled') {
    changes.teacherNoticeSeen = true
    changes.teacherNoticeSeenAt = nowText
  }
  await bookingRef.update(changes)
  return { booking: { id: bookingId, ...booking, ...changes } }
}

// ---------- The student has seen this booking ----------
// Called when the student opens the class's Details: the stages the teacher approved since
// they last looked are no longer new.
export async function markSeenByLearner(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  const snapshot = await bookingRef.get()
  if (!snapshot.exists) return fail(404, 'Booking not found.')
  const booking = snapshot.data()
  if (booking.learnerUid !== uid) return fail(403, 'Only the student can do this.')

  const changes = { learnerUnseenApprovals: 0 }
  await bookingRef.update(changes)
  return { booking: { id: bookingId, ...booking, ...changes } }
}

// ---------- The teacher removes a student from the class (any time while it is active) ----------
// The student gets the full refund and the seat is freed, the same as a cancel.
// The reason is kept on the booking so the student can see why.
export async function removeStudent(uid, bookingId, reason) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    if (booking.teacherUid !== uid) return fail(403, 'Only the teacher can remove a student.')
    if (booking.status !== 'booked') return fail(409, 'This booking is ' + booking.status + '.')

    const offerRef = db.collection('offers').doc(booking.offerId)
    const learnerRef = db.collection('users').doc(booking.learnerUid)
    const offerSnap = await t.get(offerRef)
    const learnerSnap = await t.get(learnerRef)
    // without the account there is nowhere to put the refund, so do not remove and lose the credit
    if (!learnerSnap.exists) return fail(409, "The student's account could not be found, so the credit cannot be refunded.")

    // --- writes ---
    const now = new Date().toISOString()
    const changes = {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: 'teacher',
      removalReason: reason,
      teacherNoticeSeen: true, // a notice about this student (e.g. "moved") is old news now
      updatedAt: now,
    }
    t.update(bookingRef, changes)
    t.update(learnerRef, { credits: (learnerSnap.data().credits || 0) + booking.creditCost }) // refund

    if (offerSnap.exists) {
      // free the seat: take the student's uid off the slot
      const newSlots = []
      for (const slot of offerSnap.data().slots || []) {
        if (slot.id === booking.slotId) {
          const stillBooked = []
          for (const other of bookedByOf(slot)) {
            if (other !== booking.learnerUid) stillBooked.push(other)
          }
          newSlots.push({ ...slot, bookedBy: stillBooked })
        } else {
          newSlots.push(slot)
        }
      }
      t.update(offerRef, { slots: newSlots })
    }

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Confirm that the course is finished (the student and the teacher both have to) ----------
export async function confirmBooking(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (booking.status !== 'booked') return fail(409, 'This booking is ' + booking.status + '.')

    // stageProgressOf also covers older bookings that have stage names but no saved progress yet
    if (stageProgressOf(booking).some((stage) => !stage.approved)) {
      return fail(409, 'The instructor must approve every course stage before the course can be finished.')
    }

    const now = new Date()
    if (phaseOf(booking, now) !== 'readyToFinish') {
      return fail(409, 'The course is not over yet. You can confirm it from ' + describeMoment(new Date(booking.finishAfter)) + '.')
    }

    const myFlag = role === 'learner' ? 'learnerConfirmed' : 'teacherConfirmed'
    const otherFlag = role === 'learner' ? 'teacherConfirmed' : 'learnerConfirmed'
    if (booking[myFlag] === true) return fail(409, 'You have already confirmed. Waiting for the other person.')

    const changes = { updatedAt: now.toISOString() }
    changes[myFlag] = true
    const bothConfirmed = booking[otherFlag] === true

    // The other accounts are only needed when this confirmation completes the pair:
    // the teacher (gets paid), the student, and the person who invited the student (if any).
    const teacherRef = db.collection('users').doc(booking.teacherUid)
    const learnerRef = db.collection('users').doc(booking.learnerUid)
    let teacherSnap = null
    let learnerSnap = null
    let inviterRef = null
    let inviterSnap = null
    if (bothConfirmed) {
      teacherSnap = await t.get(teacherRef)
      if (!teacherSnap.exists) return fail(409, "The teacher's account could not be found.")

      learnerSnap = await t.get(learnerRef)
      const learner = learnerSnap.exists ? learnerSnap.data() : {}
      // a student who was invited, and has not finished a course before, is on their first one now
      // (a teacher who invited their own student is not paid for it: that would let one person
      // farm rewards by inviting extra accounts into their own courses)
      if (learner.referredBy && learner.referralRewarded !== true && learner.referredBy !== booking.teacherUid) {
        inviterRef = db.collection('users').doc(learner.referredBy)
        inviterSnap = await t.get(inviterRef)
      }
    }

    // --- writes ---
    if (bothConfirmed) {
      changes.status = 'finished'
      changes.finishedAt = now.toISOString()

      // Credits to add to each person. Everybody is updated ONCE (a teacher can also be the
      // person who invited the student), so the changes are collected here first.
      const people = {}
      function pay(uid, ref, snap, credits, extraFields) {
        if (!people[uid]) people[uid] = { ref: ref, credits: snap.data().credits || 0, fields: {} }
        people[uid].credits += credits
        Object.assign(people[uid].fields, extraFields)
      }

      // the held credit goes to the teacher
      pay(booking.teacherUid, teacherRef, teacherSnap, booking.creditCost, {})

      // Invite a friend: the first finished course of an invited student rewards whoever invited
      // them, up to MAX_REFERRAL_REWARDS friends. The student's first course counts as "used" either
      // way, so a full inviter does not get paid later either.
      if (inviterSnap !== null) {
        const rewardsSoFar = inviterSnap.exists ? inviterSnap.data().referralsRewarded || 0 : 0
        const inviterIsPaid = inviterSnap.exists && rewardsSoFar < MAX_REFERRAL_REWARDS

        pay(booking.learnerUid, learnerRef, learnerSnap, inviterIsPaid ? REFERRAL_REWARD_FRIEND : 0, { referralRewarded: true })
        if (inviterIsPaid) {
          pay(inviterRef.id, inviterRef, inviterSnap, REFERRAL_REWARD_INVITER, { referralsRewarded: rewardsSoFar + 1 })
        }
      }

      for (const uid of Object.keys(people)) {
        t.update(people[uid].ref, { ...people[uid].fields, credits: people[uid].credits })
      }

      // the student's reward: a skill card (same id as the booking, so it can never be made twice)
      t.set(db.collection('skillCards').doc(bookingId), {
        learnerUid: booking.learnerUid,
        bookingId: bookingId,
        offerId: booking.offerId,
        name: booking.skill,
        courseTitle: booking.title,
        category: booking.category,
        subskills: booking.stageNames || [],
        issuer: booking.teacherName,
        dateAttained: singaporeDate(now),
        sessionDurationMinutes: booking.sessionDurationMinutes || 60, // the length of the one lesson
        completedStageCount: (booking.stageNames || []).length,
        createdAt: now.toISOString(),
      })
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Report a problem (either person, once the course has started) ----------
export async function reportBooking(uid, bookingId, reason) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  // A report holds the credit until an admin decides, so one person cannot keep many bookings
  // frozen at once: they wait for the admins to settle their open reports first.
  const mine = await findDocsWhereEquals('bookings', 'reportedBy', uid)
  if (!mine.status) return fail(500, 'Could not send the report. Please try again.')
  const openReports = mine.docs.filter((b) => b.status === 'disputed').length
  if (openReports >= MAX_OPEN_REPORTS) {
    return fail(429, 'You already have ' + openReports + ' open reports. Please wait for an admin to settle them first.')
  }

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()

    if (roleOf(booking, uid) === '') return fail(403, 'This is not your booking.')
    if (booking.status !== 'booked') return fail(409, 'This booking is ' + booking.status + '.')

    const now = new Date()
    if (now < new Date(booking.startsAt)) return fail(409, 'You can report a problem once the course has started.')

    const changes = {
      status: 'disputed',
      reportedBy: uid,
      reportReason: reason,
      reportedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- An admin settles a disputed booking ----------
// decision is 'pay-teacher' (the course happened: the held credit goes to the teacher) or
// 'refund-student' (it did not: the held credit goes back to the student, and their seat is freed
// so they could book the course again). reportedBy and reportReason stay on the booking, so the
// report is still counted against the other person.
export async function settleDispute(adminUid, bookingId, decision, note) {
  const bookingRef = db.collection('bookings').doc(bookingId)

  return db.runTransaction(async (t) => {
    const bookingSnap = await t.get(bookingRef)
    if (!bookingSnap.exists) return fail(404, 'Booking not found.')
    const booking = bookingSnap.data()
    if (booking.status !== 'disputed') return fail(409, 'This booking is ' + booking.status + ', not under review.')

    // --- reads ---
    const payTeacher = decision === 'pay-teacher'
    const teacherRef = db.collection('users').doc(booking.teacherUid)
    const learnerRef = db.collection('users').doc(booking.learnerUid)
    const offerRef = db.collection('offers').doc(booking.offerId)

    let teacherSnap = null
    let learnerSnap = null
    let offerSnap = null
    if (payTeacher) {
      teacherSnap = await t.get(teacherRef)
      if (!teacherSnap.exists) return fail(409, "The teacher's account could not be found.")
    } else {
      learnerSnap = await t.get(learnerRef)
      if (!learnerSnap.exists) return fail(409, "The student's account could not be found.")
      offerSnap = await t.get(offerRef)
    }

    // --- writes ---
    const now = new Date().toISOString()
    const changes = {
      resolution: payTeacher ? 'teacher-paid' : 'student-refunded',
      resolutionNote: note,
      resolvedBy: adminUid,
      resolvedAt: now,
      updatedAt: now,
    }

    if (payTeacher) {
      changes.status = 'finished'
      changes.finishedAt = now
      t.update(teacherRef, { credits: (teacherSnap.data().credits || 0) + booking.creditCost })
    } else {
      changes.status = 'cancelled'
      changes.cancelledAt = now
      t.update(learnerRef, { credits: (learnerSnap.data().credits || 0) + booking.creditCost })

      if (offerSnap.exists) {
        const newSlots = []
        for (const slot of offerSnap.data().slots || []) {
          if (slot.id === booking.slotId) {
            const stillBooked = []
            for (const other of bookedByOf(slot)) {
              if (other !== booking.learnerUid) stillBooked.push(other)
            }
            newSlots.push({ ...slot, bookedBy: stillBooked })
          } else {
            newSlots.push(slot)
          }
        }
        t.update(offerRef, { slots: newSlots })
      }
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}
