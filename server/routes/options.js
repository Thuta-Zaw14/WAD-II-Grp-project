import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { skillList, regionList } from '../config/skills.js'

const router = express.Router()

// The skills and regions a user can choose from (see config/skills.js)
router.get('/', verifyToken, (req, res) => {
  res.json({ skills: skillList, regions: regionList })
})

export default router