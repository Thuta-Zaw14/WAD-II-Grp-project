import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { categoryList, regionList } from '../config/skills.js'

const router = express.Router()

// The genres and regions a user can choose from (see config/skills.js)
router.get('/', verifyToken, (req, res) => {
  res.json({ categories: categoryList, regions: regionList })
})

export default router