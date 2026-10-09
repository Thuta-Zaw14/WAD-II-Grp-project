import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import userRoutes from './routes/users.js'

const app = express()

app.use(cors({ origin: 'http://localhost:5173' })) // allow your Vue app
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/users', userRoutes)

await connectDB()
const port = process.env.PORT || 3000
app.listen(port, () => console.log('Server running on http://localhost:' + port))