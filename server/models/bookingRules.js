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

// ---------- Session times (one lesson per stage) ----------
// A session's time can be changed until this long before it, and a new time must be at least
// this far ahead. The same 24 hours as cancelling, so there is one number to remember.
export const SCHEDULE_NOTICE_HOURS = 24

// A session can be cancelled until this long before it (cancelSession in bookings.js)
export const CANCEL_SESSION_HOURS = 2

// When a stage's lesson is ('' = not booked yet). A booking made before lesson times were stored
// only has its start time, which is the first stage's lesson. A cancelled session (noSession)
// has no time until a new one is agreed, even for the first stage.
export function sessionAtOf(booking, savedStage, index) {
  if (savedStage && savedStage.noSession === true) return ''
  if (savedStage && typeof savedStage.sessionAt === 'string' && savedStage.sessionAt !== '') {
    return savedStage.sessionAt
  }
  return index === 0 ? booking.startsAt || '' : ''
}

// Can the current stage's session be cancelled now? It has to be booked and more than
// CANCEL_SESSION_HOURS away. -> { stage } or null
export function cancellableSession(booking, progress, now) {
  if (booking.status !== 'booked') return null
  const stage = currentStageIndexOf(progress)
  if (stage === -1 || !progress[stage].sessionAt) return null
  const hoursLeft = (new Date(progress[stage].sessionAt).getTime() - now.getTime()) / HOUR
  return hoursLeft > CANCEL_SESSION_HOURS ? { stage: stage } : null
}

// Dropping a course: does the student get the credits back? Before it starts, yes if it is more
// than CANCEL_HOURS_BEFORE ahead. After it has started, yes if fewer than half of its stages are
// completed; from half onwards the credits go to the teacher.
export function dropRefunds(booking, progress, now) {
  const startsAt = new Date(booking.startsAt)
  if (now < startsAt) return now < cancelDeadline(startsAt)
  const approved = progress.filter((stage) => stage.approved).length
  return approved < progress.length / 2
}

// the stage being worked on now: the first one not approved yet (-1 when every stage is done)
export function currentStageIndexOf(progress) {
  return progress.findIndex((stage) => !stage.approved)
}

// Which session can be set or changed right now, and how: { stage, kind } or null.
//   kind 'book'       - the current stage has no lesson time yet ("Book Next Session")
//   kind 'reschedule' - its lesson is more than SCHEDULE_NOTICE_HOURS away ("Reschedule")
// Nothing can be changed once the lesson is less than that away, or after it has started.
// progress is the full list of stages, each with sessionAt (see sessionAtOf).
export function schedulableStage(booking, progress, now) {
  if (booking.status !== 'booked') return null
  const stage = currentStageIndexOf(progress)
  if (stage === -1) return null
  const sessionAt = progress[stage].sessionAt
  if (!sessionAt) return { stage: stage, kind: 'book' }
  const hoursLeft = (new Date(sessionAt).getTime() - now.getTime()) / HOUR
  return hoursLeft > SCHEDULE_NOTICE_HOURS ? { stage: stage, kind: 'reschedule' } : null
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
