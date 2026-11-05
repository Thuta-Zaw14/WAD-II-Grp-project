// The time rules for bookings. Plain functions: nothing in here touches the database.
// (The date maths is worked out on the server, so a wrong clock in the browser can
// never change who is allowed to cancel or finish a booking.)

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// A student can cancel (and get the credit back) until this long before the course starts
export const CANCEL_HOURS_BEFORE = 24

// Moving a class to another start time (the student moves their booking, the teacher moves a
// whole start time): allowed until this long before the current start...
export const MOVE_HOURS_BEFORE = 2
// ...the new start time must be more than this far away, so the other side has time to see it...
export const NEW_TIME_HOURS_AHEAD = 24
// ...and it can happen this many times (per booking for a student, per start time for a teacher)
export const MAX_MOVES = 2

// "2026-11-08" and "14:00" -> a real moment in Singapore time
export function slotMoment(date, time) {
  return new Date(date + 'T' + time + ':00+08:00')
}

// the last moment a student can still cancel
export function cancelDeadline(startsAt) {
  return new Date(startsAt.getTime() - CANCEL_HOURS_BEFORE * HOUR)
}

// the last moment a class can still be moved to another start time
export function moveDeadline(startsAt) {
  return new Date(startsAt.getTime() - MOVE_HOURS_BEFORE * HOUR)
}

// a new start time must be later than this
export function earliestNewTime(now) {
  return new Date(now.getTime() + NEW_TIME_HOURS_AHEAD * HOUR)
}

// The last moment the student can cancel for a refund:
//   - the teacher moved the class: until it starts (the student never agreed to the new time)
//   - the student moved it within the last 24 hours before its start ("moved late"): never again
//   - otherwise: 24 hours before the start
// -> a Date, or null if the booking can no longer be cancelled at all
export function freeCancelUntil(booking) {
  const startsAt = new Date(booking.startsAt)
  if (booking.teacherMoved === true) return startsAt
  if (booking.movedLate === true) return null
  return cancelDeadline(startsAt)
}

// the first moment the course can be marked finished: a course is one lesson, so the start
// plus the lesson's length in minutes
export function finishTime(startsAt, lessonMinutes) {
  return new Date(startsAt.getTime() + lessonMinutes * MINUTE)
}

// today's date in Singapore as "2026-11-08" (used for the date on a skill card)
export function singaporeDate(now) {
  return new Date(now.getTime() + 8 * HOUR).toISOString().slice(0, 10)
}

// "Sat, 8 Nov, 14:00" in Singapore time (used in messages sent to the browser)
export function describeMoment(date) {
  return date.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 'learner', 'teacher', or '' if this uid has nothing to do with the booking
export function roleOf(booking, uid) {
  if (booking.learnerUid === uid) return 'learner'
  if (booking.teacherUid === uid) return 'teacher'
  return ''
}

// Free cancellation is over (see freeCancelUntil) but the class is still on: the student may still
// DROP it, and then the held credits go to the teacher (dropCourse in bookings.js). Allowed until
// the lesson is over.
export function canDropLate(booking, now) {
  if (booking.status !== 'booked') return false
  const cancelUntil = freeCancelUntil(booking)
  if (cancelUntil !== null && now < cancelUntil) return false // a free cancel is still possible
  return now < new Date(booking.finishAfter)
}

// The teacher cancelled this student's start time (the student was refunded) and the student has
// not yet picked a new time (rebookAfterCancel) or dropped the course (dropCourse).
// Until then the chat stays open, so they can ask the teacher for another time.
export function awaitingNewTime(booking) {
  return booking.status === 'cancelled' && booking.startTimeCancelled === true && booking.learnerDropped !== true
}

// Where a booking is in its life. status is what is saved ('booked', 'finished',
// 'cancelled', 'disputed'); a 'booked' one is split into three by the clock:
//   upcoming       - the course has not started
//   inProgress     - it has started, but is not over yet
//   readyToFinish  - it is over: both people can now confirm it
export function phaseOf(booking, now) {
  if (booking.status !== 'booked') return booking.status
  if (now < new Date(booking.startsAt)) return 'upcoming'
  if (now < new Date(booking.finishAfter)) return 'inProgress'
  return 'readyToFinish'
}
