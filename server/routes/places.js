import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { searchPlaces } from '../models/places.js'
import { MIN_SEARCH_LENGTH, MAX_SEARCH_LENGTH, MAX_RESULTS } from '../config/places.js'

// The meeting-place search box on the teach form. The browser asks here, and the server asks
// OneMap (see models/places.js).
const router = express.Router()

// GET /api/places/search?q=bishan library  -> [{ name, address, postal, lat, lng, region }]
router.get('/search', verifyToken, async (req, res) => {
  const typed = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (typed.length < MIN_SEARCH_LENGTH) return res.json([])
  if (typed.length > MAX_SEARCH_LENGTH) {
    return res.status(400).json({ error: 'Please type ' + MAX_SEARCH_LENGTH + ' characters or fewer.' })
  }

  try {
    const places = await searchPlaces(typed)
    res.json(places.slice(0, MAX_RESULTS))
  } catch (err) {
    console.log('place search failed:', err.message)
    res.status(503).json({ error: 'The map search is not working right now. Please try again in a minute.' })
  }
})

export default router
