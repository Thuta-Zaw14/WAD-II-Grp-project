import express from 'express'
import { adminAuth } from '../config/firebaseAdmin.js'
import { TEST_RESET_CODE, MIN_PASSWORD_LENGTH } from '../config/passwordReset.js'

// "Forget Password" on the login page. The person is not logged in, so there is no verifyToken:
// the email and the code are what is checked. Only the server can change the password of
// someone who is logged out (Firebase Admin), which is why this cannot happen in the browser.
const router = express.Router()

// one answer for a wrong code AND an unknown email, so nobody can use this to find out
// which emails have an account
const NOT_VERIFIED = 'That email and code do not match. Please check them and try again.'

// Returns the Firebase account for this email if the code is right, otherwise null
async function findVerifiedAccount(body) {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (email === '' || email.length > 254 || code !== TEST_RESET_CODE) return null

  try {
    return await adminAuth.getUserByEmail(email)
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') return null
    throw err
  }
}

// Step 1: check the code. body: { email, code }
router.post('/verify', async (req, res) => {
  try {
    const account = await findVerifiedAccount(req.body)
    if (!account) {
      return res.status(400).json({ error: NOT_VERIFIED })
    }
    res.json({ ok: true })
  } catch (err) {
    console.log('verify reset code failed:', err.message)
    res.status(500).json({ error: 'Could not check the code. Please try again.' })
  }
})

// Step 2: set the new password. The code is checked again here, because anyone can call this
// route without going through step 1. body: { email, code, password }
router.post('/', async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'Use at least ' + MIN_PASSWORD_LENGTH + ' characters.' })
  }
  if (password.length > 128) {
    return res.status(400).json({ error: 'The password must be 128 characters or fewer.' })
  }

  try {
    const account = await findVerifiedAccount(req.body)
    if (!account) {
      return res.status(400).json({ error: NOT_VERIFIED })
    }
    await adminAuth.updateUser(account.uid, { password: password })
    // log out every device that was using the old password
    await adminAuth.revokeRefreshTokens(account.uid)
    res.json({ ok: true })
  } catch (err) {
    console.log('reset password failed:', err.message)
    res.status(500).json({ error: 'Could not change the password. Please try again.' })
  }
})

export default router
