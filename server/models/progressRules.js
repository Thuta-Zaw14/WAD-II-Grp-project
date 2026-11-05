// The rules of the Progress page (homework, feedback and mastery). Plain functions: nothing in
// here touches the database, so they are easy to test and the server is the only judge of them
// (a wrong clock in the browser can never re-open a closed assignment).
//
// The story of one piece of homework:
//   1. After a class, the instructor sets an ASSIGNMENT for some of their students (a title,
//      what to practise, and a due date).
//   2. Each student sends a SUBMISSION before the due date: photos and/or video links of their
//      practice, and a short note. They can change it until it is graded or the due date passes.
//   3. The instructor GRADES it (1 to 5 stars + feedback) or asks for a REDO (with a note). A redo
//      re-opens the submission for REDO_HOURS, even after the due date.
//   4. Both sides can comment on a submission at any time.
//   5. Once the course is finished, the instructor gives a final MASTERY level. It is shown on
//      the student's skill card, and reaching "Mastered" with all homework done can earn a credit.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ---------- Limits ----------
export const MAX_TITLE_LENGTH = 80
export const MAX_INSTRUCTIONS_LENGTH = 1500
export const MAX_NOTE_LENGTH = 1000
export const MAX_FEEDBACK_LENGTH = 1000
export const MAX_COMMENT_LENGTH = 500
export const MAX_COMMENTS = 100 // per submission
export const MAX_SUMMARY_LENGTH = 600 // the final mastery comment
export const MAX_DUE_DAYS = 90 // how far ahead a due date can be
export const MIN_DUE_MINUTES = 30 // a due date must give the students at least this long
export const REDO_HOURS = 72 // how long a "please redo" keeps the submission open

// Photos are made smaller in the browser and saved in Firestore (the free Spark plan has no
// Firebase Storage). One Firestore document holds at most 1 MiB, so each photo must stay under it.
export const MAX_IMAGES = 4
export const MAX_IMAGE_CHARS = 900 * 1000 // the photo as a data: address (base64 text)
export const MAX_LINKS = 2 // video links (YouTube, Google Drive, ...)

// ---------- Mastery ----------
// 'learned' is not saved anywhere: it is what a finished course (a skill card) already means.
// The instructor then grades one of these three at the end.
export const MASTERY_LEVELS = ['practising', 'proficient', 'mastered']

// The mastery bonus: the student gets MASTERY_BONUS_CREDITS when their instructor grades them
// "mastered" AND they completed every assignment of that course (all graded, none missed).
// It is capped so it cannot be farmed: once per skill name, and MAX_MASTERY_BONUSES in total.
export const MASTERY_BONUS_CREDITS = 1
export const MIN_ASSIGNMENTS_FOR_BONUS = 2
export const MAX_MASTERY_BONUSES = 3

// ---------- Checks ----------

// "  hi  " -> "hi"; anything that is not text -> ''
export function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Checks the due date an instructor typed. -> { dueAt: Date } or { error }
export function checkDueDate(value, now) {
  const dueAt = new Date(typeof value === 'string' ? value : '')
  if (Number.isNaN(dueAt.getTime())) return { error: 'Pick a due date and time.' }
  if (dueAt.getTime() < now.getTime() + MIN_DUE_MINUTES * 60 * 1000) {
    return { error: 'The due date must be at least ' + MIN_DUE_MINUTES + ' minutes from now.' }
  }
  if (dueAt.getTime() > now.getTime() + MAX_DUE_DAYS * DAY) {
    return { error: 'The due date must be within ' + MAX_DUE_DAYS + ' days.' }
  }
  return { dueAt: dueAt }
}

// Only http(s) addresses, at most MAX_LINKS, no duplicates. -> { links } or { error }
export function checkLinks(list) {
  if (list === undefined || list === null) return { links: [] }
  if (!Array.isArray(list)) return { error: 'Video links must be a list.' }
  const links = []
  for (const item of list) {
    const text = cleanText(item)
    if (text === '') continue
    let url
    try {
      url = new URL(text)
    } catch {
      return { error: '"' + text.slice(0, 60) + '" is not a valid link.' }
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { error: 'Links must start with https://' }
    }
    if (text.length > 500) return { error: 'That link is too long.' }
    if (!links.includes(text)) links.push(text)
  }
  if (links.length > MAX_LINKS) return { error: 'You can add up to ' + MAX_LINKS + ' video links.' }
  return { links: links }
}

// a photo the browser made smaller: "data:image/jpeg;base64,..."
export function isImageDataUrl(value) {
  return (
    typeof value === 'string' &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) &&
    value.length <= MAX_IMAGE_CHARS
  )
}

// Can the student send (or change) their work now? -> { ok: true } or { ok: false, reason }
// submission is undefined when they have not sent anything yet.
export function submissionWindow(assignment, submission, now) {
  if (submission && submission.status === 'reviewed') {
    return { ok: false, reason: 'This work has been graded, so it can no longer be changed.' }
  }
  if (submission && submission.status === 'redo') {
    if (now <= new Date(submission.redoUntil)) return { ok: true }
    return { ok: false, reason: 'The time to redo this work has passed.' }
  }
  if (now <= new Date(assignment.dueAt)) return { ok: true }
  return { ok: false, reason: 'The due date has passed. Ask your instructor for more time if you need it.' }
}

// how long a redo stays open: REDO_HOURS from now, or until the due date if that is later
export function redoDeadline(assignment, now) {
  const redoEnd = new Date(now.getTime() + REDO_HOURS * HOUR)
  const due = new Date(assignment.dueAt)
  return redoEnd > due ? redoEnd : due
}

// An assignment is MISSED when its due date has passed and the student never sent anything
// (or was asked to redo it and let the redo time run out).
export function isMissed(assignment, submission, now) {
  if (!submission) return now > new Date(assignment.dueAt)
  if (submission.status === 'redo') return now > new Date(submission.redoUntil)
  return false
}

// Does this final grade earn the mastery bonus?
//   assignments: the ones this student got on this course; submissionOf(id) -> their submission
//   bonusSkills: the skills they were already rewarded for; bonusCount: how many bonuses so far
// -> { eligible: true } or { eligible: false, reason }
export function masteryBonusCheck({ level, skill, assignments, submissionOf, bonusSkills, bonusCount, now }) {
  if (MASTERY_BONUS_CREDITS <= 0) return { eligible: false, reason: 'off' }
  if (level !== 'mastered') return { eligible: false, reason: 'not mastered' }
  const skillKey = cleanText(skill).toLowerCase()
  if ((bonusSkills || []).includes(skillKey)) return { eligible: false, reason: 'already rewarded for this skill' }
  if ((bonusCount || 0) >= MAX_MASTERY_BONUSES) return { eligible: false, reason: 'bonus limit reached' }
  if (assignments.length < MIN_ASSIGNMENTS_FOR_BONUS) return { eligible: false, reason: 'too few assignments' }
  for (const assignment of assignments) {
    const submission = submissionOf(assignment.id)
    if (isMissed(assignment, submission, now)) return { eligible: false, reason: 'an assignment was missed' }
    if (!submission || submission.status !== 'reviewed') return { eligible: false, reason: 'not every assignment is graded' }
  }
  return { eligible: true }
}
