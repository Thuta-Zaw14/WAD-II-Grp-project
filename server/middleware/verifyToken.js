import { adminAuth } from '../config/firebaseAdmin.js'

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })

  try {
    req.user = await adminAuth.verifyIdToken(token) // contains uid and email
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}