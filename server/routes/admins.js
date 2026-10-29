import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { verifyAdmin } from '../middleware/verifyAdmin.js'
import { db } from '../config/firebase.js'

import {
    collection,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    arrayUnion
} from 'firebase/firestore'

const router = express.Router()

// Load all users into admin page
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const snapshot = await getDocs(collection(db, 'users'))

        const users = snapshot.docs
            .map(docSnapshot => ({
                firebaseUid: docSnapshot.id,
                ...docSnapshot.data()
            }))
            .filter(user => !user.isAdmin)

        res.json(users)

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// View a single user profile
router.get('/users/:uid', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const userRef = doc(db, 'users', req.params.uid)
        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        res.json({
            firebaseUid: userSnap.id,
            ...userSnap.data()
        })

    } catch (error) {
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

        const userRef = doc(db, 'users', firebaseUid)

        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        await updateDoc(userRef, {
            isBanned: true
        })

        const updatedUser = await getDoc(userRef)

        res.json({
            message: 'User banned successfully',
            firebaseUid,
            ...updatedUser.data()
        })

    } catch (error) {
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

        const userRef = doc(db, 'users', firebaseUid)

        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        await updateDoc(userRef, {
            isBanned: false
        })

        const updatedUser = await getDoc(userRef)

        res.json({
            message: 'User unbanned successfully',
            firebaseUid,
            ...updatedUser.data()
        })

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// Issue warning
router.post('/users/warn', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { firebaseUid, warning } = req.body

        if (!firebaseUid || !warning?.trim()) {
            return res.status(400).json({
                message: 'User ID and warning reason are required'
            })
        }

        const userRef = doc(db, 'users', firebaseUid)

        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        const newWarning = {
            reason: warning.trim(),
            createdAt: new Date().toISOString()
        }

        await updateDoc(userRef, {
            warnings: arrayUnion(newWarning)
        })

        res.json({
            message: 'Warning issued successfully',
            warning: newWarning
        })

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

// Clear warning by index
router.delete('/users/:uid/warnings/:index', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { uid, index } = req.params

        const userRef = doc(db, 'users', uid)

        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        const warnings = userSnap.data().warnings || []

        if (index < 0 || index >= warnings.length) {
            return res.status(400).json({
                message: 'Invalid warning index'
            })
        }

        warnings.splice(index, 1)

        await updateDoc(userRef, {
            warnings
        })

        res.json({
            message: 'Warning removed successfully'
        })

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
})

export default router