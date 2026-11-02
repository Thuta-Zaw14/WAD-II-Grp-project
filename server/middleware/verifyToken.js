import { adminAuth, db } from '../config/firebaseAdmin.js'

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: 'No token' })
  }

  const parts = authHeader.split(' ')

  if (parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'No token' })
  }

  const token = parts[1]

  // On admin routes also ask Firebase whether the token was revoked or the account disabled
  // (one extra call, so only where it matters most)
  const checkRevoked = req.baseUrl.startsWith('/api/admins')

  let decodedUser
  try {
    decodedUser = await adminAuth.verifyIdToken(token, checkRevoked)
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // A banned person (see routes/admins.js) is stopped here, so every route is closed to them.
  // A brand-new account has no profile yet, so there is nothing to check for them.
  try {
    const profile = await db.collection('users').doc(decodedUser.uid).get()
    if (profile.exists && profile.data().isBanned === true) {
      // code lets the browser tell a ban apart from an ordinary "no" (see services/api.js)
      return res.status(403).json({ error: 'Your account has been suspended.', code: 'banned' })
    }
  } catch (error) {
    console.log('ban check failed:', error.message)
    return res.status(500).json({ error: 'Could not check your account. Please try again.' })
  }

  req.user = decodedUser
  next()
}
