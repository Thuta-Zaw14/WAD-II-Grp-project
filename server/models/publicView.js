// What the browser is allowed to see.
// The documents in Firestore hold things other people should not get (for example
// the uids of everyone who booked a slot), so every route sends these cut-down copies.
import { slotMoment, cancelDeadline, phaseOf, roleOf } from './bookingRules.js'

// A slot in Firestore holds the uids of the students who booked it (bookedBy).
// The browser only gets counts, plus 'mine' = did the person asking book this slot.
export function publicSlot(slot, uid) {
  const bookedBy = Array.isArray(slot.bookedBy) ? slot.bookedBy : []
  const taken = bookedBy.length
  const capacity = slot.capacity || 1

  const startsAt = slotMoment(slot.date, slot.time)
  const clockOk = !Number.isNaN(startsAt.getTime())
  const now = new Date()

  return {
    id: slot.id,
    date: slot.date,
    time: slot.time,
    capacity: capacity,
    taken: taken,
    spotsLeft: Math.max(capacity - taken, 0),
    booked: taken >= capacity, // the slot is full
    mine: bookedBy.includes(uid),
    past: clockOk ? startsAt <= now : false, // the start time has gone
    cancellable: clockOk ? now < cancelDeadline(startsAt) : false, // a booking made now could still be cancelled
    cancelBefore: clockOk ? cancelDeadline(startsAt).toISOString() : '',
  }
}

export function publicOffer(offer, uid) {
  const slots = []
  for (const slot of offer.slots || []) {
    slots.push(publicSlot(slot, uid))
  }
  return { ...offer, title: offer.title || offer.skill, slots: slots }
}

// One booking, as seen by the person asking (uid). The flags canCancel, canConfirm and
// canReport are worked out here, so the buttons on "My sessions" simply follow them.
export function publicBooking(booking, uid, now = new Date()) {
  const role = roleOf(booking, uid)
  const phase = phaseOf(booking, now)
  const learnerSide = role === 'learner'

  const myConfirmed = learnerSide ? booking.learnerConfirmed : booking.teacherConfirmed
  const otherConfirmed = learnerSide ? booking.teacherConfirmed : booking.learnerConfirmed
  const startsAt = new Date(booking.startsAt)
  const reportedByMe = booking.reportedBy === uid

  return {
    id: booking.id,
    role: role,
    offerId: booking.offerId,
    title: booking.title,
    skill: booking.skill,
    category: booking.category,
    mode: booking.mode,
    region: booking.region,
    place: booking.place,
    teacherName: booking.teacherName,
    learnerName: booking.learnerName,
    slotDate: booking.slotDate,
    slotTime: booking.slotTime,
    startsAt: booking.startsAt,
    finishAfter: booking.finishAfter,
    cancelBefore: cancelDeadline(startsAt).toISOString(),
    creditCost: booking.creditCost,
    status: booking.status,
    phase: phase,
    myConfirmed: myConfirmed === true,
    otherConfirmed: otherConfirmed === true,
    canCancel: learnerSide && booking.status === 'booked' && now < cancelDeadline(startsAt),
    canConfirm: booking.status === 'booked' && phase === 'readyToFinish' && myConfirmed !== true,
    canReport: booking.status === 'booked' && now >= startsAt,
    reportedByMe: reportedByMe,
    reportReason: reportedByMe ? booking.reportReason || '' : '', // only the person who reported sees it
    createdAt: booking.createdAt,
  }
}
