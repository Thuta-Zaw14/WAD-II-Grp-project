import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { verifyAdmin } from '../middleware/verifyAdmin.js'
import { db } from '../config/firebaseAdmin.js'
import { FieldValue } from 'firebase-admin/firestore'

import {
    collection,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    arrayUnion
} from 'firebase/firestore'

const router = express.Router()

router.get('/check', verifyToken, verifyAdmin, (req, res) => {
    res.json({ isAdmin: true })
})

// Load all users into admin page
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('users').get()

        const users = snapshot.docs
            .map(docSnapshot => ({
                firebaseUid: docSnapshot.id,
                ...docSnapshot.data()
            }))
            .filter(user => !user.isAdmin)

        res.json(users)

    } catch (error) {
        console.log(error.message)
        res.status(500).json({
            message: error.message
        })
    }
})

// View a single user profile

router.get('/users/:uid', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const userSnap = await db
            .collection('users')
            .doc(req.params.uid)
            .get()

        if (!userSnap.exists) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        res.json({
            firebaseUid: userSnap.id,
            ...userSnap.data()
        })

    } catch (error) {
        console.error('Failed to fetch user:', error)

        res.status(500).json({
            message: error.message
        })
    }
})


// Ban user

router.put('/ban', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { firebaseUid } = req.body

        if (!firebaseUid) {
            return res.status(400).json({
                message: 'User ID is required'
            })
        }

        const userRef = db.collection('users').doc(firebaseUid)

        const userSnap = await userRef.get()

        if (!userSnap.exists) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        await userRef.update({
            isBanned: true
        })

        const updatedUser = await userRef.get()

        res.json({
            message: 'User banned successfully',
            firebaseUid,
            ...updatedUser.data()
        })

    } catch (error) {
        console.error('Failed to ban user:', error)

        res.status(500).json({
            message: error.message
        })
    }
})


// Unban user
router.put('/unban', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { firebaseUid } = req.body

        if (!firebaseUid) {
            return res.status(400).json({
                message: 'User ID is required'
            })
        }

        const userRef = db.collection('users').doc(firebaseUid)
        const userSnap = await userRef.get()

        if (!userSnap.exists) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        await userRef.update({
            isBanned: false
        })

        const updatedUser = await userRef.get()

        res.json({
            message: 'User unbanned successfully',
            firebaseUid,
            ...updatedUser.data()
        })

    } catch (error) {
        console.error('Failed to unban user:', error)

        res.status(500).json({
            message: error.message
        })
    }
})

// Issue warning

router.post('/users/warn', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { firebaseUid, warning } = req.body

        if (
            !firebaseUid ||
            typeof warning !== 'string' ||
            !warning.trim()
        ) {
            return res.status(400).json({
                message: 'User ID and warning reason are required'
            })
        }

        const userRef = db.collection('users').doc(firebaseUid)
        const userSnap = await userRef.get()

        if (!userSnap.exists) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        const newWarning = {
            reason: warning.trim(),
            createdAt: new Date().toISOString()
        }

        await userRef.update({
            warnings: FieldValue.arrayUnion(newWarning)
        })

        res.json({
            message: 'Warning issued successfully',
            warning: newWarning
        })

    } catch (error) {
        console.error('Failed to issue warning:', error)

        res.status(500).json({
            message: error.message
        })
    }
})

// Clear warning by index

router.delete(
    '/users/:uid/warnings/:index',
    verifyToken,
    verifyAdmin,
    async (req, res) => {
        try {
            const { uid, index } = req.params
            const warningIndex = Number(index)

            if (
                !Number.isInteger(warningIndex) ||
                warningIndex < 0
            ) {
                return res.status(400).json({
                    message: 'Invalid warning index'
                })
            }

            const userRef = db.collection('users').doc(uid)
            const userSnap = await userRef.get()

            if (!userSnap.exists) {
                return res.status(404).json({
                    message: 'User not found'
                })
            }

            const warnings = userSnap.data().warnings || []

            if (warningIndex >= warnings.length) {
                return res.status(400).json({
                    message: 'Invalid warning index'
                })
            }

            warnings.splice(warningIndex, 1)

            await userRef.update({
                warnings
            })

            res.json({
                message: 'Warning removed successfully'
            })

        } catch (error) {
            console.error('Failed to remove warning:', error)

            res.status(500).json({
                message: error.message
            })
        }
    }
)

export default router