import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { findDocsWhereEquals } from '../models/dbQuery.js'
import {
  cancelBooking, confirmBooking, reportBooking, removeStudent, markSeenByTeacher, markSeenByLearner,
  proposeSessionTime, answerSessionTime, cancelSession,
  submitStageReflection, approveBookingStage,
} from '../models/bookings.js'
import { publicBooking, publicOffer, publicMessage, publicChatInfo } from '../models/publicView.js'
import { sendMessage, readMessages, chatIsOpen, MAX_MESSAGE_LENGTH } from '../models/chat.js'
import { isValidId } from '../models/discussions.js'

// Making a booking is POST /api/offers/:id/slots/:slotId/book (in routes/offers.js).
// Everything after that is here. The rules are in models/bookings.js.
const router = express.Router()

// A made-up id such as "a/b" would make Firestore throw (it reads it as a path), so ids like
// that get a plain 404 here, before any route runs (the same check as routes/admins.js).
router.param('id', (req, res, next, value) => {
  if (!isValidId(value)) return res.status(404).json({ error: 'Not found.' })
  next()
})

const maxReasonLength = 300

// All the bookings I am part of: as the student AND as the teacher (the "role" says which).
router.get('/mine', verifyToken, async (req, res) => {
  const uid = req.user.uid
  const asLearner = await findDocsWhereEquals('bookings', 'learnerUid', uid)
  const asTeacher = await findDocsWhereEquals('bookings', 'teacherUid', uid)
  if (!asLearner.status || !asTeacher.status) {
    return res.status(500).json({ error: 'Could not load your sessions.' })
  }

  // Bookings that still need attention come first, soonest first. Finished and
  // cancelled ones go below, most recent first.
  const all = [...asLearner.docs, ...asTeacher.docs]
  all.sort((a, b) => {
    const aOpen = a.status === 'booked' || a.status === 'disputed'
    const bOpen = b.status === 'booked' || b.status === 'disputed'
    if (aOpen !== bOpen) return aOpen ? -1 : 1
    if (aOpen) return a.startsAt < b.startsAt ? -1 : 1
    return a.startsAt < b.startsAt ? 1 : -1
  })

  const now = new Date()
  const list = []
  for (const booking of all) {
    list.push(publicBooking(booking, uid, now))
  }
  res.json(list)
})

router.post('/:id/progress/stages/:stageIndex/reflection', verifyToken, async (req, res) => {
  try {
    const result = await submitStageReflection(
      req.user.uid,
      req.params.id,
      Number(req.params.stageIndex),
      req.body.reflection
    )
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('submitStageReflection failed:', err.message)
    res.status(500).json({ error: 'Could not submit the stage reflection.' })
  }
})

router.post('/:id/progress/stages/:stageIndex/approve', verifyToken, async (req, res) => {
  try {
    const result = await approveBookingStage(
      req.user.uid,
      req.params.id,
      Number(req.params.stageIndex)
    )
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('approveBookingStage failed:', err.message)
    res.status(500).json({ error: 'Could not approve the course stage.' })
  }
})

// The student cancels (refunded if it is more than 24 hours before the start)
router.post('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const result = await cancelBooking(req.user.uid, req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({
      booking: publicBooking(result.booking, req.user.uid),
      offer: result.offer ? publicOffer(result.offer, req.user.uid) : null,
    })
  } catch (err) {
    console.log('cancelBooking failed:', err.message)
    res.status(500).json({ error: 'Could not cancel the booking. Please try again.' })
  }
})

// The teacher has seen this booking: a new student, or the notice that a student cancelled
router.post('/:id/teacher-seen', verifyToken, async (req, res) => {
  try {
    const result = await markSeenByTeacher(req.user.uid, req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('markSeenByTeacher failed:', err.message)
    res.status(500).json({ error: 'Could not update the booking. Please try again.' })
  }
})

// The student has seen this booking: the stages approved since they last opened its Details
router.post('/:id/learner-seen', verifyToken, async (req, res) => {
  try {
    const result = await markSeenByLearner(req.user.uid, req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('markSeenByLearner failed:', err.message)
    res.status(500).json({ error: 'Could not update the booking. Please try again.' })
  }
})

// Suggest a lesson time for the current stage (book it, move it, or counter the other person's
// suggestion). body: { startsAt, note }. The rules are in models/bookings.js.
router.post('/:id/schedule/propose', verifyToken, async (req, res) => {
  try {
    const result = await proposeSessionTime(req.user.uid, req.params.id, req.body.startsAt, req.body.note)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('proposeSessionTime failed:', err.message)
    res.status(500).json({ error: 'Could not send your suggestion. Please try again.' })
  }
})

// Accept or decline the other person's suggested time. body: { accept: true | false }
router.post('/:id/schedule/answer', verifyToken, async (req, res) => {
  try {
    const result = await answerSessionTime(req.user.uid, req.params.id, req.body.accept === true)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('answerSessionTime failed:', err.message)
    res.status(500).json({ error: 'Could not answer the suggestion. Please try again.' })
  }
})

// Cancel the current stage's session (not the course): free the first time per person per stage,
// 1 credit to the other person after that. -> { booking, penalty }
router.post('/:id/schedule/cancel', verifyToken, async (req, res) => {
  try {
    const result = await cancelSession(req.user.uid, req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid), penalty: result.penalty })
  } catch (err) {
    console.log('cancelSession failed:', err.message)
    res.status(500).json({ error: 'Could not cancel the session. Please try again.' })
  }
})

// The teacher removes a student from the class, with a reason the student will see.
router.post('/:id/remove', verifyToken, async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    return res.status(400).json({ error: 'Please give a reason for removing this student.' })
  }
  if (reason.length > maxReasonLength) {
    return res.status(400).json({ error: 'The reason must be ' + maxReasonLength + ' characters or fewer.' })
  }

  try {
    const result = await removeStudent(req.user.uid, req.params.id, reason)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('removeStudent failed:', err.message)
    res.status(500).json({ error: 'Could not remove the student. Please try again.' })
  }
})

// The student or the teacher says the course is finished. When both have said so, the
// teacher is paid and the student gets a skill card.
router.post('/:id/confirm', verifyToken, async (req, res) => {
  try {
    const result = await confirmBooking(req.user.uid, req.params.id)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('confirmBooking failed:', err.message)
    res.status(500).json({ error: 'Could not confirm the session. Please try again.' })
  }
})

// Either person reports a problem. The booking is frozen until it is sorted out.
router.post('/:id/report', verifyToken, async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    return res.status(400).json({ error: 'Please describe the problem.' })
  }
  if (reason.length > maxReasonLength) {
    return res.status(400).json({ error: 'The description must be ' + maxReasonLength + ' characters or fewer.' })
  }

  try {
    const result = await reportBooking(req.user.uid, req.params.id, reason)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.json({ booking: publicBooking(result.booking, req.user.uid) })
  } catch (err) {
    console.log('reportBooking failed:', err.message)
    res.status(500).json({ error: 'Could not send your report. Please try again.' })
  }
})

// ---------- The private chat of a booking (student and teacher only) ----------

// The messages after number "after" (leave it out to get the whole chat). The page asks again
// every few seconds, each time with the number of the last message it already has.
router.get('/:id/messages', verifyToken, async (req, res) => {
  const after = Number(req.query.after)
  const afterN = Number.isInteger(after) && after > 0 ? after : 0

  try {
    const result = await readMessages(req.user.uid, req.params.id, afterN)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    const messages = []
    for (const message of result.messages) {
      messages.push(publicMessage(message, req.user.uid))
    }
    // booking = the header of the chat page; open = can new messages still be written?
    res.json({
      messages: messages,
      open: chatIsOpen(result.booking),
      booking: publicChatInfo({ id: req.params.id, ...result.booking }, req.user.uid),
    })
  } catch (err) {
    console.log('readMessages failed:', err.message)
    res.status(500).json({ error: 'Could not load the chat.' })
  }
})

router.post('/:id/messages', verifyToken, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
  if (text === '') {
    return res.status(400).json({ error: 'Write a message first.' })
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'A message must be ' + MAX_MESSAGE_LENGTH + ' characters or fewer.' })
  }

  try {
    const result = await sendMessage(req.user.uid, req.params.id, text)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.status(201).json({ message: publicMessage(result.message, req.user.uid) })
  } catch (err) {
    console.log('sendMessage failed:', err.message)
    res.status(500).json({ error: 'Could not send your message. Please try again.' })
  }
})

export default router
