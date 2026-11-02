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

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))

app.use(express.json())

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

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Server running on http://localhost:' + port)
})