import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import userRoutes from './routes/users.js'
import offerRoutes from './routes/offers.js'
import optionRoutes from './routes/options.js'
import learnGoalRoutes from './routes/learnGoals.js'
import bookingRoutes from './routes/bookings.js'
import insightRoutes from './routes/insights.js'
import adminRoutes from './routes/admins.js'
import discussionRoutes from './routes/discussions.js'
import messageReportRoutes from './routes/messageReports.js'
import reportRoutes from './routes/reports.js'
import passwordResetRoutes from './routes/passwordResets.js'

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))

app.use(express.json())

// A simple limit on how often one address may call the API: 300 requests a minute is far more
// than the pages need (they poll every few seconds), but stops a script hammering Firestore.
const LIMIT_PER_MINUTE = 300
let windowStart = Date.now()
let requestCounts = new Map() // ip -> requests in the current minute
app.use('/api', (req, res, next) => {
  if (Date.now() - windowStart > 60 * 1000) {
    windowStart = Date.now()
    requestCounts = new Map()
  }
  const count = (requestCounts.get(req.ip) || 0) + 1
  requestCounts.set(req.ip, count)
  if (count > LIMIT_PER_MINUTE) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' })
  }
  next()
})

app.use('/api/users', userRoutes)
app.use('/api/offers', offerRoutes)
app.use('/api/options', optionRoutes)
app.use('/api/learn-goals', learnGoalRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/insights', insightRoutes)
app.use('/api/admins', adminRoutes)
app.use('/api/discussions', discussionRoutes)
app.use('/api/message-reports', messageReportRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/password-resets', passwordResetRoutes) // "Forget Password" on the login page (no login needed)

// Anything a route did not handle itself (a broken JSON body, an unexpected Firestore error...)
// ends here. Express's own handler would send the stack trace to the browser, so send a plain
// message instead and keep the details in the server log.
app.use((err, req, res, next) => {
  console.log('unhandled error on ' + req.method + ' ' + req.originalUrl + ':', err.message)
  const status = err.status || err.statusCode || 500
  if (res.headersSent) return next(err)
  res.status(status).json({ error: status < 500 ? 'Bad request.' : 'Something went wrong. Please try again.' })
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Server running on http://localhost:' + port)
})