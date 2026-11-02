import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { verifyAdmin } from '../middleware/verifyAdmin.js'
import { isValidId } from '../models/discussions.js'
import { publicReport, adminReport } from '../models/publicView.js'
import {
  createReport, findMyReports, markReportSeen, findAllReports, updateReport,
  REPORT_TYPES, REPORT_STATUSES, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_NOTE_LENGTH,
} from '../models/reports.js'

// The Reports page: file a report about a user, a course, the website or anything else,
// and follow what happens to it. The rules are in models/reports.js.
const router = express.Router()

// Returns an error message, or '' if the form is fine
function findProblem(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title === '') return 'Please enter a title.'
  if (title.length > MAX_TITLE_LENGTH) return 'The title must be ' + MAX_TITLE_LENGTH + ' characters or fewer.'

  if (!REPORT_TYPES.includes(body.type)) return 'Please pick a type from the list.'

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description === '') return 'Please describe the problem.'
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return 'The description must be ' + MAX_DESCRIPTION_LENGTH + ' characters or fewer.'
  }
  return ''
}

// My reports, the one with the newest news first
router.get('/mine', verifyToken, async (req, res) => {
  const result = await findMyReports(req.user.uid)
  if (result.error) {
    return res.status(result.status).json({ error: result.error })
  }
  res.json(result.reports.map(publicReport))
})

// body: { title, type, description }
router.post('/', verifyToken, async (req, res) => {
  const problem = findProblem(req.body)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }

  try {
    const result = await createReport(req.user.uid, req.body.title.trim(), req.body.type, req.body.description.trim())
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.status(201).json(publicReport(result.report))
  } catch (err) {
    console.log('createReport failed:', err.message)
    res.status(500).json({ error: 'Could not send your report. Please try again.' })
  }
})

// I opened my report, so its "!" can go
router.post('/:id/seen', verifyToken, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'Report not found.' })
  }
  const result = await markReportSeen(req.user.uid, req.params.id)
  if (result.error) {
    return res.status(result.status).json({ error: result.error })
  }
  res.json(publicReport(result.report))
})

// ---------- Admins ----------

router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  const result = await findAllReports()
  res.json(result.reports.map(adminReport))
})

// body: { status, adminNote }
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'Report not found.' })
  }
  if (!REPORT_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: 'Please pick a status from the list.' })
  }
  const note = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : ''
  if (note.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ error: 'The note must be ' + MAX_NOTE_LENGTH + ' characters or fewer.' })
  }

  const result = await updateReport(req.params.id, req.body.status, note)
  if (result.error) {
    return res.status(result.status).json({ error: result.error })
  }
  res.json(adminReport(result.report))
})

export default router
