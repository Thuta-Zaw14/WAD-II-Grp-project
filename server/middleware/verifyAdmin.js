
import { db } from '../config/firebaseAdmin.js'

export const verifyAdmin = async (req, res, next) => {
    try {
        const userRef = db.collection('users').doc(req.user.uid)
        const userSnap = await userRef.get()

        if (!userSnap.exists) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        if (userSnap.data().isAdmin !== true) {
            return res.status(403).json({
                message: 'Admin access required'
            })
        }

        return next()
    } catch (error) {
        console.error('Admin verification error:', error)

        return res.status(500).json({
            message: 'Failed to verify admin permissions'
        })
    }
}
