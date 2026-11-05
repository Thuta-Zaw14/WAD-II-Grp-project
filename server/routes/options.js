import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { categoryList, regionList, knownSkills } from '../config/skills.js'

const router = express.Router()

// The genres and regions a user can choose from, plus suggested skills (see config/skills.js)
router.get('/', verifyToken, (req, res) => {
  res.json({ categories: categoryList, regions: regionList, skills: knownSkills })
})

export default router
