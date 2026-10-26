import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import userRoutes from './routes/users.js'
import adminRoutes from './routes/admins.js'

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))

app.use(express.json())

app.use('/api/users', userRoutes)
app.use('/api/admins', adminRoutes)

await connectDB()

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Server running on http://localhost:' + port)
})