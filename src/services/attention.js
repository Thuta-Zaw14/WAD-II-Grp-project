// What a booking is waiting on me for: the red numbers on My Classes and on "My Classes" in the
// nav bar. Kept in one place so the page and the nav bar always count the same things.

// unread messages from the other person in the booking's chat
export function unreadOf(b) {
  if (typeof b.unreadCount === 'number') return b.unreadCount
  return b.unreadChat ? 1 : 0 // a server from before unreadCount
}

// reflections the student sent (or rewrote) that the teacher has not accepted or sent back yet
export function reflectionsWaiting(b) {
  if (b.status !== 'booked') return 0
  return (b.stageProgress || []).filter((stage) => stage.reflection && !stage.approved && !stage.rejected).length
}

// reflections the teacher sent back, that the student still has to rewrite
export function reflectionsRejected(b) {
  if (b.status !== 'booked') return 0
  return (b.stageProgress || []).filter((stage) => stage.rejected).length
}

// A class I attend, as the student: unread messages from the teacher, the stages the teacher
// accepted since I last opened the class's Details, and the reflections I must rewrite
export function learnerActionCount(b) {
  return unreadOf(b) + (b.newApprovals || 0) + reflectionsRejected(b)
}

// One of my students, as their teacher: reflections to approve, messages to read, and 1 more if
// they joined since I last opened the course's Students list
export function studentActionCount(b) {
  return reflectionsWaiting(b) + unreadOf(b) + (b.newStudent ? 1 : 0)
}
