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
import {
  slotMoment, cancelDeadline, finishTime, singaporeDate, describeMoment, roleOf, phaseOf,
  SCHEDULE_NOTICE_HOURS, sessionAtOf, currentStageIndexOf, schedulableStage,
  CANCEL_SESSION_HOURS, cancellableSession, dropRefunds,
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

// One line per stage: when its lesson is (sessionAt, see bookingRules.js), the student's
// reflection, and whether and when the teacher approved it. Older bookings may have fewer
// fields saved, so every one is filled in here.
function stageProgressOf(booking) {
  const stageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
  const savedProgress = Array.isArray(booking.stageProgress) ? booking.stageProgress : []
  return stageNames.map((_, index) => {
    const saved = savedProgress[index] || {}
    return {
      sessionAt: sessionAtOf(booking, saved, index),
      noSession: saved.noSession === true, // its session was cancelled and no new one is agreed yet
      rescheduleCount: Number.isInteger(saved.rescheduleCount) ? saved.rescheduleCount : 0,
      // each person's one free cancellation of this stage's session (cancelSession)
      cancelledByLearner: saved.cancelledByLearner === true,
      cancelledByTeacher: saved.cancelledByTeacher === true,
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

    const stageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= stageNames.length) {
      return fail(400, 'That course stage is not valid.')
    }

    const progress = stageProgressOf(booking)
    if (progress.slice(0, stageIndex).some((stage) => !stage.approved)) {
      return fail(409, 'Complete the previous stage before submitting this reflection.')
    }
    if (progress[stageIndex].approved) return fail(409, 'This stage has already been approved.')

    // a stage's reflection opens once its lesson has started
    const sessionAt = progress[stageIndex].sessionAt
    if (!sessionAt) return fail(409, 'Book a session for this stage first.')
    if (new Date() < new Date(sessionAt)) {
      return fail(409, "This stage's reflection opens when its session starts (" + describeMoment(new Date(sessionAt)) + ').')
    }

    const now = new Date().toISOString()
    progress[stageIndex] = {
      ...progress[stageIndex], // keeps the lesson time
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

    const nowDate = new Date()
    const now = nowDate.toISOString()
    progress[stageIndex] = { ...progress[stageIndex], approved: true, approvedAt: now }
    const changes = {
      stageProgress: progress,
      progressUpdatedAt: now,
      // a red number for the student until they open the class's Details (markSeenByLearner)
      learnerUnseenApprovals: (booking.learnerUnseenApprovals || 0) + 1,
      updatedAt: now,
    }
    // a suggested time for this stage's lesson is no longer needed
    if (booking.proposal && booking.proposal.stage === stageIndex) changes.proposal = null

    // The last stage: the course is complete. The teacher is paid and the student gets their
    // skill card straight away, the same as when both people confirm (confirmBooking).
    const courseComplete = currentStageIndexOf(progress) === -1
    let accounts = null
    if (courseComplete) {
      accounts = await readFinishAccounts(t, booking)
      if (accounts.error) return accounts
    }

    // --- writes ---
    if (courseComplete) {
      changes.learnerConfirmed = true
      changes.teacherConfirmed = true
      writeFinish(t, bookingId, booking, accounts, nowDate, changes)
    }
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Agreeing on a lesson time (either person suggests one, the other answers) ----------
// A booking keeps at most one suggestion:
//   proposal: { stage, startsAt, from: 'learner' | 'teacher', note, round, createdAt }
// It is always for the stage being worked on now, and only while that stage's lesson can still be
// set or moved (schedulableStage in bookingRules.js: not booked yet, or more than 24 hours away).
// The other person accepts it, declines it, or suggests another time instead (round goes up each
// time it changes hands). The agreed time only changes when someone accepts.
const MAX_PROPOSAL_NOTE = 300
const HOUR = 60 * 60 * 1000

// '' if the time is far enough ahead, otherwise what is wrong with it
function newTimeProblem(startsAt, now) {
  if (Number.isNaN(startsAt.getTime())) return 'Pick a date and a time.'
  const ahead = startsAt.getTime() - now.getTime()
  if (ahead < SCHEDULE_NOTICE_HOURS * HOUR) return 'Pick a time at least ' + SCHEDULE_NOTICE_HOURS + ' hours from now.'
  if (ahead > 366 * 24 * HOUR) return 'Pick a time within the next year.'
  return ''
}

// why no lesson time can be suggested right now
function nothingToSchedule(progress) {
  if (currentStageIndexOf(progress) === -1) return 'Every stage of this course is done.'
  return 'This session is less than ' + SCHEDULE_NOTICE_HOURS + ' hours away, so its time can no longer be changed.'
}

export async function proposeSessionTime(uid, bookingId, startsAtText, note) {
  const cleanNote = typeof note === 'string' ? note.trim() : ''
  if (cleanNote.length > MAX_PROPOSAL_NOTE) return fail(400, 'The note must be ' + MAX_PROPOSAL_NOTE + ' characters or fewer.')
  const startsAt = new Date(typeof startsAtText === 'string' ? startsAtText : '')

  const bookingRef = db.collection('bookings').doc(bookingId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(bookingRef)
    if (!snapshot.exists) return fail(404, 'Booking not found.')
    const booking = snapshot.data()
    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (booking.status !== 'booked') return fail(409, 'Lesson times can only be changed for an active course.')

    const now = new Date()
    const problem = newTimeProblem(startsAt, now)
    if (problem) return fail(400, problem)

    const progress = stageProgressOf(booking)
    const target = schedulableStage(booking, progress, now)
    if (!target) return fail(409, nothingToSchedule(progress))
    const agreed = progress[target.stage].sessionAt
    if (agreed && new Date(agreed).getTime() === startsAt.getTime()) return fail(400, 'That is already the agreed time.')

    // answering the other person's suggestion with a different time is a counter-offer
    const old = booking.proposal && booking.proposal.stage === target.stage ? booking.proposal : null
    const round = old ? (old.from !== role ? (old.round || 1) + 1 : old.round || 1) : 1
    const changes = {
      proposal: { stage: target.stage, startsAt: startsAt.toISOString(), from: role, note: cleanNote, round: round, createdAt: now.toISOString() },
      updatedAt: now.toISOString(),
    }
    t.update(bookingRef, changes)
    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// accept true: the suggested time becomes the agreed one. false: it is dropped, nothing else changes.
export async function answerSessionTime(uid, bookingId, accept) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(bookingRef)
    if (!snapshot.exists) return fail(404, 'Booking not found.')
    const booking = snapshot.data()
    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    const proposal = booking.proposal
    if (!proposal) return fail(404, 'There is no suggested time to answer.')
    if (proposal.from === role) return fail(409, 'Wait for the other person to answer your suggestion.')

    const now = new Date()
    const progress = stageProgressOf(booking)
    const target = schedulableStage(booking, progress, now)
    if (!target || target.stage !== proposal.stage) {
      return fail(409, 'This suggestion has expired: the session is now less than ' + SCHEDULE_NOTICE_HOURS + ' hours away.')
    }

    const changes = { proposal: null, updatedAt: now.toISOString() }
    if (!accept) {
      t.update(bookingRef, changes)
      return { booking: { id: bookingId, ...booking, ...changes } }
    }

    const startsAt = new Date(proposal.startsAt)
    if (newTimeProblem(startsAt, now)) return fail(409, 'This suggested time is now too soon. Please suggest another time.')

    // The first stage's lesson is when the course starts, so moving it moves the booking: its
    // start and finish times, and the student leaves the group start time (their seat is freed).
    const stage = proposal.stage
    const movesStart = stage === 0
    const offerRef = db.collection('offers').doc(booking.offerId)
    const offerSnap = movesStart && booking.slotId ? await t.get(offerRef) : null

    // --- writes ---
    progress[stage] = {
      ...progress[stage],
      sessionAt: startsAt.toISOString(),
      noSession: false,
      rescheduleCount: progress[stage].rescheduleCount + (progress[stage].sessionAt ? 1 : 0),
    }
    changes.stageProgress = progress
    // tell the person who suggested the time that it was accepted (a red number for them, until
    // they open the class: markSeenByLearner / markSeenByTeacher)
    changes.agreedNotice = { role: proposal.from, stage: stage, startsAt: startsAt.toISOString(), at: now.toISOString() }
    if (movesStart) {
      const weeks = Number.isInteger(booking.durationWeeks) && booking.durationWeeks >= 1 ? booking.durationWeeks : 1
      changes.startsAt = startsAt.toISOString()
      changes.finishAfter = finishTime(startsAt, weeks).toISOString()
      changes.slotDate = singaporeDate(startsAt)
      changes.slotTime = new Date(startsAt.getTime() + 8 * HOUR).toISOString().slice(11, 16) // Singapore time
      changes.slotId = '' // their own time now, not one of the course's start times
      if (offerSnap && offerSnap.exists) {
        const slots = (offerSnap.data().slots || []).map((slot) =>
          slot.id === booking.slotId ? { ...slot, bookedBy: bookedByOf(slot).filter((other) => other !== booking.learnerUid) } : slot
        )
        t.update(offerRef, { slots: slots })
      }
    }
    t.update(bookingRef, changes)
    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Cancelling one session (not the course) ----------
// Either person can cancel the current stage's session until CANCEL_SESSION_HOURS before it.
// The stage then needs a new time (Book Next Session) and the other person is told.
// Each person's FIRST cancellation of a stage is free. Each one after that costs them
// SESSION_CANCEL_PENALTY credit, which goes to the other person (they kept the time free).
export const SESSION_CANCEL_PENALTY = 1

export async function cancelSession(uid, bookingId) {
  const bookingRef = db.collection('bookings').doc(bookingId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(bookingRef)
    if (!snapshot.exists) return fail(404, 'Booking not found.')
    const booking = snapshot.data()
    const role = roleOf(booking, uid)
    if (role === '') return fail(403, 'This is not your booking.')
    if (booking.status !== 'booked') return fail(409, 'Sessions can only be cancelled for an active course.')

    const now = new Date()
    const progress = stageProgressOf(booking)
    const target = cancellableSession(booking, progress, now)
    if (!target) {
      return fail(409, 'This session can no longer be cancelled: it is less than ' + CANCEL_SESSION_HOURS + ' hours away, or not booked.')
    }
    const stage = target.stage
    const myFlag = role === 'learner' ? 'cancelledByLearner' : 'cancelledByTeacher'
    const penalty = progress[stage][myFlag] === true

    // a second cancellation by the same person costs them a credit, paid to the other person
    const meRef = db.collection('users').doc(uid)
    const otherRef = db.collection('users').doc(role === 'learner' ? booking.teacherUid : booking.learnerUid)
    let meSnap = null
    let otherSnap = null
    if (penalty) {
      meSnap = await t.get(meRef)
      otherSnap = await t.get(otherRef)
      const credits = meSnap.exists ? meSnap.data().credits || 0 : 0
      if (credits < SESSION_CANCEL_PENALTY) {
        return fail(409, 'You already cancelled this stage once, so cancelling again costs ' + creditsText(SESSION_CANCEL_PENALTY) + ', and you have ' + credits + '.')
      }
      if (!otherSnap.exists) return fail(409, "The other person's account could not be found.")
    }

    // --- writes ---
    const cancelledAt = progress[stage].sessionAt
    progress[stage] = { ...progress[stage], sessionAt: '', noSession: true, [myFlag]: true }
    const changes = {
      stageProgress: progress,
      // the other person gets a red number and a note until they open the class
      sessionCancelNotice: {
        role: role === 'learner' ? 'teacher' : 'learner',
        stage: stage,
        sessionAt: cancelledAt,
        penalty: penalty,
        at: now.toISOString(),
      },
      updatedAt: now.toISOString(),
    }
    if (booking.proposal && booking.proposal.stage === stage) changes.proposal = null // a suggestion for it is void
    t.update(bookingRef, changes)
    if (penalty) {
      t.update(meRef, { credits: (meSnap.data().credits || 0) - SESSION_CANCEL_PENALTY })
      t.update(otherRef, { credits: (otherSnap.data().credits || 0) + SESSION_CANCEL_PENALTY })
    }
    return { booking: { id: bookingId, ...booking, ...changes }, penalty: penalty }
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
      // the first stage's lesson is the start time just booked; the others are agreed later
      stageProgress: details.stageNames.map((_, index) => ({
        sessionAt: index === 0 ? startsAt.toISOString() : '',
        rescheduleCount: 0,
        reflection: '',
        submittedAt: '',
        approved: false,
        approvedAt: '',
      })),
      proposal: null, // a suggested lesson time waiting for the other person (proposeSessionTime)
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

// ---------- Drop the course (the student only, any time while it is active) ----------
// Where the held credits go (dropRefunds in bookingRules.js):
//   before the start   - back to the student if more than 24 hours ahead, otherwise the teacher
//   after the start    - back to the student if fewer than half of the stages are completed,
//                        otherwise the teacher (who has taught most of it)
// Either way the seat is freed, and the teacher is told (teacherNoticeSeen, CancelNotices.vue).
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
    const progress = stageProgressOf(booking)
    const midCourse = now >= startsAt // dropping a course that has already started
    const refunded = dropRefunds(booking, progress, now)
    const approvedStages = progress.filter((stage) => stage.approved).length

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
      // after the start: how far the student got, for the messages on both sides
      droppedMidCourse: midCourse,
      stagesCompletedWhenDropped: approvedStages,
      proposal: null,
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
  if (booking.agreedNotice && booking.agreedNotice.role === 'teacher') changes.agreedNotice = null // "they accepted your time"
  if (booking.sessionCancelNotice && booking.sessionCancelNotice.role === 'teacher') changes.sessionCancelNotice = null // "they cancelled a session"
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
  if (booking.agreedNotice && booking.agreedNotice.role === 'learner') changes.agreedNotice = null // "they accepted your time"
  if (booking.sessionCancelNotice && booking.sessionCancelNotice.role === 'learner') changes.sessionCancelNotice = null // "they cancelled a session"
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

    // the other accounts are only needed when this confirmation completes the pair
    let accounts = null
    if (bothConfirmed) {
      accounts = await readFinishAccounts(t, booking)
      if (accounts.error) return accounts
    }

    // --- writes ---
    if (bothConfirmed) writeFinish(t, bookingId, booking, accounts, now, changes)
    t.update(bookingRef, changes)

    return { booking: { id: bookingId, ...booking, ...changes } }
  })
}

// ---------- Finishing a course: the teacher is paid and the student gets a skill card ----------
// Used when both people confirm (confirmBooking) and when the teacher approves the last stage
// (approveBookingStage). Inside a transaction, readFinishAccounts runs with the other reads
// (before any write) and writeFinish with the writes.

// the teacher (gets paid), the student, and the person who invited the student (if any)
async function readFinishAccounts(t, booking) {
  const teacherRef = db.collection('users').doc(booking.teacherUid)
  const learnerRef = db.collection('users').doc(booking.learnerUid)
  const teacherSnap = await t.get(teacherRef)
  if (!teacherSnap.exists) return fail(409, "The teacher's account could not be found.")

  const learnerSnap = await t.get(learnerRef)
  const learner = learnerSnap.exists ? learnerSnap.data() : {}
  // a student who was invited, and has not finished a course before, is on their first one now
  // (a teacher who invited their own student is not paid for it: that would let one person
  // farm rewards by inviting extra accounts into their own courses)
  let inviterRef = null
  let inviterSnap = null
  if (learner.referredBy && learner.referralRewarded !== true && learner.referredBy !== booking.teacherUid) {
    inviterRef = db.collection('users').doc(learner.referredBy)
    inviterSnap = await t.get(inviterRef)
  }
  return { teacherRef, teacherSnap, learnerRef, learnerSnap, inviterRef, inviterSnap }
}

// adds the "finished" fields to changes, pays everyone and writes the skill card
function writeFinish(t, bookingId, booking, accounts, now, changes) {
  const { teacherRef, teacherSnap, learnerRef, learnerSnap, inviterRef, inviterSnap } = accounts
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
    completedStageCount: (booking.stageNames || []).length,
    createdAt: now.toISOString(),
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
