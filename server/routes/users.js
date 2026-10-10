import express from 'express'
import User from '../models/User.js'
import { verifyToken } from '../middleware/verifyToken.js'

const router = express.Router()

router.post('/', verifyToken, async (req, res) => {
  const existingUser = await User.findOne({ firebaseUid: req.user.uid })

  if (existingUser) {
    return res.json(existingUser)
  }

  const newUser = await User.create({
    firebaseUid: req.user.uid,
    email: req.user.email,
    credits: 2
  })

  res.status(201).json(newUser)
})

router.get('/me', verifyToken, async (req, res) => {
  const user = await User.findOne({ firebaseUid: req.user.uid })

  if (!user) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  res.json(user)
})

export default router