// UNIT TEST: the rules of the Progress page (homework, the on-time streak, badges and the
// mastery bonus). These are plain functions, so they are tested on their own with fixed dates:
// no browser, no server, no database. Run: pnpm exec vitest run tests/unit/progressRules.test.js
import { describe, it, expect } from 'vitest'
import { learnerStatus, timeLeftText, onTimeStreak, badgesFor, youtubeId } from '../../src/services/progressRules.js'
import { submissionWindow, redoDeadline, masteryBonusCheck, checkLinks } from '../../server/models/progressRules.js'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-11-06T12:00:00+08:00')
const inHours = (hours) => new Date(now.getTime() + hours * HOUR).toISOString()

// a piece of homework as the student sees it (see progressOverview in server/models/progress.js)
function homework(dueInHours, submission = null, extra = {}) {
  return { dueAt: inHours(dueInHours), submission, missed: false, ...extra }
}

describe('the status of a piece of homework (learnerStatus)', () => {
  it('is "open" with plenty of time left, and "dueSoon" within 48 hours', () => {
    expect(learnerStatus(homework(72), now)).toBe('open')
    expect(learnerStatus(homework(47), now)).toBe('dueSoon')
  })

  it('is "missed" once the due date passes with nothing sent', () => {
    expect(learnerStatus(homework(-1), now)).toBe('missed')
  })

  it('follows the submission once there is one: waiting, graded or redo', () => {
    expect(learnerStatus(homework(10, { status: 'submitted' }), now)).toBe('submitted')
    expect(learnerStatus(homework(-10, { status: 'reviewed', stars: 4 }), now)).toBe('graded')
    expect(learnerStatus(homework(-10, { status: 'redo' }), now)).toBe('redo') // a redo re-opens it
  })
})

describe('the time left (timeLeftText)', () => {
  it('rounds to days, hours or minutes, and says when it closed', () => {
    expect(timeLeftText(inHours(72), now)).toBe('Due in 3 days')
    expect(timeLeftText(inHours(1), now)).toBe('Due in 1 hour')
    expect(timeLeftText(inHours(0.25), now)).toBe('Due in 15 min')
    expect(timeLeftText(inHours(-48), now)).toBe('Closed 2 days ago')
  })
})

describe('the on-time streak (onTimeStreak)', () => {
  it('counts homework sent in a row, is broken by a missed one, and remembers the best run', () => {
    const list = [
      homework(-100, { status: 'reviewed', stars: 5 }),
      homework(-90, { status: 'reviewed', stars: 4 }),
      homework(-80, { status: 'reviewed', stars: 3 }),
      homework(-70), // missed: the streak starts again
      homework(-60, { status: 'submitted' }),
      homework(50), // still open: does not count either way
    ]
    expect(onTimeStreak(list, now)).toEqual({ current: 1, best: 3 })
  })

  it('is 0 when nothing has been handed in yet', () => {
    expect(onTimeStreak([homework(24)], now)).toEqual({ current: 0, best: 0 })
  })
})

describe('badges (badgesFor)', () => {
  it('earns exactly the badges whose goal was reached', () => {
    const badges = badgesFor({ submitted: 1, graded: 1, bestStreak: 3, fiveStars: 0, proficient: 1, mastered: 0 })
    const earned = badges.filter((b) => b.earned).map((b) => b.id)
    expect(earned).toEqual(['first-step', 'streak-3', 'proficient'])
  })
})

describe('video links (youtubeId and checkLinks)', () => {
  it('finds the id of a YouTube video in every common form, and nothing for other sites', () => {
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://drive.google.com/file/d/abc/view')).toBe('')
    expect(youtubeId('not a link')).toBe('')
  })

  it('only accepts http(s) links, at most two (server check)', () => {
    expect(checkLinks(['https://youtu.be/a', ' '])).toEqual({ links: ['https://youtu.be/a'] })
    expect(checkLinks(['javascript:alert(1)']).error).toBe('Links must start with https://')
    expect(checkLinks(['https://a.com', 'https://b.com', 'https://c.com']).error).toMatch(/up to 2/)
  })
})

describe('when work can be sent (server: submissionWindow and redoDeadline)', () => {
  const assignment = { dueAt: inHours(-1) }

  it('is closed after the due date, and once the work is graded', () => {
    expect(submissionWindow({ dueAt: inHours(5) }, undefined, now).ok).toBe(true)
    expect(submissionWindow(assignment, undefined, now).ok).toBe(false)
    expect(submissionWindow({ dueAt: inHours(5) }, { status: 'reviewed' }, now).ok).toBe(false)
  })

  it('re-opens for 72 hours after a redo request, even past the due date', () => {
    const redoUntil = redoDeadline(assignment, now).toISOString()
    expect(redoUntil).toBe(inHours(72))
    expect(submissionWindow(assignment, { status: 'redo', redoUntil }, now).ok).toBe(true)
    expect(submissionWindow(assignment, { status: 'redo', redoUntil }, new Date(inHours(73))).ok).toBe(false)
  })
})

describe('the mastery bonus (server: masteryBonusCheck)', () => {
  const done = [{ id: 'a1', dueAt: inHours(-48) }, { id: 'a2', dueAt: inHours(-24) }]
  const graded = { status: 'reviewed', stars: 5 }
  const base = { level: 'mastered', skill: 'Juggling', assignments: done, submissionOf: () => graded, bonusSkills: [], bonusCount: 0, now }

  it('is paid for "mastered" with every assignment done and graded', () => {
    expect(masteryBonusCheck(base).eligible).toBe(true)
  })

  it('is not paid below "mastered", or when an assignment was missed', () => {
    expect(masteryBonusCheck({ ...base, level: 'proficient' }).eligible).toBe(false)
    const missedOne = (id) => (id === 'a1' ? undefined : graded)
    expect(masteryBonusCheck({ ...base, submissionOf: missedOne })).toEqual({ eligible: false, reason: 'an assignment was missed' })
  })

  it('cannot be farmed: once per skill, at most 3 in total, and only with 2+ assignments', () => {
    expect(masteryBonusCheck({ ...base, bonusSkills: ['juggling'] }).eligible).toBe(false)
    expect(masteryBonusCheck({ ...base, bonusCount: 3 }).eligible).toBe(false)
    expect(masteryBonusCheck({ ...base, assignments: done.slice(0, 1) }).eligible).toBe(false)
  })
})
