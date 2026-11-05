// What the browser is allowed to see.
// The documents in Firestore hold things other people should not get (for example
// the uids of everyone who booked a slot), so every route sends these cut-down copies.
import {
  slotMoment, cancelDeadline, phaseOf, roleOf, moveDeadline, freeCancelUntil, MAX_MOVES, awaitingNewTime, canDropLate,
} from './bookingRules.js'

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
    startsAt: clockOk ? startsAt.toISOString() : '',
    // for the teacher's "Start times" list: how often it was moved, and until when it can be moved
    // with students in it (an empty start time can be changed any time before it starts)
    moves: slot.moves || 0,
    movesLeft: Math.max(MAX_MOVES - (slot.moves || 0), 0),
    moveBefore: clockOk ? moveDeadline(startsAt).toISOString() : '',
  }
}

export function publicOffer(offer, uid) {
  const slots = []
  for (const slot of offer.slots || []) {
    slots.push(publicSlot(slot, uid))
  }
  // teacherId: the teacher's member id, for the link to their profile (/members/:uid)
  const { teacherUid, ...rest } = offer
  return { ...rest, title: offer.title || offer.skill, teacherId: teacherUid || '', isMine: teacherUid === uid, slots: slots }
}

// The notice this person has not dismissed yet (shown on Home and My Classes), or null.
//   teacher: 'cancelled' (the student cancelled), 'dropped' (the student dropped late: the teacher
//            got the credits) or 'moved' (the student moved to another time)
//   student: 'teacherMoved' or 'teacherCancelled' (the teacher moved or cancelled the start time),
//            or 'removed' (the teacher removed them from the class)
function noticeOf(booking, role) {
  if (role === 'teacher' && booking.teacherNoticeSeen === false) {
    // cancellations saved before notices had a type are 'cancelled'
    const type = booking.teacherNotice || (booking.status === 'cancelled' ? 'cancelled' : '')
    if (type === 'cancelled') {
      return { type: type, at: booking.teacherNoticeAt || booking.cancelledAt || '' }
    }
    if (type === 'dropped') {
      // the student dropped after free cancellation ended: the held credits came to the teacher
      return { type: type, at: booking.teacherNoticeAt || booking.cancelledAt || '' }
    }
    if (type === 'moved') {
      return { type: type, from: booking.teacherNoticeFrom || '', to: booking.teacherNoticeTo || '', at: booking.teacherNoticeAt || '' }
    }
  }
  if (role === 'learner' && booking.learnerNoticeSeen === false) {
    if (booking.learnerNotice === 'teacherMoved') {
      return {
        type: 'teacherMoved',
        from: booking.learnerNoticeFrom || '',
        to: booking.learnerNoticeTo || '',
        note: booking.learnerNoticeNote || '',
        at: booking.learnerNoticeAt || '',
      }
    }
    if (booking.learnerNotice === 'teacherCancelled') {
      return { type: 'teacherCancelled', note: booking.learnerNoticeNote || '', at: booking.learnerNoticeAt || '' }
    }
    if (booking.learnerNotice === 'removed') {
      // the teacher removed (kicked) the student from the class; they were refunded
      return { type: 'removed', note: booking.learnerNoticeNote || '', at: booking.learnerNoticeAt || '' }
    }
  }
  return null
}

// One booking, as seen by the person asking (uid). The flags canCancel, canMove, canConfirm and
// canReport are worked out here, so the buttons on "My sessions" simply follow them.
export function publicBooking(booking, uid, now = new Date()) {
  const role = roleOf(booking, uid)
  const phase = phaseOf(booking, now)
  const learnerSide = role === 'learner'

  const myConfirmed = learnerSide ? booking.learnerConfirmed : booking.teacherConfirmed
  const otherConfirmed = learnerSide ? booking.teacherConfirmed : booking.learnerConfirmed
  const startsAt = new Date(booking.startsAt)
  const reportedByMe = booking.reportedBy === uid
  const myReadN = (learnerSide ? booking.learnerReadN : booking.teacherReadN) || 0
  const messageCount = booking.messageCount || 0
  const allStageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
  const savedProgress = Array.isArray(booking.stageProgress) ? booking.stageProgress : []
  const allStageProgress = allStageNames.map((stageName, index) => {
    const saved = savedProgress[index] || {}
    return {
      stageName: stageName,
      reflection: typeof saved.reflection === 'string' ? saved.reflection : '',
      submittedAt: saved.submittedAt || '',
      approved: saved.approved === true,
      approvedAt: saved.approvedAt || '',
      rejected: saved.rejected === true, // the teacher sent it back: the student must rewrite it
      rejectedAt: saved.rejectedAt || '',
      rejectNote: typeof saved.rejectNote === 'string' ? saved.rejectNote : '',
    }
  })
  // cancelling (always for a full refund) and moving to another start time: see bookingRules.js
  const cancelUntil = freeCancelUntil(booking) // null: it can no longer be cancelled at all
  const studentMoves = booking.studentMoves || 0
  const firstIncomplete = allStageProgress.findIndex((stage) => !stage.approved)
  // a course is one lesson, so every stage is open at once (the reflections are written together)
  const stageNames = allStageNames
  const stageProgress = allStageProgress

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
    address: booking.address || '',
    teacherName: booking.teacherName,
    learnerName: booking.learnerName,
    otherUid: role === 'learner' ? booking.teacherUid : booking.learnerUid,
    slotId: booking.slotId,
    slotDate: booking.slotDate,
    slotTime: booking.slotTime,
    totalStageCount: allStageNames.length,
    stageNames: stageNames,
    stageProgress: stageProgress,
    completedStages: stageProgress
      .map((stage, index) => stage.approved ? index : -1)
      .filter((index) => index >= 0),
    sessionDurationMinutes: booking.sessionDurationMinutes || 60,
    startsAt: booking.startsAt,
    finishAfter: booking.finishAfter,
    cancelBefore: cancelUntil ? cancelUntil.toISOString() : '', // the end of free cancellation ('' = none)
    creditCost: booking.creditCost,
    status: booking.status,
    phase: phase,
    myConfirmed: myConfirmed === true,
    otherConfirmed: otherConfirmed === true,
    // the student can cancel for a full refund until 24 hours before the start (until the start
    // if the teacher moved it; never after moving it within the last 24 hours)
    canCancel: learnerSide && booking.status === 'booked' && cancelUntil !== null && now < cancelUntil,
    canMove: learnerSide && booking.status === 'booked' && now < moveDeadline(startsAt) && studentMoves < MAX_MOVES,
    moveBefore: moveDeadline(startsAt).toISOString(),
    movesLeft: Math.max(MAX_MOVES - studentMoves, 0),
    movedLate: booking.movedLate === true,
    teacherMoved: booking.teacherMoved === true,
    refunded: booking.refunded !== false, // false only for an old late cancellation that paid the teacher
    cancelledAt: booking.cancelledAt || '',
    finishedAt: booking.finishedAt || '', // when the last reflection was accepted (or both confirmed)
    startTimeCancelled: booking.startTimeCancelled === true, // the teacher cancelled the whole start time
    // ...and the student has not yet picked a new time or dropped the course (see bookingRules.js)
    awaitingNewTime: learnerSide && awaitingNewTime(booking),
    learnerDropped: booking.learnerDropped === true,
    // "Drop course": after the teacher cancelled the start time (free), or once free cancellation
    // is over (the held credits go to the teacher: dropPenalty)
    canDrop: learnerSide && (awaitingNewTime(booking) || canDropLate(booking, now)),
    dropPenalty: learnerSide && canDropLate(booking, now) ? booking.creditCost : 0,
    notice: noticeOf(booking, role), // something this person has not pressed "Got it" on yet
    // a student who joined since the teacher last opened the course's Students list (bookings from now on)
    newStudent: role === 'teacher' && booking.status === 'booked' && booking.teacherSeenJoin === false,
    // stages the teacher approved since the student last opened the class's Details
    newApprovals: learnerSide ? booking.learnerUnseenApprovals || 0 : 0,
    // the student writes (or rewrites) reflections once the lesson has started, until all are accepted
    canReflect: learnerSide && booking.status === 'booked' && phase !== 'upcoming' && firstIncomplete !== -1,
    // a course finishes when its last reflection is accepted; "Mark as finished" is only left for
    // old bookings without stages
    canConfirm: booking.status === 'booked' && allStageNames.length === 0 && phase === 'readyToFinish' && myConfirmed !== true,
    canReport: booking.status === 'booked' && now >= startsAt,
    reportedByMe: reportedByMe,
    reportReason: reportedByMe ? booking.reportReason || '' : '', // only the person who reported sees it
    removedByTeacher: booking.cancelledBy === 'teacher', // the teacher removed the student
    removalReason: booking.cancelledBy === 'teacher' ? booking.removalReason || '' : '',
    resolution: booking.resolution || '', // set when an admin settled a report: 'teacher-paid' or 'student-refunded'
    resolutionNote: booking.resolutionNote || '',
    createdAt: booking.createdAt,
    // the private chat of this booking (see models/chat.js)
    messageCount: messageCount,
    // can new messages still be written? (the same rule as chatIsOpen in chat.js)
    chatOpen: ['booked', 'disputed', 'finished'].includes(booking.status) || awaitingNewTime(booking),
    unreadChat: role !== '' && messageCount > myReadN && booking.lastMessageBy !== uid, // something new from the other person
    // how many of those I have not opened yet (writing a message also marks everything before it read)
    unreadCount: role !== '' ? Math.max(0, messageCount - myReadN) : 0,
  }
}

// The little header of a chat page: what the course is called and who the chat is with.
// (No uids: otherName is the name of the person on the other side.)
export function publicChatInfo(booking, uid) {
  const role = roleOf(booking, uid)
  return {
    id: booking.id,
    title: booking.title,
    role: role,
    otherName: role === 'learner' ? booking.teacherName : booking.learnerName,
    status: booking.status,
  }
}

// One chat message, as seen by the person asking (uid). The sender's uid is never sent:
// 'mine' says whether it is theirs, and 'role' says whether the sender is the student or the teacher.
export function publicMessage(message, uid) {
  return {
    id: message.id,
    n: message.n,
    mine: message.senderUid === uid,
    role: message.senderRole,
    senderName: message.senderName,
    text: message.text,
    createdAt: message.createdAt,
  }
}

// ---------- The public discussion of a course ----------

// The header of a discussion page: which course it is, who teaches it, and whether that is me.
export function publicCourseInfo(offer, uid) {
  return {
    id: offer.id,
    title: offer.title || offer.skill,
    teacherName: offer.teacherName || '',
    isMine: offer.teacherUid === uid,
  }
}

// One post, as seen by the person asking (uid). No uids are sent. A removed post has no text.
// canDelete: the author can take down their own post, the teacher can take down any post.
export function publicPost(post, uid, courseTeacherUid) {
  const removed = post.removed === true
  const mine = post.authorUid === uid
  return {
    n: post.n,
    mine: mine,
    isTeacher: post.isTeacher === true,
    authorName: post.authorName,
    text: removed ? '' : post.text,
    removed: removed,
    removedBy: removed ? post.removedBy || '' : '',
    createdAt: post.createdAt,
    canDelete: !removed && (mine || courseTeacherUid === uid),
  }
}

// ---------- Reports (the Reports page) ----------

// A report, as its own reporter sees it (no uids).
// hasNews: an admin changed it since the reporter last opened it (the "!" on the page)
export function publicReport(report) {
  return {
    id: report.id,
    title: report.title,
    type: report.type,
    targetName: report.targetName || '', // the member or course it is about
    description: report.description,
    status: report.status,
    adminNote: report.adminNote || '',
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    hasNews: report.seenByReporter === false,
  }
}

// A report, as an admin sees it: also who sent it
export function adminReport(report) {
  return {
    ...publicReport(report),
    targetId: report.targetId || '',
    reporterUid: report.reporterUid,
    reporterName: report.reporterName || '',
  }
}
