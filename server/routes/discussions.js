import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { publicPost, publicCourseInfo } from '../models/publicView.js'
import { readDiscussion, addPost, deletePost, isValidId, MAX_POST_LENGTH, MAX_POSTS } from '../models/discussions.js'

// The public discussion of a course. Anyone signed in may read and write; the rules are in
// models/discussions.js.
const router = express.Router()

// The posts after number "after" (leave it out when the page is just opened). The page asks again
// every few seconds with the number of the last post it already has.
router.get('/:offerId', verifyToken, async (req, res) => {
  if (!isValidId(req.params.offerId)) {
    return res.status(404).json({ error: 'Course not found.' })
  }
  const after = Number(req.query.after)
  const afterN = Number.isInteger(after) && after > 0 ? after : 0

  try {
    const result = await readDiscussion(req.params.offerId, afterN)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    const posts = []
    for (const post of result.posts) {
      posts.push(publicPost(post, req.user.uid, result.offer.teacherUid))
    }
    res.json({
      course: publicCourseInfo({ id: req.params.offerId, ...result.offer }, req.user.uid),
      posts: posts,
      removed: result.removedNs, // the numbers of posts taken down (the page greys out the ones it has)
      count: result.count,
      replace: result.replace, // true = use this list instead of the old one
      earlier: result.earlier, // older posts that are not in this answer
      open: result.count < MAX_POSTS,
    })
  } catch (err) {
    console.log('readDiscussion failed:', err.message)
    res.status(500).json({ error: 'Could not load the discussion.' })
  }
})

router.post('/:offerId', verifyToken, async (req, res) => {
  if (!isValidId(req.params.offerId)) {
    return res.status(404).json({ error: 'Course not found.' })
  }
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
  if (text === '') {
    return res.status(400).json({ error: 'Write a message first.' })
  }
  if (text.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: 'A message must be ' + MAX_POST_LENGTH + ' characters or fewer.' })
  }

  try {
    const result = await addPost(req.user.uid, req.params.offerId, text)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.status(201).json({ post: publicPost(result.post, req.user.uid, result.offer.teacherUid) })
  } catch (err) {
    console.log('addPost failed:', err.message)
    res.status(500).json({ error: 'Could not post your message. Please try again.' })
  }
})

// Take a post down (its author, or the teacher of the course)
router.delete('/:offerId/posts/:n', verifyToken, async (req, res) => {
  const n = Number(req.params.n)
  if (!isValidId(req.params.offerId) || !Number.isInteger(n) || n < 1) {
    return res.status(404).json({ error: 'Message not found.' })
  }

  try {
    const result = await deletePost(req.user.uid, req.params.offerId, n)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ ok: true, n: n })
  } catch (err) {
    console.log('deletePost failed:', err.message)
    res.status(500).json({ error: 'Could not remove the message. Please try again.' })
  }
})

export default router
