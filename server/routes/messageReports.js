import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { isValidId } from '../models/discussions.js'
import { createMessageReport, MAX_REASON_LENGTH } from '../models/messageReports.js'

// Report one message: a post in a course discussion, or a message in a private chat.
// The admins read the reports in the "Message reports" tab (routes/admins.js).
const router = express.Router()

// body: { kind: 'public' or 'private', containerId, n, reason }
//   public:  containerId is the id of the course, n is the number of the post
//   private: containerId is the id of the booking, n is the number of the message
router.post('/', verifyToken, async (req, res) => {
  const { kind, containerId, n } = req.body
  if (kind !== 'public' && kind !== 'private') {
    return res.status(400).json({ error: 'Choose public or private.' })
  }
  if (!isValidId(containerId)) {
    return res.status(404).json({ error: 'Message not found.' })
  }
  if (!Number.isInteger(n) || n < 1) {
    return res.status(404).json({ error: 'Message not found.' })
  }
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (reason === '') {
    return res.status(400).json({ error: 'Please say what is wrong with this message.' })
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return res.status(400).json({ error: 'The description must be ' + MAX_REASON_LENGTH + ' characters or fewer.' })
  }

  try {
    const result = await createMessageReport(req.user.uid, kind, containerId, n, reason)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.status(201).json({ ok: true })
  } catch (err) {
    console.log('createMessageReport failed:', err.message)
    res.status(500).json({ error: 'Could not send your report. Please try again.' })
  }
})

export default router
