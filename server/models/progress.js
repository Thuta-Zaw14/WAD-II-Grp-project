// Everything the Progress page saves: homework (assignments), the students' work (submissions),
// the photos in that work (progressMedia), comments and grades, and the final mastery level.
// The rules themselves are plain functions in progressRules.js.
//
// Collections:
//   assignments/{auto id}            one piece of homework, set by the instructor of a course
//   submissions/{assignmentId_uid}   one student's work for one assignment (the id makes sure
//                                    there can never be two)
//   progressMedia/{auto id}          one photo of a submission (a data: address, see below)
//   masteryRecords/{offerId_uid}     the final mastery level of one student on one course
//
// Photos: the project is on Firebase's free Spark plan, which has no Firebase Storage. So the
// browser makes each photo small (see src/services/imageCompress.js) and it is saved as text in
// its own Firestore document (one document can hold up to 1 MiB). Videos are shared as links.
//
// Like models/bookings.js, every function returns its result, or { status, error } when the
// request is not allowed (status is the HTTP code the route sends back).
import { db } from '../config/firebaseAdmin.js'
import { phaseOf } from './bookingRules.js'
import {
  MAX_TITLE_LENGTH, MAX_INSTRUCTIONS_LENGTH, MAX_NOTE_LENGTH, MAX_FEEDBACK_LENGTH, MAX_COMMENT_LENGTH,
  MAX_COMMENTS, MAX_SUMMARY_LENGTH, MAX_IMAGES, MASTERY_LEVELS, MASTERY_BONUS_CREDITS,
  cleanText, checkDueDate, checkLinks, isImageDataUrl, submissionWindow, redoDeadline, isMissed, masteryBonusCheck,
} from './progressRules.js'

const MAX_STUDENTS_PER_ASSIGNMENT = 50

function fail(status, message) {
  return { status: status, error: message }
}

function toObject(doc) {
  return { id: doc.id, ...doc.data() }
}

async function whereEquals(collection, field, value) {
  const snapshot = await db.collection(collection).where(field, '==', value).get()
  return snapshot.docs.map(toObject)
}

export function submissionId(assignmentId, learnerUid) {
  return assignmentId + '_' + learnerUid
}

export function masteryId(offerId, learnerUid) {
  return offerId + '_' + learnerUid
}

// ---------- Who can get homework ----------
// Homework comes AFTER a class, so a student can get it once their lesson has started
// (status 'booked', no longer upcoming) or the course is finished. One entry per student
// (a student who took the course twice is listed once, with their latest booking).
function studentsFromBookings(bookings, now) {
  const byUid = new Map()
  for (const booking of bookings) {
    const started = booking.status === 'booked' && phaseOf(booking, now) !== 'upcoming'
    if (!started && booking.status !== 'finished') continue
    const old = byUid.get(booking.learnerUid)
    if (old && old.startsAt > booking.startsAt) continue
    byUid.set(booking.learnerUid, {
      uid: booking.learnerUid,
      name: booking.learnerName || 'Student',
      bookingId: booking.id,
      startsAt: booking.startsAt || '',
      finished: booking.status === 'finished',
    })
  }
  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function studentsOfOffer(offerId, now) {
  return studentsFromBookings(await whereEquals('bookings', 'offerId', offerId), now)
}

// ---------- What the browser is sent ----------

// the short version of a submission, for lists
function submissionSummary(submission, role) {
  if (!submission) return null
  return {
    id: submission.id,
    status: submission.status,
    stars: submission.stars || null,
    submittedAt: submission.submittedAt || '',
    reviewedAt: submission.reviewedAt || '',
    redoUntil: submission.redoUntil || '',
    commentCount: (submission.comments || []).length,
    photoCount: (submission.mediaIds || []).length,
    linkCount: (submission.links || []).length,
    news: role === 'teacher' ? submission.teacherNews === true : submission.learnerNews === true,
  }
}

function publicSubmission(submission, role) {
  if (!submission) return null
  return {
    ...submissionSummary(submission, role),
    assignmentId: submission.assignmentId,
    learnerUid: submission.learnerUid,
    learnerName: submission.learnerName || 'Student',
    note: submission.note || '',
    links: submission.links || [],
    mediaIds: submission.mediaIds || [],
    firstSubmittedAt: submission.firstSubmittedAt || '',
    feedback: submission.feedback || '',
    redoNote: submission.redoNote || '',
    comments: submission.comments || [],
  }
}

function publicAssignment(assignment) {
  return {
    id: assignment.id,
    offerId: assignment.offerId,
    teacherUid: assignment.teacherUid,
    teacherName: assignment.teacherName || 'Instructor',
    courseTitle: assignment.courseTitle || '',
    skill: assignment.skill || '',
    category: assignment.category || '',
    title: assignment.title,
    instructions: assignment.instructions || '',
    dueAt: assignment.dueAt,
    learnerUids: assignment.learnerUids || [],
    createdAt: assignment.createdAt || '',
  }
}

function publicMastery(record) {
  if (!record) return null
  return {
    id: record.id,
    offerId: record.offerId,
    learnerUid: record.learnerUid,
    learnerName: record.learnerName || '',
    teacherName: record.teacherName || '',
    skill: record.skill || '',
    courseTitle: record.courseTitle || '',
    level: record.level,
    summary: record.summary || '',
    gradedAt: record.gradedAt || '',
    bonusCredits: record.bonusPaid ? record.bonusCredits || 0 : 0,
  }
}

// ---------- The whole page at once ----------
// -> { learning: { courses, assignments }, teaching: { courses, toReview }, counts }
export async function progressOverview(uid, now) {
  const [
    asLearner, asTeacher, myOffers, givenToMe, setByMe, mySubmissions, theirSubmissions, myMastery, givenMastery,
  ] = await Promise.all([
    whereEquals('bookings', 'learnerUid', uid),
    whereEquals('bookings', 'teacherUid', uid),
    whereEquals('offers', 'teacherUid', uid),
    db.collection('assignments').where('learnerUids', 'array-contains', uid).get().then((s) => s.docs.map(toObject)),
    whereEquals('assignments', 'teacherUid', uid),
    whereEquals('submissions', 'learnerUid', uid),
    whereEquals('submissions', 'teacherUid', uid),
    whereEquals('masteryRecords', 'learnerUid', uid),
    whereEquals('masteryRecords', 'teacherUid', uid),
  ])

  // ----- as a student -----
  const mySubmissionOf = new Map(mySubmissions.map((s) => [s.assignmentId, s]))
  const myMasteryOf = new Map(myMastery.map((m) => [m.offerId, m]))

  const learningAssignments = givenToMe
    .map((assignment) => {
      const submission = mySubmissionOf.get(assignment.id)
      return {
        ...publicAssignment(assignment),
        learnerUids: undefined, // the other students on the course are not my business
        submission: submissionSummary(submission, 'learner'),
        canSubmit: submissionWindow(assignment, submission, now).ok,
        missed: isMissed(assignment, submission, now),
      }
    })
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))

  // one course per offer I have taken (latest booking), plus courses I only have homework for
  const learningCourses = new Map()
  for (const booking of asLearner) {
    const started = booking.status === 'booked' && phaseOf(booking, now) !== 'upcoming'
    if (!started && booking.status !== 'finished') continue
    const old = learningCourses.get(booking.offerId)
    if (old && old.startsAt > booking.startsAt) continue
    learningCourses.set(booking.offerId, {
      offerId: booking.offerId,
      bookingId: booking.id,
      title: booking.title || booking.skill || 'Course',
      skill: booking.skill || '',
      category: booking.category || '',
      teacherName: booking.teacherName || 'Instructor',
      teacherUid: booking.teacherUid,
      startsAt: booking.startsAt || '',
      finished: booking.status === 'finished',
      mastery: publicMastery(myMasteryOf.get(booking.offerId)),
    })
  }
  for (const assignment of givenToMe) {
    if (learningCourses.has(assignment.offerId)) continue
    learningCourses.set(assignment.offerId, {
      offerId: assignment.offerId,
      bookingId: '',
      title: assignment.courseTitle || assignment.skill || 'Course',
      skill: assignment.skill || '',
      category: assignment.category || '',
      teacherName: assignment.teacherName || 'Instructor',
      teacherUid: assignment.teacherUid,
      startsAt: '',
      finished: false,
      mastery: publicMastery(myMasteryOf.get(assignment.offerId)),
    })
  }

  // ----- as an instructor -----
  const submissionsByAssignment = new Map()
  for (const submission of theirSubmissions) {
    if (!submissionsByAssignment.has(submission.assignmentId)) submissionsByAssignment.set(submission.assignmentId, [])
    submissionsByAssignment.get(submission.assignmentId).push(submission)
  }
  const masteryGiven = new Map(givenMastery.map((m) => [m.id, m]))
  const bookingsByOffer = new Map()
  for (const booking of asTeacher) {
    if (!bookingsByOffer.has(booking.offerId)) bookingsByOffer.set(booking.offerId, [])
    bookingsByOffer.get(booking.offerId).push(booking)
  }

  const offerInfo = new Map(myOffers.map((o) => [o.id, { title: o.title || o.skill, skill: o.skill, category: o.category }]))
  for (const assignment of setByMe) {
    if (!offerInfo.has(assignment.offerId)) {
      offerInfo.set(assignment.offerId, { title: assignment.courseTitle, skill: assignment.skill, category: assignment.category })
    }
  }

  const teachingCourses = []
  for (const [offerId, info] of offerInfo) {
    const students = studentsFromBookings(bookingsByOffer.get(offerId) || [], now).map((student) => ({
      ...student,
      mastery: publicMastery(masteryGiven.get(masteryId(offerId, student.uid))),
    }))
    const assignments = setByMe
      .filter((a) => a.offerId === offerId)
      .map((assignment) => {
        const subs = submissionsByAssignment.get(assignment.id) || []
        return {
          ...publicAssignment(assignment),
          learnerCount: (assignment.learnerUids || []).length,
          submittedCount: subs.length,
          toReviewCount: subs.filter((s) => s.status === 'submitted').length,
          reviewedCount: subs.filter((s) => s.status === 'reviewed').length,
        }
      })
      .sort((a, b) => (a.dueAt < b.dueAt ? 1 : -1)) // newest due date first
    teachingCourses.push({
      offerId: offerId,
      title: info.title || 'Course',
      skill: info.skill || '',
      category: info.category || '',
      students: students,
      assignments: assignments,
    })
  }
  // courses with students first, then by name
  teachingCourses.sort((a, b) => {
    if ((a.students.length > 0) !== (b.students.length > 0)) return a.students.length > 0 ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  const assignmentTitle = new Map(setByMe.map((a) => [a.id, a]))
  const toReview = theirSubmissions
    .filter((s) => s.status === 'submitted' && assignmentTitle.has(s.assignmentId))
    .map((s) => ({
      id: s.id,
      assignmentId: s.assignmentId,
      assignmentTitle: assignmentTitle.get(s.assignmentId).title,
      courseTitle: assignmentTitle.get(s.assignmentId).courseTitle || '',
      learnerUid: s.learnerUid,
      learnerName: s.learnerName || 'Student',
      submittedAt: s.submittedAt,
      photoCount: (s.mediaIds || []).length,
      linkCount: (s.links || []).length,
    }))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1)) // oldest first: fair to students

  // ----- the red number on "Progress" in the nav bar -----
  const learnerToDo = learningAssignments.filter(
    (a) => a.canSubmit && (!a.submission || a.submission.status === 'redo')
  ).length
  const learnerNews = learningAssignments.filter((a) => a.submission && a.submission.news).length
  const teacherNews = theirSubmissions.filter((s) => s.teacherNews === true && s.status !== 'submitted').length

  return {
    learning: {
      courses: [...learningCourses.values()].sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)),
      assignments: learningAssignments,
    },
    teaching: { courses: teachingCourses, toReview: toReview },
    counts: {
      learning: learnerToDo + learnerNews,
      teaching: toReview.length + teacherNews,
    },
  }
}

// ---------- One assignment ----------
// The student sees their own work; the instructor sees every student's.
export async function getAssignment(uid, assignmentId, now) {
  const snapshot = await db.collection('assignments').doc(assignmentId).get()
  if (!snapshot.exists) return fail(404, 'Assignment not found.')
  const assignment = toObject(snapshot)

  if (assignment.teacherUid === uid) {
    const [subs, eligible] = await Promise.all([
      whereEquals('submissions', 'assignmentId', assignmentId),
      studentsOfOffer(assignment.offerId, now),
    ])
    const submissionOf = new Map(subs.map((s) => [s.learnerUid, s]))
    const students = (assignment.learnerUids || []).map((learnerUid) => {
      const submission = submissionOf.get(learnerUid)
      return {
        uid: learnerUid,
        name: (assignment.learnerNames || {})[learnerUid] || (submission && submission.learnerName) || 'Student',
        submission: publicSubmission(submission, 'teacher'),
        missed: isMissed(assignment, submission, now),
      }
    })
    return {
      role: 'teacher',
      assignment: publicAssignment(assignment),
      students: students,
      // students who could still be added to this assignment
      otherStudents: eligible.filter((s) => !(assignment.learnerUids || []).includes(s.uid)).map((s) => ({ uid: s.uid, name: s.name })),
    }
  }

  if ((assignment.learnerUids || []).includes(uid)) {
    const subSnap = await db.collection('submissions').doc(submissionId(assignmentId, uid)).get()
    const submission = subSnap.exists ? toObject(subSnap) : undefined
    const window = submissionWindow(assignment, submission, now)
    return {
      role: 'learner',
      assignment: { ...publicAssignment(assignment), learnerUids: undefined },
      submission: publicSubmission(submission, 'learner'),
      canSubmit: window.ok,
      closedReason: window.ok ? '' : window.reason,
      missed: isMissed(assignment, submission, now),
    }
  }

  // not theirs: say "not found" instead of hinting that it exists
  return fail(404, 'Assignment not found.')
}

// ---------- The instructor sets, changes and removes homework ----------

function checkAssignmentText(body) {
  const title = cleanText(body.title)
  const instructions = cleanText(body.instructions)
  if (title === '') return { error: 'Give the assignment a title.' }
  if (title.length > MAX_TITLE_LENGTH) return { error: 'Keep the title to ' + MAX_TITLE_LENGTH + ' characters.' }
  if (instructions === '') return { error: 'Tell your students what to practise.' }
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return { error: 'Keep the instructions to ' + MAX_INSTRUCTIONS_LENGTH + ' characters.' }
  }
  return { title, instructions }
}

// body = { offerId, title, instructions, dueAt, learnerUids: [...] } -> { assignment }
export async function createAssignment(uid, body, now) {
  const offerId = cleanText(body.offerId)
  if (offerId === '' || offerId.includes('/')) return fail(400, 'Pick one of your courses.')
  const offerSnap = await db.collection('offers').doc(offerId).get()
  if (!offerSnap.exists) return fail(404, 'Course not found.')
  const offer = offerSnap.data()
  if (offer.teacherUid !== uid) return fail(403, 'Only the instructor of this course can set homework.')

  const text = checkAssignmentText(body)
  if (text.error) return fail(400, text.error)
  const due = checkDueDate(body.dueAt, now)
  if (due.error) return fail(400, due.error)

  const eligible = await studentsOfOffer(offerId, now)
  const wanted = Array.isArray(body.learnerUids) ? [...new Set(body.learnerUids)] : []
  if (wanted.length === 0) return fail(400, 'Pick at least one student.')
  if (wanted.length > MAX_STUDENTS_PER_ASSIGNMENT) return fail(400, 'Pick at most ' + MAX_STUDENTS_PER_ASSIGNMENT + ' students.')
  const learnerNames = {}
  for (const learnerUid of wanted) {
    const student = eligible.find((s) => s.uid === learnerUid)
    if (!student) return fail(400, 'Homework can only be set for students who have had their class.')
    learnerNames[learnerUid] = student.name
  }

  const nowText = now.toISOString()
  const assignment = {
    offerId: offerId,
    teacherUid: uid,
    teacherName: offer.teacherName || 'Instructor',
    courseTitle: offer.title || offer.skill || '',
    skill: offer.skill || '',
    category: offer.category || '',
    title: text.title,
    instructions: text.instructions,
    dueAt: due.dueAt.toISOString(),
    learnerUids: wanted,
    learnerNames: learnerNames,
    createdAt: nowText,
    updatedAt: nowText,
  }
  const ref = await db.collection('assignments').add(assignment)
  return { assignment: publicAssignment({ id: ref.id, ...assignment }) }
}

// body = { title, instructions, dueAt, addLearnerUids } (students can be added, never removed,
// so nobody's work disappears) -> { assignment }
export async function updateAssignment(uid, assignmentId, body, now) {
  const ref = db.collection('assignments').doc(assignmentId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return fail(404, 'Assignment not found.')
  const assignment = snapshot.data()
  if (assignment.teacherUid !== uid) return fail(403, 'Only the instructor can change this assignment.')

  const text = checkAssignmentText(body)
  if (text.error) return fail(400, text.error)
  const changes = { title: text.title, instructions: text.instructions, updatedAt: now.toISOString() }

  if (body.dueAt !== assignment.dueAt) {
    const due = checkDueDate(body.dueAt, now)
    if (due.error) return fail(400, due.error)
    changes.dueAt = due.dueAt.toISOString()
  }

  const toAdd = Array.isArray(body.addLearnerUids) ? [...new Set(body.addLearnerUids)] : []
  if (toAdd.length > 0) {
    const eligible = await studentsOfOffer(assignment.offerId, now)
    const learnerUids = [...(assignment.learnerUids || [])]
    const learnerNames = { ...(assignment.learnerNames || {}) }
    for (const learnerUid of toAdd) {
      if (learnerUids.includes(learnerUid)) continue
      const student = eligible.find((s) => s.uid === learnerUid)
      if (!student) return fail(400, 'Homework can only be set for students who have had their class.')
      learnerUids.push(learnerUid)
      learnerNames[learnerUid] = student.name
    }
    if (learnerUids.length > MAX_STUDENTS_PER_ASSIGNMENT) return fail(400, 'Pick at most ' + MAX_STUDENTS_PER_ASSIGNMENT + ' students.')
    changes.learnerUids = learnerUids
    changes.learnerNames = learnerNames
  }

  await ref.update(changes)
  return { assignment: publicAssignment({ id: assignmentId, ...assignment, ...changes }) }
}

// removes the assignment, every submission of it and their photos
export async function deleteAssignment(uid, assignmentId) {
  const ref = db.collection('assignments').doc(assignmentId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return fail(404, 'Assignment not found.')
  if (snapshot.data().teacherUid !== uid) return fail(403, 'Only the instructor can remove this assignment.')

  const subs = await whereEquals('submissions', 'assignmentId', assignmentId)
  const refs = [ref]
  for (const submission of subs) {
    refs.push(db.collection('submissions').doc(submission.id))
    for (const mediaId of submission.mediaIds || []) refs.push(db.collection('progressMedia').doc(mediaId))
  }
  // a batch holds at most 500 writes
  for (let start = 0; start < refs.length; start += 450) {
    const batch = db.batch()
    for (const docRef of refs.slice(start, start + 450)) batch.delete(docRef)
    await batch.commit()
  }
  return { ok: true, removed: subs.length }
}

// ---------- The student sends their work ----------
// body = { note, links: [...], keepMediaIds: [...], images: ["data:image/jpeg;base64,...", ...] }
// keepMediaIds are photos already saved that should stay; images are new ones.
export async function submitWork(uid, assignmentId, body, now) {
  const note = cleanText(body.note)
  if (note.length > MAX_NOTE_LENGTH) return fail(400, 'Keep your note to ' + MAX_NOTE_LENGTH + ' characters.')
  const linkCheck = checkLinks(body.links)
  if (linkCheck.error) return fail(400, linkCheck.error)
  const images = Array.isArray(body.images) ? body.images : []
  for (const image of images) {
    if (!isImageDataUrl(image)) return fail(400, 'One of the photos could not be read or is too large. Try another photo.')
  }
  const keep = Array.isArray(body.keepMediaIds) ? body.keepMediaIds : []

  const assignmentRef = db.collection('assignments').doc(assignmentId)
  const subRef = db.collection('submissions').doc(submissionId(assignmentId, uid))

  return db.runTransaction(async (t) => {
    const assignmentSnap = await t.get(assignmentRef)
    if (!assignmentSnap.exists) return fail(404, 'Assignment not found.')
    const assignment = assignmentSnap.data()
    if (!(assignment.learnerUids || []).includes(uid)) return fail(404, 'Assignment not found.')

    const subSnap = await t.get(subRef)
    const old = subSnap.exists ? subSnap.data() : undefined
    const window = submissionWindow(assignment, old, now)
    if (!window.ok) return fail(409, window.reason)

    const oldMedia = (old && old.mediaIds) || []
    const kept = oldMedia.filter((id) => keep.includes(id))
    if (kept.length + images.length > MAX_IMAGES) return fail(400, 'You can attach up to ' + MAX_IMAGES + ' photos.')
    if (kept.length + images.length + linkCheck.links.length === 0) {
      return fail(400, 'Add at least one photo or video link to show your progress.')
    }

    const nowText = now.toISOString()
    const newIds = []
    for (const image of images) {
      const mediaRef = db.collection('progressMedia').doc()
      t.set(mediaRef, {
        submissionId: subRef.id,
        assignmentId: assignmentId,
        learnerUid: uid,
        teacherUid: assignment.teacherUid,
        dataUrl: image,
        chars: image.length,
        createdAt: nowText,
      })
      newIds.push(mediaRef.id)
    }
    for (const id of oldMedia) {
      if (!kept.includes(id)) t.delete(db.collection('progressMedia').doc(id))
    }

    const submission = {
      assignmentId: assignmentId,
      offerId: assignment.offerId,
      teacherUid: assignment.teacherUid,
      teacherName: assignment.teacherName || 'Instructor',
      learnerUid: uid,
      learnerName: (assignment.learnerNames || {})[uid] || (old && old.learnerName) || 'Student',
      note: note,
      links: linkCheck.links,
      mediaIds: [...kept, ...newIds],
      status: 'submitted',
      submittedAt: nowText,
      firstSubmittedAt: (old && old.firstSubmittedAt) || nowText,
      stars: null,
      feedback: '',
      reviewedAt: '',
      redoNote: (old && old.redoNote) || '', // kept so the instructor sees what they asked for
      redoUntil: '',
      comments: (old && old.comments) || [],
      learnerNews: false,
      teacherNews: false,
      updatedAt: nowText,
    }
    t.set(subRef, submission)
    return { submission: publicSubmission({ id: subRef.id, ...submission }, 'learner') }
  })
}

// ---------- Comments (both sides) ----------
export async function addComment(uid, subId, text, now) {
  const clean = cleanText(text)
  if (clean === '') return fail(400, 'Write a comment first.')
  if (clean.length > MAX_COMMENT_LENGTH) return fail(400, 'Keep comments to ' + MAX_COMMENT_LENGTH + ' characters.')

  const ref = db.collection('submissions').doc(subId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(ref)
    if (!snapshot.exists) return fail(404, 'Submission not found.')
    const submission = snapshot.data()
    const role = submission.teacherUid === uid ? 'teacher' : submission.learnerUid === uid ? 'learner' : ''
    if (!role) return fail(404, 'Submission not found.')
    const comments = submission.comments || []
    if (comments.length >= MAX_COMMENTS) return fail(409, 'This conversation is full. Use the class chat instead.')

    const comment = {
      by: role,
      name: role === 'teacher' ? submission.teacherName || 'Instructor' : submission.learnerName || 'Student',
      text: clean,
      at: now.toISOString(),
    }
    const changes = { comments: [...comments, comment], updatedAt: comment.at }
    if (role === 'teacher') changes.learnerNews = true
    else changes.teacherNews = true
    t.update(ref, changes)
    return { submission: publicSubmission({ id: subId, ...submission, ...changes }, role) }
  })
}

// ---------- The instructor grades or asks for a redo ----------
// body = { action: 'grade', stars: 1-5, feedback } or { action: 'redo', note }
export async function reviewSubmission(uid, subId, body, now) {
  const ref = db.collection('submissions').doc(subId)
  return db.runTransaction(async (t) => {
    const snapshot = await t.get(ref)
    if (!snapshot.exists) return fail(404, 'Submission not found.')
    const submission = snapshot.data()
    if (submission.teacherUid !== uid) return fail(403, 'Only the instructor can grade this work.')
    const assignmentSnap = await t.get(db.collection('assignments').doc(submission.assignmentId))
    if (!assignmentSnap.exists) return fail(404, 'Assignment not found.')

    const nowText = now.toISOString()
    let changes
    if (body.action === 'grade') {
      if (submission.status !== 'submitted' && submission.status !== 'reviewed') {
        return fail(409, 'There is no new work to grade.')
      }
      const stars = body.stars
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail(400, 'Pick 1 to 5 stars.')
      const feedback = cleanText(body.feedback)
      if (feedback.length > MAX_FEEDBACK_LENGTH) return fail(400, 'Keep feedback to ' + MAX_FEEDBACK_LENGTH + ' characters.')
      changes = { status: 'reviewed', stars, feedback, reviewedAt: nowText, redoUntil: '' }
    } else if (body.action === 'redo') {
      if (submission.status !== 'submitted') return fail(409, 'You can only ask for a redo on work that has not been graded.')
      const note = cleanText(body.note)
      if (note === '') return fail(400, 'Tell the student what to change.')
      if (note.length > MAX_FEEDBACK_LENGTH) return fail(400, 'Keep the note to ' + MAX_FEEDBACK_LENGTH + ' characters.')
      changes = {
        status: 'redo',
        redoNote: note,
        redoUntil: redoDeadline(assignmentSnap.data(), now).toISOString(),
        stars: null,
        reviewedAt: nowText,
      }
    } else {
      return fail(400, 'Unknown action.')
    }
    changes.learnerNews = true
    changes.teacherNews = false
    changes.updatedAt = nowText
    t.update(ref, changes)
    return { submission: publicSubmission({ id: subId, ...submission, ...changes }, 'teacher') }
  })
}

// the person opened the submission: their red number for it goes away
export async function markSubmissionSeen(uid, subId) {
  const ref = db.collection('submissions').doc(subId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return fail(404, 'Submission not found.')
  const submission = snapshot.data()
  if (submission.learnerUid === uid) {
    if (submission.learnerNews === true) await ref.update({ learnerNews: false })
  } else if (submission.teacherUid === uid) {
    if (submission.teacherNews === true) await ref.update({ teacherNews: false })
  } else {
    return fail(404, 'Submission not found.')
  }
  return { ok: true }
}

// one photo, only for the student who sent it and their instructor
export async function getMedia(uid, mediaId) {
  const snapshot = await db.collection('progressMedia').doc(mediaId).get()
  if (!snapshot.exists) return fail(404, 'Photo not found.')
  const media = snapshot.data()
  if (media.learnerUid !== uid && media.teacherUid !== uid) return fail(404, 'Photo not found.')
  return { id: mediaId, dataUrl: media.dataUrl }
}

// ---------- The final mastery level ----------
// body = { offerId, learnerUid, level, summary } -> { record, bonusCredits }
// Only once the course is finished. It is copied onto the student's skill card, and the first
// "mastered" may pay the mastery bonus (see masteryBonusCheck in progressRules.js).
export async function setMastery(uid, body, now) {
  const offerId = cleanText(body.offerId)
  const learnerUid = cleanText(body.learnerUid)
  if (!offerId || !learnerUid || offerId.includes('/') || learnerUid.includes('/')) return fail(400, 'Pick a student.')
  const level = body.level
  if (!MASTERY_LEVELS.includes(level)) return fail(400, 'Pick a mastery level.')
  const summary = cleanText(body.summary)
  if (summary === '') return fail(400, 'Write a short summary of their progress.')
  if (summary.length > MAX_SUMMARY_LENGTH) return fail(400, 'Keep the summary to ' + MAX_SUMMARY_LENGTH + ' characters.')

  const offerRef = db.collection('offers').doc(offerId)
  const learnerRef = db.collection('users').doc(learnerUid)
  const recordRef = db.collection('masteryRecords').doc(masteryId(offerId, learnerUid))

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const offer = offerSnap.data()
    if (offer.teacherUid !== uid) return fail(403, 'Only the instructor of this course can grade mastery.')

    const bookingsSnap = await t.get(db.collection('bookings').where('offerId', '==', offerId))
    const finished = bookingsSnap.docs
      .map(toObject)
      .filter((b) => b.learnerUid === learnerUid && b.status === 'finished')
      .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1))
    if (finished.length === 0) return fail(409, 'You can give the final grade once their course is finished.')
    const booking = finished[0]

    const learnerSnap = await t.get(learnerRef)
    if (!learnerSnap.exists) return fail(404, 'Student not found.')
    const learner = learnerSnap.data()
    const recordSnap = await t.get(recordRef)
    const old = recordSnap.exists ? recordSnap.data() : null
    const cardRef = db.collection('skillCards').doc(booking.id)
    const cardSnap = await t.get(cardRef)

    const assignmentsSnap = await t.get(db.collection('assignments').where('offerId', '==', offerId))
    const assignments = assignmentsSnap.docs.map(toObject).filter((a) => (a.learnerUids || []).includes(learnerUid))
    const subsSnap = await t.get(db.collection('submissions').where('learnerUid', '==', learnerUid))
    const subOf = new Map(subsSnap.docs.map(toObject).filter((s) => s.offerId === offerId).map((s) => [s.assignmentId, s]))

    // --- the bonus ---
    let bonusCredits = 0
    if (!(old && old.bonusPaid)) {
      const check = masteryBonusCheck({
        level,
        skill: booking.skill || offer.skill,
        assignments,
        submissionOf: (id) => subOf.get(id),
        bonusSkills: learner.masteryBonusSkills || [],
        bonusCount: learner.masteryBonusCount || 0,
        now,
      })
      if (check.eligible) bonusCredits = MASTERY_BONUS_CREDITS
    }

    // --- writes ---
    const nowText = now.toISOString()
    const record = {
      offerId,
      learnerUid,
      learnerName: learner.name || booking.learnerName || 'Student',
      teacherUid: uid,
      teacherName: offer.teacherName || booking.teacherName || 'Instructor',
      bookingId: booking.id,
      skill: booking.skill || offer.skill || '',
      courseTitle: booking.title || offer.title || '',
      category: booking.category || offer.category || '',
      level,
      summary,
      gradedAt: nowText,
      firstGradedAt: (old && old.firstGradedAt) || nowText,
      bonusPaid: (old && old.bonusPaid) || bonusCredits > 0,
      bonusCredits: (old && old.bonusCredits) || bonusCredits,
      learnerNews: true,
    }
    t.set(recordRef, record)
    if (cardSnap.exists) {
      t.update(cardRef, { masteryLevel: level, masterySummary: summary, masteryGradedAt: nowText })
    }
    if (bonusCredits > 0) {
      const skillKey = cleanText(record.skill).toLowerCase()
      t.update(learnerRef, {
        credits: (learner.credits || 0) + bonusCredits,
        masteryBonusSkills: [...(learner.masteryBonusSkills || []), skillKey],
        masteryBonusCount: (learner.masteryBonusCount || 0) + 1,
      })
    }
    return { record: publicMastery({ id: recordRef.id, ...record }), bonusCredits }
  })
}
