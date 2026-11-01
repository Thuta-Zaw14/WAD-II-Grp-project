// Everything that moves a booking (or a credit). This file replaces models/Sessions.js.
//
// A booking is one student on one start time of one course. It lives in the
// 'bookings' collection and is the single record of the whole story:
//
//   status 'booked'    -> the student paid; the credit is HELD (taken from the student, not yet
//                         given to the teacher). The clock then moves it through
//                         upcoming / in progress / ready to finish (see bookingRules.js).
//   status 'finished'  -> the student AND the teacher confirmed. The teacher gets the credit
//                         and the student gets a skill card.
//   status 'cancelled' -> the student cancelled at least 24 hours before the start. Refunded.
//   status 'disputed'  -> someone reported a problem. The credit stays held until it is sorted
//                         out by hand in the Firestore console.
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
import { slotMoment, cancelDeadline, finishTime, singaporeDate, describeMoment, roleOf, phaseOf } from './bookingRules.js'

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

    // The booking keeps its own copy of the course details, so "My sessions" still
    // reads correctly if the teacher later edits the course.
    const stageNames = []
    for (const stage of offer.stages || []) stageNames.push(stage.name)
    const weeks = Number.isInteger(offer.durationWeeks) && offer.durationWeeks >= 1 ? offer.durationWeeks : 1
    const nowText = now.toISOString()

    const bookingRef = db.collection('bookings').doc()
    const booking = {
      offerId: offerId,
      slotId: slotId,
      learnerUid: uid,
      learnerName: learner.name.trim(),
      teacherUid: offer.teacherUid,
      teacherName: offer.teacherName || teacherSnap.data().name || '',
      title: offer.title || offer.skill || '',
      skill: offer.skill || '',
      category: offer.category || '',
      mode: offer.mode || '',
      region: offer.region || '',
      place: offer.place || '',
      stageNames: stageNames,
      slotDate: slot.date,
      slotTime: slot.time,
      startsAt: startsAt.toISOString(),
      finishAfter: finishTime(startsAt, weeks).toISOString(), // when both people can confirm it is finished
      creditCost: cost, // the price at the time of booking, even if the teacher changes it later
      status: 'booked',
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

// ---------- Cancel (the student only, until 24 hours before the start) ----------
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
    const deadline = cancelDeadline(new Date(booking.startsAt))
    if (now >= deadline) {
      return fail(409, 'A booking can only be cancelled until 24 hours before it starts (' + describeMoment(deadline) + ').')
    }

    const offerRef = db.collection('offers').doc(booking.offerId)
    const learnerRef = db.collection('users').doc(uid)
    const offerSnap = await t.get(offerRef)
    const learnerSnap = await t.get(learnerRef)

    // --- writes ---
    const changes = { status: 'cancelled', cancelledAt: now.toISOString(), updatedAt: now.toISOString() }
    t.update(bookingRef, changes)

    if (learnerSnap.exists) {
      t.update(learnerRef, { credits: (learnerSnap.data().credits || 0) + booking.creditCost }) // refund
    }

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

    // the teacher's account is only needed when this confirmation completes the pair
    const teacherRef = db.collection('users').doc(booking.teacherUid)
    let teacherSnap = null
    if (bothConfirmed) {
      teacherSnap = await t.get(teacherRef)
      if (!teacherSnap.exists) return fail(409, "The teacher's account could not be found.")
    }

    // --- writes ---
    if (bothConfirmed) {
      changes.status = 'finished'
      changes.finishedAt = now.toISOString()

      // the held credit goes to the teacher
      t.update(teacherRef, { credits: (teacherSnap.data().credits || 0) + booking.creditCost })

      // the student's reward: a skill card (same id as the booking, so it can never be made twice)
      t.set(db.collection('skillCards').doc(bookingId), {
        learnerUid: booking.learnerUid,
        bookingId: bookingId,
        offerId: booking.offerId,
        name: booking.skill,
        category: booking.category,
        subskills: booking.stageNames || [],
        issuer: booking.teacherName,
        dateAttained: singaporeDate(now),
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
