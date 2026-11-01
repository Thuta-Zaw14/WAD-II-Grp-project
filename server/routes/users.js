import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { addDocID, findDocsWhereEquals } from '../models/dbQuery.js'
import { categoryList, regionList } from '../config/skills.js'
   import { findSkillNameProblem, squeezeSpaces } from '../models/skillRules.js'

const router = express.Router()

const maxSkills = 15 // per list

// Checks one list of skills: [{ name: 'Badminton', category: 'Sports' }, ...]
// The name is free text, but the category must be one of our genres.
function findSkillProblem(field, list) {
  if (!Array.isArray(list)) {
    return field + ' must be a list.'
  }
  if (list.length > maxSkills) {
    return 'You can add up to ' + maxSkills + ' skills in each list.'
  }
  for (const skill of list) {
    if (typeof skill !== 'object' || skill === null) {
      return 'Each skill needs a name and a genre.'
    }
    if (typeof skill.name !== 'string' || skill.name.trim() === '') {
      return 'Each skill needs a name.'
    }
    if (skill.name.trim().length > 40) {
      return 'A skill name must be 40 characters or fewer.'
    }
    if (!categoryList.includes(skill.category)) {
      return 'Please pick a genre from the list for ' + skill.name.trim() + '.'
    }
  }
  return ''
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
      const problem = findSkillProblem(field, body[field])
      if (problem !== '') {
        return problem
      }
    }
  }

  return ''
}

// Tidy a list of skills: trim the names, squeeze extra spaces, and drop repeats
// ("Tennis" and "tennis" count as the same skill - the first one is kept).
// Only name and category are kept, whatever else the browser sent.
function cleanSkills(list) {
  const result = []
  const seen = []
  for (const skill of list) {
    const name = squeezeSpaces(skill.name)
    const key = name.toLowerCase()
    if (!seen.includes(key)) {
      seen.push(key)
      result.push({ name: name, category: skill.category })
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
  if (req.body.skillsTeach !== undefined) changes.skillsTeach = cleanSkills(req.body.skillsTeach)
  if (req.body.skillsLearn !== undefined) changes.skillsLearn = cleanSkills(req.body.skillsLearn)

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

// Skill cards the user has earned. A card is made when the student and the teacher
// both confirm a booking is finished (see confirmBooking in models/bookings.js).
router.get('/me/skill-cards', verifyToken, async (req, res) => {
  const result = await findDocsWhereEquals('skillCards', 'learnerUid', req.user.uid)

  if (!result.status) {
    return res.status(500).json({ error: 'Could not load your skill cards.' })
  }

  res.json(result.docs)
})

export default router