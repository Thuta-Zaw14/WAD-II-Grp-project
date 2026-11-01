import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { addDoc, findDocsWhereEquals } from '../models/dbQuery.js'
import { findProfileSkill, findMediaProblem, cleanMedia, findTitleProblem } from '../models/skillRules.js'

// A "learning goal" is a skill the user wants to learn, with a short note and
// optional pictures. Each goal is its own document in the learnGoals collection
// (not an array inside the user document), so a user can have as many as they
// like and other people can read them later.
const router = express.Router()

// Returns an error message, or '' if fine
function findProblem(body, uid, user) {
  if (typeof body.title !== 'string' || body.title.trim() === '') return 'Please enter a title.'
  const titleProblem = findTitleProblem(body.title)
  if (titleProblem !== '') return titleProblem

  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 1000)) {
    return 'The description must be 1000 characters or fewer.'
  }

  if (!findProfileSkill(user, 'skillsLearn', body.skill)) {
    return 'Pick one of the skills you want to learn from your profile.'
  }

  return findMediaProblem(body.media || [], uid, 5, false)
}

function buildGoal(body, uid, user) {
  const skill = findProfileSkill(user, 'skillsLearn', body.skill)
  return {
    title: body.title.trim(),
    description: (body.description || '').trim(),
    media: cleanMedia(body.media || []),
    skill: skill.name,
    category: skill.category,
    learnerUid: uid,
  }
}

async function loadUser(uid) {
  const snapshot = await db.collection('users').doc(uid).get()
  return snapshot.exists ? snapshot.data() : null
}

// A user cannot have two goals with the same title
async function titleTaken(uid, title, exceptId) {
  const result = await findDocsWhereEquals('learnGoals', 'learnerUid', uid)
  for (const goal of result.docs || []) {
    if (goal.id !== exceptId && (goal.title || '').toLowerCase() === title.trim().toLowerCase()) {
      return true
    }
  }
  return false
}

router.get('/mine', verifyToken, async (req, res) => {
  const result = await findDocsWhereEquals('learnGoals', 'learnerUid', req.user.uid)
  if (!result.status) {
    return res.status(500).json({ error: 'Could not load your learning goals.' })
  }
  const list = result.docs
  list.sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1)) // newest first
  res.json(list)
})

router.post('/', verifyToken, async (req, res) => {
  const user = await loadUser(req.user.uid)
  if (user === null) {
    return res.status(400).json({ error: 'Set up your profile first.' })
  }
  const problem = findProblem(req.body, req.user.uid, user)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }
  if (await titleTaken(req.user.uid, req.body.title, null)) {
    return res.status(409).json({ error: 'You already have a learning goal with this title.' })
  }

  const goal = buildGoal(req.body, req.user.uid, user)
  goal.createdAt = new Date().toISOString()
  goal.updatedAt = goal.createdAt

  const result = await addDoc('learnGoals', goal)
  if (!result.status) {
    return res.status(500).json({ error: 'Could not save your learning goal.' })
  }
  res.status(201).json({ id: result.id, ...goal })
})

router.put('/:id', verifyToken, async (req, res) => {
  const ref = db.collection('learnGoals').doc(req.params.id)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Learning goal not found.' })
  }
  const existing = { id: snapshot.id, ...snapshot.data() }
  if (existing.learnerUid !== req.user.uid) {
    return res.status(403).json({ error: 'This is not your learning goal.' })
  }

  const user = await loadUser(req.user.uid)
  if (user === null) {
    return res.status(400).json({ error: 'Set up your profile first.' })
  }
  const problem = findProblem(req.body, req.user.uid, user)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }
  if (await titleTaken(req.user.uid, req.body.title, existing.id)) {
    return res.status(409).json({ error: 'You already have a learning goal with this title.' })
  }

  const goal = buildGoal(req.body, req.user.uid, user)
  goal.updatedAt = new Date().toISOString()
  await ref.update(goal)

  // pictures taken off the goal: the browser deletes these from Storage
  const keep = []
  for (const item of goal.media) keep.push(item.path)
  const removedPaths = []
  for (const item of existing.media || []) {
    if (!keep.includes(item.path)) removedPaths.push(item.path)
  }

  res.json({ goal: { ...existing, ...goal }, removedPaths: removedPaths })
})

router.delete('/:id', verifyToken, async (req, res) => {
  const ref = db.collection('learnGoals').doc(req.params.id)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Learning goal not found.' })
  }
  const goal = snapshot.data()
  if (goal.learnerUid !== req.user.uid) {
    return res.status(403).json({ error: 'This is not your learning goal.' })
  }
  await ref.delete()

  const removedPaths = []
  for (const item of goal.media || []) removedPaths.push(item.path)
  res.json({ ok: true, removedPaths: removedPaths })
})

export default router
