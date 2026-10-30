import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import userRoutes from './routes/users.js'
import offerRoutes from './routes/offers.js'
import optionRoutes from './routes/options.js'

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))

app.use(express.json())

app.use('/api/users', userRoutes)
app.use('/api/offers', offerRoutes)
app.use('/api/options', optionRoutes)

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Server running on http://localhost:' + port)
})