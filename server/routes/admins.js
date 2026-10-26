import express from 'express'
import User from '../models/User.js'
import { verifyToken } from '../middleware/verifyToken.js'

const router = express.Router()

// Load data into admin page
router.get('/users', verifyToken, async (req, res) => {
    try {
        const users = await User.find({ isAdmin : false })
        res.json(users)
    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// Ban users
router.put('/ban', verifyToken, async (req, res) => { 
    try {
        const { firebaseUid, isBanned } = req.body
        const user = await User.findOneAndUpdate(
            { firebaseUid }, 
            { isBanned },
            { new: true }
        )

        if (!user) {
            return res.status(404).json({ 
                message: 'User not found'
            })
        }

        res.json(user)
    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// Unban users
router.put('/unban', verifyToken, async (req, res) => { 
    try {
        const { firebaseUid, isBanned } = req.body
        const user = await User.findOneAndUpdate(
            { firebaseUid }, 
            { isBanned },
            { new: true }
        )

        if (!user) {
            return res.status(404).json({ 
                message: 'User not found'
            })
        }

        res.json(user)
    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// View a single user profile
router.get('/users/:uid', verifyToken, async (req, res) => {
    try {

        const user = await User.findOne({
            firebaseUid: req.params.uid
        })

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        res.json(user)

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// Issue a warning
router.post('/users/warn', verifyToken, async (req, res) => {
    try {
        const { firebaseUid, warning } = req.body

        if (!firebaseUid || !warning?.trim()) {
            return res.status(400).json({
                message: 'User ID and warning reason are required'
            })
        }

        const user = await User.findOneAndUpdate(
            { firebaseUid },
            {
                $push: {
                    warnings: {
                        reason: warning.trim(),
                        createdAt: new Date()
                    }
                }
            },
            { new: true, runValidators: true }
        )

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        res.json({
            message: 'Warning issued successfully',
            warning: user.warnings[user.warnings.length - 1]
        })
    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

export default router