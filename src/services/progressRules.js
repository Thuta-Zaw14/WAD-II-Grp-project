// What the Progress page SHOWS: the status of each piece of homework, the time left, the on-time
// streak, the badges and the mastery journey. Plain functions (no Vue, no server), so they are
// easy to test (tests/unit/progressRules.test.js).
// The server makes the real decisions (server/models/progressRules.js); this only describes them.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const DUE_SOON_HOURS = 48

// ---------- One assignment, as the student sees it ----------
// assignment = { dueAt, canSubmit, missed, submission: { status, stars } | null }
// -> 'graded' | 'submitted' | 'redo' | 'missed' | 'dueSoon' | 'open'
export function learnerStatus(assignment, now) {
  const submission = assignment.submission
  if (submission && submission.status === 'reviewed') return 'graded'
  if (submission && submission.status === 'submitted') return 'submitted'
  if (assignment.missed) return 'missed'
  if (submission && submission.status === 'redo') return 'redo'
  if (now > new Date(assignment.dueAt)) return 'missed'
  if (new Date(assignment.dueAt) - now <= DUE_SOON_HOURS * HOUR) return 'dueSoon'
  return 'open'
}

// the words and colour of each status (the colour is a class in the page's styles)
export const STATUS_INFO = {
  open: { label: 'To do', tone: 'neutral' },
  dueSoon: { label: 'Due soon', tone: 'warning' },
  redo: { label: 'Redo requested', tone: 'warning' },
  submitted: { label: 'Waiting for feedback', tone: 'info' },
  graded: { label: 'Graded', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
}

// the statuses that still need the student to do something
export function needsAction(status) {
  return status === 'open' || status === 'dueSoon' || status === 'redo'
}

// "Due in 3 days" / "Due in 5 hours" / "Due in 20 min" / "Closed 2 days ago"
export function timeLeftText(dueAt, now) {
  const diff = new Date(dueAt) - now
  const ahead = diff >= 0
  const size = Math.abs(diff)
  let amount
  if (size >= DAY) amount = plural(Math.round(size / DAY), 'day')
  else if (size >= HOUR) amount = plural(Math.round(size / HOUR), 'hour')
  else amount = Math.max(1, Math.round(size / MINUTE)) + ' min'
  return ahead ? 'Due in ' + amount : 'Closed ' + amount + ' ago'
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's')
}

// "Fri, 7 Nov, 18:00" in Singapore time, like the rest of Kongsi
export function formatDue(dueAt) {
  return new Date(dueAt).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------- The on-time streak ----------
// Homework sent before the due date keeps the streak going; a missed one breaks it. Homework
// still open (nothing sent yet, due date not passed) does not count either way.
// -> { current, best }
export function onTimeStreak(assignments, now) {
  const decided = assignments
    .map((a) => ({ dueAt: a.dueAt, status: learnerStatus(a, now) }))
    .filter((a) => a.status === 'graded' || a.status === 'submitted' || a.status === 'missed')
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))

  let run = 0
  let best = 0
  for (const item of decided) {
    run = item.status === 'missed' ? 0 : run + 1
    best = Math.max(best, run)
  }
  return { current: run, best: best }
}

// the average of the stars an instructor gave (one decimal), or 0 when nothing is graded
export function averageStars(assignments) {
  const stars = assignments.map((a) => a.submission && a.submission.stars).filter((s) => Number.isInteger(s))
  if (stars.length === 0) return 0
  return Math.round((stars.reduce((sum, s) => sum + s, 0) / stars.length) * 10) / 10
}

// ---------- Mastery ----------
export const MASTERY_INFO = {
  learned: { rank: 1, icon: '🌱', label: 'Learned', text: 'Finished the course.' },
  practising: { rank: 2, icon: '🌿', label: 'Practising', text: 'Knows the basics and is still building them up.' },
  proficient: { rank: 3, icon: '🌳', label: 'Proficient', text: 'Does it well on their own.' },
  mastered: { rank: 4, icon: '🏆', label: 'Mastered', text: 'Could teach it to someone else.' },
}

// the levels an instructor can give at the end ('learned' is what finishing already means)
export const GRADABLE_LEVELS = ['practising', 'proficient', 'mastered']

export function masteryOf(course) {
  if (course.mastery && MASTERY_INFO[course.mastery.level]) return course.mastery.level
  return course.finished ? 'learned' : ''
}

// The four steps of learning one skill on Kongsi, for one course.
// course = { finished, mastery }, assignments = that course's homework (student view)
// -> { steps: [{ key, label, detail, done }], percent }
export function courseJourney(course, assignments, now) {
  const graded = assignments.filter((a) => learnerStatus(a, now) === 'graded').length
  const level = masteryOf(course)
  const steps = [
    { key: 'class', label: 'Class taken', detail: 'You had your lesson', done: true },
    { key: 'finished', label: 'Course finished', detail: course.finished ? 'Skill card earned' : 'Reflections in My Classes', done: course.finished },
    {
      key: 'practice',
      label: 'Practice',
      detail: assignments.length === 0 ? 'No homework yet' : graded + ' of ' + assignments.length + ' graded',
      done: assignments.length > 0 && graded === assignments.length,
    },
    {
      key: 'mastery',
      label: 'Mastery',
      detail: course.mastery ? MASTERY_INFO[level].icon + ' ' + MASTERY_INFO[level].label : 'Graded by your instructor',
      done: Boolean(course.mastery),
    },
  ]
  const done = steps.filter((s) => s.done).length
  return { steps: steps, percent: Math.round((done / steps.length) * 100) }
}

// ---------- Badges ----------
// stats = { submitted, graded, bestStreak, fiveStars, proficient, mastered }
export function badgesFor(stats) {
  return [
    { id: 'first-step', icon: '👣', name: 'First step', text: 'Send your first piece of homework', earned: stats.submitted >= 1 },
    { id: 'streak-3', icon: '🔥', name: 'On a roll', text: 'Hand in 3 assignments on time in a row', earned: stats.bestStreak >= 3 },
    { id: 'five-star', icon: '⭐', name: 'Star student', text: 'Get 5 stars on an assignment', earned: stats.fiveStars >= 1 },
    { id: 'dedicated', icon: '🎯', name: 'Dedicated', text: 'Get 10 assignments graded', earned: stats.graded >= 10 },
    { id: 'proficient', icon: '🌳', name: 'Proficient', text: 'Reach Proficient in a skill', earned: stats.proficient >= 1 },
    { id: 'mastered', icon: '🏆', name: 'Master', text: 'Reach Mastered in a skill', earned: stats.mastered >= 1 },
  ]
}

// the numbers badgesFor needs, from the page data (learning.assignments and learning.courses)
export function learnerStats(assignments, courses, now) {
  const statuses = assignments.map((a) => learnerStatus(a, now))
  const levels = courses.map((c) => (c.mastery ? MASTERY_INFO[c.mastery.level].rank : 0))
  return {
    submitted: statuses.filter((s) => s === 'submitted' || s === 'graded').length,
    graded: statuses.filter((s) => s === 'graded').length,
    bestStreak: onTimeStreak(assignments, now).best,
    fiveStars: assignments.filter((a) => a.submission && a.submission.stars === 5).length,
    proficient: levels.filter((rank) => rank >= MASTERY_INFO.proficient.rank).length,
    mastered: levels.filter((rank) => rank >= MASTERY_INFO.mastered.rank).length,
  }
}

// ---------- Video links ----------
// The id of a YouTube video (so it can play inside the page), or '' for any other link.
// youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID
export function youtubeId(link) {
  let url
  try {
    url = new URL(link)
  } catch {
    return ''
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')
  let id = ''
  if (host === 'youtu.be') id = url.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/)
      if (match) id = match[2]
    }
  }
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : ''
}
