import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { addDocID, findDocsWhereEquals } from '../models/dbQuery.js'
import { skillList, regionList } from '../config/skills.js'

const router = express.Router()

// the names of the skills people are allowed to pick
const skillNames = []
for (const skill of skillList) {
  skillNames.push(skill.name)
}

// Checks the data sent by the profile form. Returns an error message,
// or '' if everything is fine. The browser checks too, but anyone can skip
// the browser, so the server must check again.
function findProblem(body) {
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return 'Please enter your name.'
    }
    if (body.name.trim().length > 60) {
      return 'Your name must be 60 characters or fewer.'
    }
  }

  if (body.bio !== undefined) {
    if (typeof body.bio !== 'string' || body.bio.length > 300) {
      return 'Your bio must be 300 characters or fewer.'
    }
  }

  if (body.region !== undefined) {
    if (body.region !== '' && !regionList.includes(body.region)) {
      return 'Please pick a region from the list.'
    }
  }

  for (const field of ['skillsTeach', 'skillsLearn']) {
    if (body[field] !== undefined) {
      if (!Array.isArray(body[field])) {
        return field + ' must be a list.'
      }
      for (const skill of body[field]) {
        if (!skillNames.includes(skill)) {
          return 'Unknown skill: ' + skill
        }
      }
    }
  }

  return ''
}

// remove repeated skills, keep the order
function removeDuplicates(list) {
  const result = []
  for (const item of list) {
    if (!result.includes(item)) {
      result.push(item)
    }
  }
  return result
}

// Create the profile if it does not exist yet (safe to call on every login)
// The document id is the Firebase uid, so we never need to search for a user.
router.post('/', verifyToken, async (req, res) => {
  const userRef = db.collection('users').doc(req.user.uid)
  const snapshot = await userRef.get()

  if (snapshot.exists) {
    return res.json({ id: snapshot.id, ...snapshot.data() })
  }

  const newUser = {
    email: req.user.email,
    name: '',
    bio: '',
    region: '',
    credits: 2,
    skillsTeach: [],
    skillsLearn: [],
    createdAt: new Date().toISOString(),
  }

  const result = await addDocID('users', newUser, req.user.uid)
  if (!result.status) {
    return res.status(500).json({ error: 'Could not create your profile.' })
  }

  res.status(201).json({ id: req.user.uid, ...newUser })
})

router.get('/me', verifyToken, async (req, res) => {
  const snapshot = await db.collection('users').doc(req.user.uid).get()

  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  res.json({ id: snapshot.id, ...snapshot.data() })
})

// Save the profile form.
// Only the fields listed below can be changed. credits, email and createdAt
// are NOT in the list, so a user can never give themselves credits.
router.patch('/me', verifyToken, async (req, res) => {
  const problem = findProblem(req.body)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }

  const changes = {}
  if (req.body.name !== undefined) changes.name = req.body.name.trim()
  if (req.body.bio !== undefined) changes.bio = req.body.bio.trim()
  if (req.body.region !== undefined) changes.region = req.body.region
  if (req.body.skillsTeach !== undefined) changes.skillsTeach = removeDuplicates(req.body.skillsTeach)
  if (req.body.skillsLearn !== undefined) changes.skillsLearn = removeDuplicates(req.body.skillsLearn)

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' })
  }
  changes.updatedAt = new Date().toISOString()

  const userRef = db.collection('users').doc(req.user.uid)
  const snapshot = await userRef.get()
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  await userRef.update(changes)

  res.json({ id: snapshot.id, ...snapshot.data(), ...changes })
})

// Skill cards the user has earned. The collection is empty until the
// sessions step creates a card when a session is finished.
router.get('/me/skill-cards', verifyToken, async (req, res) => {
  const result = await findDocsWhereEquals('skillCards', 'learnerUid', req.user.uid)

  if (!result.status) {
    return res.status(500).json({ error: 'Could not load your skill cards.' })
  }

  res.json(result.docs)
})

export default router