// The public discussion of a course ("Questions & discussion"). Anyone who is signed in can read
// it and write in it; the teacher of the course gets a "Teacher" badge on their posts.
// It lives in two collections:
//
//   discussions/{offerId}            { count, removedNs, updatedAt }
//       count       how many posts there are (also used to number the next one)
//       removedNs   the numbers of the posts that were taken down, so a page that already shows
//                   them can grey them out
//   discussionPosts/{offerId}_{n}    { offerId, n, authorUid, authorName, isTeacher, text, createdAt,
//                                      removed, removedBy, removedAt }
//
// The id of a post is the course id plus the post's number (n = 1, 2, 3 ...). So "post 7 of this
// course" can be fetched directly, and the browser can ask for "everything after post 40" without
// the server reading the whole discussion every few seconds.
//
// A post is never really deleted: "removed" hides its text from everybody (removedBy says who
// took it down: 'author', 'teacher' or 'admin'). The text stays in the database so an admin can
// still judge a report about it.
//
// OUTSIDE THE SLIDES: writing and removing use db.runTransaction() (like models/bookings.js), so
// two people posting at the same moment get two different numbers. Reading several posts at once
// uses Promise.all, which waits for a whole list of requests.
import { db } from '../config/firebaseAdmin.js'

export const MAX_POST_LENGTH = 500
export const MAX_POSTS = 1000 // per course, so a discussion can never grow without limit
export const SHOWN_AT_FIRST = 50 // when the page opens it gets the newest 50 posts
const MIN_SECONDS_BETWEEN = 10 // one person can post once every 10 seconds (in any course)

function fail(status, message) {
  return { status: status, error: message }
}

// ids that are safe to put in a Firestore path
export function isValidId(id) {
  return typeof id === 'string' && id !== '' && id.length <= 128 && !id.includes('/') && id !== '.' && id !== '..'
}

export function postRef(offerId, n) {
  return db.collection('discussionPosts').doc(offerId + '_' + n)
}

export function discussionRef(offerId) {
  return db.collection('discussions').doc(offerId)
}

function removedNsOf(discussion) {
  return Array.isArray(discussion.removedNs) ? discussion.removedNs : []
}

// Takes a post down. Only the writes: the caller has already read the post and the discussion
// inside its own transaction (all reads first, then all writes).
// removedBy is 'author', 'teacher' or 'admin'.
export function markPostRemoved(t, offerId, n, discussion, removedBy) {
  const now = new Date().toISOString()
  t.update(postRef(offerId, n), { removed: true, removedBy: removedBy, removedAt: now })
  t.set(discussionRef(offerId), {
    count: discussion.count || 0,
    removedNs: [...removedNsOf(discussion), n],
    updatedAt: now,
  })
}

// ---------- Read ----------
// The posts with a number bigger than "after" (0 = the page was just opened), oldest first.
// A page that is just opened, or that has been away for a long time, only gets the newest
// SHOWN_AT_FIRST posts; "replace" then tells it to throw its old list away and use this one.
export async function readDiscussion(offerId, after) {
  const offerSnap = await db.collection('offers').doc(offerId).get()
  if (!offerSnap.exists) return fail(404, 'Course not found.')

  const discussionSnap = await discussionRef(offerId).get()
  const discussion = discussionSnap.exists ? discussionSnap.data() : {}
  const count = discussion.count || 0

  const first = Math.max(after + 1, count - SHOWN_AT_FIRST + 1, 1) // the number of the first post to send
  const reads = []
  for (let n = first; n <= count; n++) {
    reads.push(postRef(offerId, n).get())
  }
  const snaps = await Promise.all(reads)

  const posts = []
  for (const snap of snaps) {
    if (snap.exists) posts.push(snap.data())
  }

  return {
    offer: offerSnap.data(),
    count: count,
    posts: posts,
    removedNs: removedNsOf(discussion),
    replace: first > after + 1,
    earlier: first - 1, // how many older posts are not in this answer
  }
}

// A few posts around number n, removed ones included (an admin reads these next to a report)
export async function readPostsAround(offerId, n, spread) {
  const reads = []
  for (let i = Math.max(1, n - spread); i <= n + spread; i++) {
    reads.push(postRef(offerId, i).get())
  }
  const snaps = await Promise.all(reads)

  const posts = []
  for (const snap of snaps) {
    if (snap.exists) posts.push(snap.data())
  }
  return posts
}

// ---------- Write ----------
export async function addPost(uid, offerId, text) {
  const offerRef = db.collection('offers').doc(offerId)
  const dRef = discussionRef(offerId)
  const userRef = db.collection('users').doc(uid)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const offer = offerSnap.data()

    const userSnap = await t.get(userRef)
    if (!userSnap.exists || typeof userSnap.data().name !== 'string' || userSnap.data().name.trim() === '') {
      return fail(400, 'Add your name on your profile first.')
    }
    const user = userSnap.data()

    const discussionSnap = await t.get(dRef)
    const discussion = discussionSnap.exists ? discussionSnap.data() : {}
    const count = discussion.count || 0
    if (count >= MAX_POSTS) return fail(409, 'This discussion is full.')

    const now = new Date()
    if (user.lastPostAt) {
      const secondsAgo = (now.getTime() - new Date(user.lastPostAt).getTime()) / 1000
      if (secondsAgo < MIN_SECONDS_BETWEEN) return fail(429, 'Please wait a few seconds before posting again.')
    }

    // --- writes ---
    const post = {
      offerId: offerId,
      n: count + 1,
      authorUid: uid,
      authorName: user.name.trim(),
      isTeacher: offer.teacherUid === uid,
      text: text,
      createdAt: now.toISOString(),
      removed: false,
    }
    t.set(postRef(offerId, post.n), post)
    t.set(dRef, { count: post.n, removedNs: removedNsOf(discussion), updatedAt: post.createdAt })
    t.update(userRef, { lastPostAt: post.createdAt })

    return { post: post, offer: offer }
  })
}

// The author can take down their own post; the teacher of the course can take down any post.
export async function deletePost(uid, offerId, n) {
  const offerRef = db.collection('offers').doc(offerId)
  const pRef = postRef(offerId, n)
  const dRef = discussionRef(offerId)

  return db.runTransaction(async (t) => {
    // --- reads ---
    const offerSnap = await t.get(offerRef)
    if (!offerSnap.exists) return fail(404, 'Course not found.')
    const postSnap = await t.get(pRef)
    if (!postSnap.exists) return fail(404, 'Message not found.')
    const discussionSnap = await t.get(dRef)

    const post = postSnap.data()
    if (post.removed === true) return fail(409, 'This message was already removed.')

    const isAuthor = post.authorUid === uid
    const isTeacher = offerSnap.data().teacherUid === uid
    if (!isAuthor && !isTeacher) return fail(403, 'You can only remove your own messages.')

    // --- writes ---
    markPostRemoved(t, offerId, n, discussionSnap.exists ? discussionSnap.data() : {}, isAuthor ? 'author' : 'teacher')
    return { n: n }
  })
}

// When a teacher deletes their course, its discussion goes with it
export async function deleteDiscussion(offerId) {
  const discussionSnap = await discussionRef(offerId).get()
  if (!discussionSnap.exists) return

  const deletes = []
  for (let n = 1; n <= (discussionSnap.data().count || 0); n++) {
    deletes.push(postRef(offerId, n).delete())
  }
  await Promise.all(deletes)
  await discussionRef(offerId).delete()
}
