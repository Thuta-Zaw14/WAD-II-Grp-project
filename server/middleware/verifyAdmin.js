import { db } from '../config/firebaseAdmin.js'

// Used AFTER verifyToken on every admin route:  router.get('/x', verifyToken, verifyAdmin, ...)
// Someone is an admin when their profile has  isAdmin: true.  The only way to set that is by
// hand in the Firestore console: the profile form can never change it.
export async function verifyAdmin(req, res, next) {
  try {
    const profile = await db.collection('users').doc(req.user.uid).get()

    if (!profile.exists || profile.data().isAdmin !== true) {
      return res.status(403).json({ error: 'Admin access required.' })
    }

    next()
  } catch (error) {
    console.log('admin check failed:', error.message)
    res.status(500).json({ error: 'Could not check admin access.' })
  }
}
