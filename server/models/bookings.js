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
//   status 'cancelled' -> the student cancelled before the start, or the teacher removed the
//                         student from the class (cancelledBy 'teacher'). Refunded, except when the
//                         student cancelled less than 24 hours before the start (refunded: false):
//                         then the held credits go to the teacher. Either way the seat is freed.
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
import { slotMoment, cancelDeadline, finishTime, singaporeDate, describeMoment, roleOf, phaseOf } from './bookingRules.js'

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

// The course details a booking keeps its own copy of (shown on My Classes). Copied when the
// booking is made, and again when the teacher edits the course (syncBookingsWithOffer).
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
    durationWeeks: Number.isInteger(offer.durationWeeks) && offer.durationWeeks >= 1 ? offer.durationWeeks : 1,
    lessonsPerWeek: Number.isInteger(offer.lessonsPerWeek) ? offer.lessonsPerWeek : 1,
  }
}

// The teacher edited a course: bring the copy in each of its active bookings up to date, so
// the students see the new details. Finished and cancelled bookings keep the course as it was
// when they took it, and the price paid and the start time never change. A stage that was
// added starts unapproved; the reflections already written stay with their stage number.
// -> how many bookings were updated
export async function syncBookingsWithOffer(offerId, offer) {
  const result = await findDocsWhereEquals('bookings', 'offerId', offerId)
  if (!result.status) throw new Error('could not load the bookings of course ' + offerId)

  const details = courseDetailsOf(offer)
  const nowText = new Date().toISOString()
  const batch = db.batch()
  let count = 0
  for (const booking of result.docs) {
    if (booking.status !== 'booked' && booking.status !== 'disputed') continue

    const changes = { ...details, updatedAt: nowText }
    if (offer.teacherName) changes.teacherName = offer.teacherName
    const startsAt = new Date(booking.startsAt)
    if (!Number.isNaN(startsAt.getTime())) {
      changes.finishAfter = finishTime(startsAt, details.durationWeeks).toISOString()
    }
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
    // edits the course, syncBookingsWithOffer brings the copy up to date.
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
      finishAfter: finishTime(startsAt, details.durationWeeks).toISOString(), // when both people can confirm it is finished
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
    const startsAt = new Date(booking.startsAt)
    if (now >= startsAt) {
      return fail(409, 'This class has already started, so it can no longer be cancelled. Use "Report a problem" if something went wrong.')
    }
    // More than 24 hours before the start: the held credits go back to the student. Later than
    // that (until the start) the student can still give up the seat, but the credits go to the
    // teacher, who kept the time free for them.
    const refunded = now < cancelDeadline(startsAt)

    const offerRef = db.collection('offers').doc(booking.offerId)
    const learnerRef = db.collection('users').doc(uid)
    const teacherRef = db.collection('users').doc(booking.teacherUid)
    const offerSnap = await t.get(offerRef)
    const learnerSnap = await t.get(learnerRef)
    const teacherSnap = await t.get(teacherRef)
    // without the account there is nowhere to put the credits, so do not cancel and lose them
    if (refunded && !learnerSnap.exists) return fail(409, "Your account could not be found, so the credit cannot be refunded.")
    if (!refunded && !teacherSnap.exists) return fail(409, "The teacher's account could not be found, so this class cannot be cancelled now.")

    // --- writes ---
    const changes = {
      status: 'cancelled',
      cancelledAt: now.toISOString(),
      refunded: refunded,
      teacherNoticeSeen: false, // the teacher is told on Home and My Classes until they dismiss it
      updatedAt: now.toISOString(),
    }
    t.update(bookingRef, changes)
    if (refunded) {
      t.update(learnerRef, { credits: (learnerSnap.data().credits || 0) + booking.creditCost })
    } else {
      t.update(teacherRef, { credits: (teacherSnap.data().credits || 0) + booking.creditCost })
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

// ---------- The teacher has seen this booking (the red numbers on Home, My Classes, the nav bar) ----------
// Called when the teacher opens the Students list of a course (a student who just joined is no
// longer new) and when they press "Got it" on the notice that a student cancelled.
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
        sessionDurationMinutes: booking.sessionDurationMinutes || 60,
        durationWeeks: booking.durationWeeks || 1,
        lessonsPerWeek: booking.lessonsPerWeek || 1,
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
