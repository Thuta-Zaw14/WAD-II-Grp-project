// What the browser is allowed to see.
// The documents in Firestore hold things other people should not get (for example
// the uids of everyone who booked a slot), so every route sends these cut-down copies.
import {
  slotMoment, cancelDeadline, phaseOf, roleOf, sessionAtOf, schedulableStage, cancellableSession, dropRefunds,
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
  }
}

export function publicOffer(offer, uid) {
  const slots = []
  for (const slot of offer.slots || []) {
    slots.push(publicSlot(slot, uid))
  }
  // the teacher's uid stays on the server: the browser only needs to know whether the course is mine
  const { teacherUid, ...rest } = offer
  return { ...rest, title: offer.title || offer.skill, isMine: teacherUid === uid, slots: slots }
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
  const myReadN = (learnerSide ? booking.learnerReadN : booking.teacherReadN) || 0
  const messageCount = booking.messageCount || 0
  const allStageNames = Array.isArray(booking.stageNames) ? booking.stageNames : []
  const savedProgress = Array.isArray(booking.stageProgress) ? booking.stageProgress : []
  const allStageProgress = allStageNames.map((stageName, index) => {
    const saved = savedProgress[index] || {}
    return {
      stageName: stageName,
      sessionAt: sessionAtOf(booking, saved, index), // when this stage's lesson is ('' = not booked yet)
      // has the person asking used their one free cancellation of this stage's session?
      myCancelUsed: (learnerSide ? saved.cancelledByLearner : saved.cancelledByTeacher) === true,
      reflection: typeof saved.reflection === 'string' ? saved.reflection : '',
      submittedAt: saved.submittedAt || '',
      approved: saved.approved === true,
      approvedAt: saved.approvedAt || '',
    }
  })
  const firstIncomplete = allStageProgress.findIndex((stage) => !stage.approved)
  const visibleStageCount = firstIncomplete === -1 ? allStageNames.length : firstIncomplete + 1
  const stageNames = allStageNames.slice(0, visibleStageCount)
  const stageProgress = allStageProgress.slice(0, visibleStageCount)

  // Lesson times: which session can be set or moved now ({ stage, kind: 'book' | 'reschedule' }
  // or null, see bookingRules.js), and the suggested time waiting for an answer, if any.
  // A suggestion for a session that can no longer be changed has expired.
  const schedule = role !== '' ? schedulableStage(booking, allStageProgress, now) : null
  // can the current session be cancelled (more than 2 hours away), and would it cost me a credit?
  const cancellable = role !== '' ? cancellableSession(booking, allStageProgress, now) : null
  const cancelSession = cancellable
    ? { stage: cancellable.stage, penalty: allStageProgress[cancellable.stage].myCancelUsed }
    : null
  const saved = role !== '' ? booking.proposal : null
  const proposal = saved
    ? {
        stage: saved.stage,
        startsAt: saved.startsAt,
        note: saved.note || '',
        round: saved.round || 1,
        fromMe: saved.from === role,
        expired: !schedule || schedule.stage !== saved.stage,
      }
    : null

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
    cancelBefore: cancelDeadline(startsAt).toISOString(),
    creditCost: booking.creditCost,
    status: booking.status,
    phase: phase,
    myConfirmed: myConfirmed === true,
    otherConfirmed: otherConfirmed === true,
    // "Drop course": the student can leave any time while the course is active. Before the start,
    // more than 24 hours ahead is refunded; after the start, fewer than half the stages completed
    // is refunded; otherwise the credits go to the teacher (dropRefunds in bookingRules.js).
    canCancel: learnerSide && booking.status === 'booked',
    cancelRefunds: dropRefunds(booking, allStageProgress, now),
    dropMidCourse: now >= startsAt,
    droppedMidCourse: booking.droppedMidCourse === true,
    stagesCompletedWhenDropped: booking.stagesCompletedWhenDropped || 0,
    refunded: booking.refunded !== false, // false only for a late cancellation, paid to the teacher (older ones were all refunded)
    cancelledAt: booking.cancelledAt || '',
    // the teacher has not yet seen that the student cancelled (only set by cancellations from now on)
    cancelNotice: role === 'teacher' && booking.status === 'cancelled' && booking.teacherNoticeSeen === false,
    // a student who joined since the teacher last opened the course's Students list (bookings from now on)
    newStudent: role === 'teacher' && booking.status === 'booked' && booking.teacherSeenJoin === false,
    // stages the teacher approved since the student last opened the class's Details
    newApprovals: learnerSide ? booking.learnerUnseenApprovals || 0 : 0,
    schedule: schedule,
    proposal: proposal,
    // the other person suggested a time and it is my turn to answer (a red number)
    proposalForMe: proposal !== null && !proposal.fromMe && !proposal.expired,
    // cancelling the current session: null, or { stage, penalty } (penalty: it would cost me a credit)
    cancelSession: cancelSession,
    // the other person cancelled a session, and I have not opened the class since (a red number)
    sessionCancelled:
      role !== '' && booking.sessionCancelNotice && booking.sessionCancelNotice.role === role
        ? {
            stage: booking.sessionCancelNotice.stage,
            sessionAt: booking.sessionCancelNotice.sessionAt,
            penalty: booking.sessionCancelNotice.penalty === true,
          }
        : null,
    // the other person accepted the time I suggested, and I have not opened the class since (a red number)
    timeAgreed:
      role !== '' && booking.agreedNotice && booking.agreedNotice.role === role
        ? { stage: booking.agreedNotice.stage, startsAt: booking.agreedNotice.startsAt }
        : null,
    // A course with stages finishes by itself when the last one is approved. "Mark as finished" is
    // only for an older booking that reached the end with every stage approved but not confirmed.
    canConfirm:
      booking.status === 'booked' && phase === 'readyToFinish' && myConfirmed !== true &&
      allStageProgress.every((stage) => stage.approved),
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
    chatOpen: booking.status === 'booked' || booking.status === 'disputed', // can new messages still be written?
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
