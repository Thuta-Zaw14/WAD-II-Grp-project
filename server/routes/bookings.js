import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { findDocsWhereEquals } from '../models/dbQuery.js'
import { cancelBooking, confirmBooking, reportBooking } from '../models/bookings.js'
import { publicBooking, publicOffer } from '../models/publicView.js'

// Making a booking is POST /api/offers/:id/slots/:slotId/book (in routes/offers.js).
// Everything after that is here. The rules are in models/bookings.js.
const router = express.Router()

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

export default router
