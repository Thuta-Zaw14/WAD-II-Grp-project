import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { addDocID, findDocsWhereEquals } from '../models/dbQuery.js'
import { categoryList, regionList } from '../config/skills.js'
import { findSkillNameProblem, squeezeSpaces, allMediaPaths } from '../models/skillRules.js'
import { deleteDiscussion } from '../models/discussions.js'

const router = express.Router()

const maxSkills = 15 // per list
const maxPhotoLength = 60000 // characters; a 160px photo is about 15000

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
    const nameProblem = findSkillNameProblem(skill.name)
    if (nameProblem !== '') return nameProblem
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

  // Picture uploads are switched off: a photo added before can be kept or removed, nothing more
  // (the route below checks it matches the saved one)
  if (body.photo !== undefined) {
    if (typeof body.photo !== 'string') {
      return 'Your photo must be a picture.'
    }
    if (body.photo !== '' && !body.photo.startsWith('data:image/')) {
      return 'Your photo must be a picture.'
    }
    if (body.photo.length > maxPhotoLength) {
      return 'Your photo is too large.'
    }
  }

  if (body.showRegion !== undefined && typeof body.showRegion !== 'boolean') {
    return 'showRegion must be true or false.'
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

// An invite link carries the uid of the person who sent it (see LoginPage.vue).
// Returns that uid if it belongs to a real, different user, otherwise ''.
// A bad or made-up code is simply ignored: the new person still gets their profile.
async function findInviter(code, ownUid) {
  if (typeof code !== 'string') return ''
  const inviterUid = code.trim()
  if (inviterUid === '' || inviterUid.length > 128 || inviterUid.includes('/')) return ''
  if (inviterUid === ownUid) return ''

  const inviter = await db.collection('users').doc(inviterUid).get()
  return inviter.exists ? inviterUid : ''
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
    referredBy: await findInviter(req.body.ref, req.user.uid), // who invited this person ('' = nobody)
    isAdmin: false, // an admin is made by hand: set this to true in the Firestore console
    isBanned: false,
    warnings: [], // warnings from an admin: { reason, createdAt, by }
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

  // after someone changes their email in Firebase, copy the new one over
  const profile = snapshot.data()
  if (req.user.email && profile.email !== req.user.email) {
    await snapshot.ref.update({ email: req.user.email })
    profile.email = req.user.email
  }

  res.json({ id: snapshot.id, ...profile })
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
  if (req.body.photo !== undefined) changes.photo = req.body.photo
  if (req.body.showRegion !== undefined) changes.showRegion = req.body.showRegion
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
  if (changes.photo && changes.photo !== snapshot.data().photo) {
    return res.status(400).json({ error: 'Profile pictures can no longer be added.' })
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

router.get('/:uid/public', verifyToken, async (req, res) => {
  const uid = req.params.uid
  if (!uid || uid.includes('/')) return res.status(400).json({ error: 'Invalid profile.' })

  try {
    const snapshot = await db.collection('users').doc(uid).get()
    if (!snapshot.exists || snapshot.data().isBanned === true) {
      return res.status(404).json({ error: 'Profile not found.' })
    }

    const [cardsResult, bookingsResult] = await Promise.all([
      findDocsWhereEquals('skillCards', 'learnerUid', uid),
      findDocsWhereEquals('bookings', 'learnerUid', uid),
    ])
    if (!cardsResult.status || !bookingsResult.status) {
      return res.status(500).json({ error: 'Could not load this profile.' })
    }

    const profile = snapshot.data()
    const completedCourses = cardsResult.docs
      .map((card) => ({
        name: card.name || card.title || '',
        courseTitle: card.courseTitle || card.name || card.title || '',
        category: card.category || '',
        subskills: Array.isArray(card.subskills) ? card.subskills : [],
        issuer: card.issuer || '',
        dateAttained: card.dateAttained || '',
        sessionDurationMinutes: card.sessionDurationMinutes || 60, // the length of the one lesson
        completedStageCount: card.completedStageCount || (Array.isArray(card.subskills) ? card.subskills.length : 0),
      }))
      .sort((a, b) => b.dateAttained.localeCompare(a.dateAttained))

    // Courses still in progress are private: only the person themself, and the teacher of that
    // course, can see how far along they are. Finished courses (skill cards) are shown to everyone.
    const viewer = req.user.uid
    const progress = bookingsResult.docs
      .filter((booking) => booking.status === 'booked' && Array.isArray(booking.stageNames))
      .filter((booking) => viewer === uid || booking.teacherUid === viewer)
      .map((booking) => {
        const allStageNames = booking.stageNames
        const stageProgress = Array.isArray(booking.stageProgress) ? booking.stageProgress : []
        const completedStages = allStageNames
          .map((_, index) => stageProgress[index]?.approved === true ? index : -1)
          .filter((index) => index >= 0)
        const firstIncomplete = allStageNames.findIndex((_, index) => stageProgress[index]?.approved !== true)
        const visibleStageCount = firstIncomplete === -1 ? allStageNames.length : firstIncomplete + 1
        return {
          bookingId: booking.id,
          title: booking.title || booking.skill || 'Course',
          category: booking.category || '',
          totalStageCount: allStageNames.length,
          stageNames: allStageNames.slice(0, visibleStageCount),
          stageStatuses: allStageNames.slice(0, visibleStageCount).map((_, index) => {
            const stage = stageProgress[index] || {}
            if (stage.approved === true) return 'approved'
            return stage.reflection ? 'pending' : 'not_started'
          }),
          completedStages: completedStages,
        }
      })

    res.json({
      id: snapshot.id,
      name: profile.name || '',
      bio: profile.bio || '',
      region: profile.showRegion === false ? '' : profile.region || '',
      skillsTeach: Array.isArray(profile.skillsTeach) ? profile.skillsTeach : [],
      skillsLearn: Array.isArray(profile.skillsLearn) ? profile.skillsLearn : [],
      completedCourses: completedCourses,
      progress: progress,
    })
  } catch (err) {
    console.log('public profile load failed:', err.message)
    res.status(500).json({ error: 'Could not load this profile.' })
  }
})

// Delete my account.
// Not allowed while other people depend on it: an active or disputed booking
// (as learner or teacher), or a course someone has booked.
// Removes my profile, my courses (and their discussions) and my learning goals.
// The browser then removes the uploaded pictures and the Firebase login itself.
router.delete('/me', verifyToken, async (req, res) => {
  const uid = req.user.uid

  const [asLearner, asTeacher, offers, goals] = await Promise.all([
    findDocsWhereEquals('bookings', 'learnerUid', uid),
    findDocsWhereEquals('bookings', 'teacherUid', uid),
    findDocsWhereEquals('offers', 'teacherUid', uid),
    findDocsWhereEquals('learnGoals', 'learnerUid', uid),
  ])
  if (!asLearner.status || !asTeacher.status || !offers.status || !goals.status) {
    return res.status(500).json({ error: 'Could not delete your account. Please try again.' })
  }

  for (const booking of [...asLearner.docs, ...asTeacher.docs]) {
    if (booking.status === 'booked' || booking.status === 'disputed') {
      return res.status(409).json({
        error: 'You still have an active or disputed session. Finish or cancel it first.',
      })
    }
  }
  for (const offer of offers.docs) {
    for (const slot of offer.slots || []) {
      if (Array.isArray(slot.bookedBy) && slot.bookedBy.length > 0) {
        return res.status(409).json({
          error: 'Students have booked "' + offer.title + '". Cancel those bookings first.',
        })
      }
    }
  }

  const removedPaths = []
  for (const offer of offers.docs) {
    removedPaths.push(...allMediaPaths(offer.media, offer.stages))
    await db.collection('offers').doc(offer.id).delete()
    try {
      await deleteDiscussion(offer.id)
    } catch (err) {
      console.log('deleteDiscussion failed:', err.message)
    }
  }
  for (const goal of goals.docs) {
    removedPaths.push(...allMediaPaths(goal.media, goal.stages))
    await db.collection('learnGoals').doc(goal.id).delete()
  }

  await db.collection('users').doc(uid).delete()

  res.json({ ok: true, removedPaths: removedPaths })
})

export default router