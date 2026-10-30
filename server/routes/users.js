
import express from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'

const router = express.Router()

// Create a user profile if it doesn't exist
router.post('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid
    const userRef = db.collection('users').doc(uid)

    const existingUser = await userRef.get()

    if (existingUser.exists) {
      return res.json(existingUser.data())
    }
    
    const { name } = req.body
    const newUser = {
      firebaseUid: uid,
      email: req.user.email,
      name: name,
      credits: 2,
      skillsTeach: [],
      skillsLearn: [],
      isAdmin: false,
      isBanned: false,
      reports: [],
      numberOfReports: 0,
      warningReasons: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }

    await userRef.create(newUser)

    return res.status(201).json({
      ...newUser,
      createdAt: null,
      updatedAt: null
    })
  } catch (error) {
    console.error('Create user error:', error)
    return res.status(500).json({ error: 'Failed to create profile' })
  }
})

// Get the current user's profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user.uid)
    const snapshot = await userRef.get()

    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    return res.json(snapshot.data())
  } catch (error) {
    console.error('Get user error:', error)
    return res.status(500).json({ error: 'Failed to get profile' })
  }
})

export default router