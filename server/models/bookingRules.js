// The time rules for bookings. Plain functions: nothing in here touches the database.
// (The date maths is worked out on the server, so a wrong clock in the browser can
// never change who is allowed to cancel or finish a booking.)

const HOUR = 60 * 60 * 1000
const WEEK = 7 * 24 * HOUR

// A student can cancel (and get the credit back) until this long before the course starts
export const CANCEL_HOURS_BEFORE = 24

// "2026-11-08" and "14:00" -> a real moment in Singapore time
export function slotMoment(date, time) {
  return new Date(date + 'T' + time + ':00+08:00')
}

// the last moment a student can still cancel
export function cancelDeadline(startsAt) {
  return new Date(startsAt.getTime() - CANCEL_HOURS_BEFORE * HOUR)
}

// the first moment the course can be marked finished: the start plus the course length
export function finishTime(startsAt, durationWeeks) {
  return new Date(startsAt.getTime() + durationWeeks * WEEK)
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
