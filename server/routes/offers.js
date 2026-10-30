import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { getAllDocs } from '../models/dbQuery.js'

const router = express.Router()

// Get every offer. The frontend already does the searching and filtering
// (searchUtils.js), so the server just hands over the list.
router.get('/', verifyToken, async (req, res) => {
  const offers = await getAllDocs('offers')
  res.json(offers)
})

export default router