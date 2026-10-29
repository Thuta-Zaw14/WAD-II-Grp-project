import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase.js'

export const verifyAdmin = async (req, res, next) => {
    try {
        const userRef = doc(db, 'users', req.user.uid)

        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
            return res.status(404).json({
                message: 'User not found'
            })
        }

        const user = userSnap.data()

        if (!user.isAdmin) {
            return res.status(403).json({
                message: 'Admin access required'
            })
        }

        next()

    } catch (error) {
        res.status(500).json({
            message: error.message
        })
    }
}
