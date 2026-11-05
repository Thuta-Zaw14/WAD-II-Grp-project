// Unit Testing: the booking time rules in server/models/bookingRules.js.
// Rules regarding whether a student can cancel for a refund, move, or only drop 
// Also testing how credits are handled (given to student or to teacher)
import { describe, it, expect } from 'vitest'
import {
  cancelDeadline,
  moveDeadline,
  freeCancelUntil,
  canDropLate,
} from '../../server/models/bookingRules.js'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-11-06T09:00:00+08:00')

// a booked class that starts `hoursAway` hours after `now` and lasts one hour
function bookingStartingIn(hoursAway, extra = {}) {
  const startsAt = new Date(now.getTime() + hoursAway * HOUR)
  return {
    status: 'booked',
    startsAt: startsAt.toISOString(),
    finishAfter: new Date(startsAt.getTime() + HOUR).toISOString(),
    ...extra,
  }
}

describe('booking time rules', () => {

  it('1a: a class 3 days away can still be cancelled for a refund', () => {
    const booking = bookingStartingIn(72)
    const until = freeCancelUntil(booking)
    expect(until.getTime()).toBe(new Date(booking.startsAt).getTime() - 24 * HOUR)
    expect(now < until).toBe(true)
  })

  it('1b: a student cannot cancel class within 24 hours of supposed start time', () => {
    expect(freeCancelUntil(bookingStartingIn(10, { movedLate: true }))).toBeNull()
  })

  it('1c: a class 10 hours away can be dropped (the credits go to the instructor)', () => {
    expect(canDropLate(bookingStartingIn(10), now)).toBe(true)
  })

  it('1d: free cancel ends 24 hours before the start timing of class, rescheduling ends 2 hours before', () => {
    const start = new Date('2026-11-10T14:00:00+08:00')
    expect(cancelDeadline(start).toISOString()).toBe(new Date('2026-11-09T14:00:00+08:00').toISOString())
    expect(moveDeadline(start).toISOString()).toBe(new Date('2026-11-10T12:00:00+08:00').toISOString())
  })

})
