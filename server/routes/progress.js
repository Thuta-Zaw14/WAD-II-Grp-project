import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { isValidId } from '../models/discussions.js'
import {
  progressOverview, getAssignment, createAssignment, updateAssignment, deleteAssignment, submitWork,
  addComment, reviewSubmission, markSubmissionSeen, getMedia, setMastery,
} from '../models/progress.js'

// The Progress page: homework, feedback and mastery. The rules are in models/progress.js and
// models/progressRules.js. Everything needs a login (verifyToken).
const router = express.Router()

// a made-up id such as "a/b" would make Firestore throw, so it gets a plain 404 first
for (const name of ['id', 'subId', 'mediaId']) {
  router.param(name, (req, res, next, value) => {
    if (!isValidId(value)) return res.status(404).json({ error: 'Not found.' })
    next()
  })
}

// Runs one model function and sends its answer: { status, error } becomes that HTTP error,
// anything else is sent as it is. An unexpected error is logged and becomes a plain 500.
function handle(work, failText) {
  return async (req, res) => {
    try {
      const result = await work(req)
      if (result && result.error) return res.status(result.status).json({ error: result.error })
      res.json(result)
    } catch (err) {
      console.log(failText + ':', err.message)
      res.status(500).json({ error: failText + '. Please try again.' })
    }
  }
}

// everything on the page: my homework as a student, my courses as an instructor
router.get('/', verifyToken, handle((req) => progressOverview(req.user.uid, new Date()), 'Could not load your progress'))

router.get('/assignments/:id', verifyToken, handle(
  (req) => getAssignment(req.user.uid, req.params.id, new Date()), 'Could not load the assignment'))

// the instructor: body = { offerId, title, instructions, dueAt, learnerUids }
router.post('/assignments', verifyToken, handle(
  (req) => createAssignment(req.user.uid, req.body || {}, new Date()), 'Could not save the assignment'))

// the instructor: body = { title, instructions, dueAt, addLearnerUids }
router.put('/assignments/:id', verifyToken, handle(
  (req) => updateAssignment(req.user.uid, req.params.id, req.body || {}, new Date()), 'Could not save the assignment'))

router.delete('/assignments/:id', verifyToken, handle(
  (req) => deleteAssignment(req.user.uid, req.params.id), 'Could not remove the assignment'))

// the student: body = { note, links, keepMediaIds, images }
router.post('/assignments/:id/submission', verifyToken, handle(
  (req) => submitWork(req.user.uid, req.params.id, req.body || {}, new Date()), 'Could not send your work'))

// either side: body = { text }
router.post('/submissions/:subId/comments', verifyToken, handle(
  (req) => addComment(req.user.uid, req.params.subId, (req.body || {}).text, new Date()), 'Could not send the comment'))

// the instructor: body = { action: 'grade', stars, feedback } or { action: 'redo', note }
router.post('/submissions/:subId/review', verifyToken, handle(
  (req) => reviewSubmission(req.user.uid, req.params.subId, req.body || {}, new Date()), 'Could not save the grade'))

router.post('/submissions/:subId/seen', verifyToken, handle(
  (req) => markSubmissionSeen(req.user.uid, req.params.subId), 'Could not update the submission'))

// one photo of a submission -> { id, dataUrl }
router.get('/media/:mediaId', verifyToken, handle(
  (req) => getMedia(req.user.uid, req.params.mediaId), 'Could not load the photo'))

// the instructor's final grade: body = { offerId, learnerUid, level, summary }
router.post('/mastery', verifyToken, handle(
  (req) => setMastery(req.user.uid, req.body || {}, new Date()), 'Could not save the mastery grade'))

export default router
