import express from 'express'
import User from '../models/User.js'
import { verifyToken } from '../middleware/verifyToken.js'

const router = express.Router()

// Create the profile if it doesn't exist yet (safe to call twice)
router.post('/', verifyToken, async (req, res) => {
  const user = await User.findOneAndUpdate(
    { firebaseUid: req.user.uid },
    { $setOnInsert: { email: req.user.email, credits: 2 } },
    { upsert: true, new: true }
  )
  res.status(201).json(user)
})

// Get the logged-in user's profile
router.get('/me', verifyToken, async (req, res) => {
  const user = await User.findOne({ firebaseUid: req.user.uid })
  if (!user) return res.status(404).json({ error: 'Profile not found' })
  res.json(user)
})

export default router