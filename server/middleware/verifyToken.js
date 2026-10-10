import { adminAuth } from '../config/firebaseAdmin.js'

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

  try {
    const decodedUser = await adminAuth.verifyIdToken(token)
    req.user = decodedUser
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}