// What a booking is waiting on me for: the red numbers on My Classes and on "My Classes" in the
// nav bar. Kept in one place so the page and the nav bar always count the same things.

// unread messages from the other person in the booking's chat
export function unreadOf(b) {
  if (typeof b.unreadCount === 'number') return b.unreadCount
  return b.unreadChat ? 1 : 0 // a server from before unreadCount
}

// reflections the student sent that the teacher has not approved yet
export function reflectionsWaiting(b) {
  if (b.status !== 'booked') return 0
  return (b.stageProgress || []).filter((stage) => stage.reflection && !stage.approved).length
}

// 1 if the other person suggested a lesson time and it is my turn to answer,
// and 1 more if they accepted a time I suggested (until I open the class)
// and 1 more if they cancelled a session (until I open the class)
export function scheduleNews(b) {
  return (b.proposalForMe ? 1 : 0) + (b.timeAgreed ? 1 : 0) + (b.sessionCancelled ? 1 : 0)
}

// A class I attend, as the student: unread messages from the teacher, the stages the teacher
// approved since I last opened the class's Details, and news about its lesson times
export function learnerActionCount(b) {
  return unreadOf(b) + (b.newApprovals || 0) + scheduleNews(b)
}

// What the Details button of a class I attend shows: everything except the chat messages,
// which have their own number on the Chat button
export function detailsCount(b) {
  return (b.newApprovals || 0) + scheduleNews(b)
}

// One of my students, as their teacher: reflections to approve, messages to read, 1 more if
// they joined since I last opened the course's Students list, and news about lesson times
export function studentActionCount(b) {
  return reflectionsWaiting(b) + unreadOf(b) + (b.newStudent ? 1 : 0) + scheduleNews(b)
}
