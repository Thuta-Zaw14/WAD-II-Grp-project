import express from 'express'
import { db } from '../config/firebaseAdmin.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { addDoc, getAllDocs, findDocsWhereEquals } from '../models/dbQuery.js'
import { findProfileSkill, findMediaProblem, cleanMedia, allMediaPaths, findTitleProblem } from '../models/skillRules.js'
import { slotMoment } from '../models/bookingRules.js'
import { publicOffer, publicBooking } from '../models/publicView.js'
import { bookSlot } from '../models/bookings.js'
import { deleteDiscussion, isValidId } from '../models/discussions.js'
import { verifyPlace } from '../models/places.js'
import { MAX_STAGES, calcCreditCost } from '../config/credits.js'

const router = express.Router()

// A made-up id such as "a/b" would make Firestore throw (it reads it as a path), so ids like
// that get a plain 404 here, before any route runs (the same check as routes/admins.js).
router.param('id', (req, res, next, value) => {
  if (!isValidId(value)) return res.status(404).json({ error: 'Not found.' })
  next()
})
router.param('slotId', (req, res, next, value) => {
  if (!isValidId(value)) return res.status(404).json({ error: 'Not found.' })
  next()
})

const maxSlots = 20

// ---------- Checking what the form sends ----------

// true if the text is made only of the characters 0-9
function allDigits(text) {
  if (text === '') return false
  for (const ch of text) {
    if (!'0123456789'.includes(ch)) return false
  }
  return true
}

// "2026-11-08": three parts joined by '-' with 4, 2 and 2 digits
function isDateText(text) {
  const parts = text.split('-')
  if (parts.length !== 3) return false
  if (parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) return false
  return allDigits(parts[0]) && allDigits(parts[1]) && allDigits(parts[2])
}

// "14:00": hours 00-23 and minutes 00-59
function isTimeText(text) {
  const parts = text.split(':')
  if (parts.length !== 2) return false
  if (parts[0].length !== 2 || parts[1].length !== 2) return false
  if (!allDigits(parts[0]) || !allDigits(parts[1])) return false
  return Number(parts[0]) <= 23 && Number(parts[1]) <= 59
}

function isRealSlot(slot) {
  if (typeof slot !== 'object' || slot === null) return false
  if (typeof slot.date !== 'string' || !isDateText(slot.date)) return false
  if (typeof slot.time !== 'string' || !isTimeText(slot.time)) return false
  const startsAt = slotMoment(slot.date, slot.time)
  if (Number.isNaN(startsAt.getTime())) return false // e.g. month 13
  // JavaScript quietly rolls a date that does not exist (2026-02-31) over to the next month,
  // so the date must come back unchanged when read in Singapore time
  const singaporeDay = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return singaporeDay === slot.date
}

// Returns an error message, or '' if everything is fine.
// existing = the saved offer when editing (its slots may already be in the past)
function findProblem(body, uid, user, existing) {
  if (typeof body.title !== 'string' || body.title.trim() === '') return 'Please enter a title.'
  const titleProblem = findTitleProblem(body.title)
  if (titleProblem !== '') return titleProblem

  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 1000)) {
    return 'The description must be 1000 characters or fewer.'
  }

  if (!findProfileSkill(user, 'skillsTeach', body.skill)) {
    return 'Pick one of the skills from your profile.'
  }

  if (body.mode !== 'physical' && body.mode !== 'online') return 'Choose a physical or an online class.'
  if (!['standard', 'high_risk'].includes(body.difficulty)) return 'Choose a difficulty.'

  if (body.mode === 'physical') {
    // the place itself is checked with OneMap in findMeetingPlace below
    if (typeof body.location !== 'object' || body.location === null) {
      return 'Please search for the meeting place and pick it from the list.'
    }
    if (!['provided', 'bring', 'not_required'].includes(body.equipmentOption)) return 'Choose an equipment option.'
  }

  if (!Number.isInteger(body.maxCapacity) || body.maxCapacity < 1 || body.maxCapacity > 50) {
    return 'Maximum students must be a whole number from 1 to 50.'
  }
  if (!Number.isInteger(body.durationWeeks) || body.durationWeeks < 1 || body.durationWeeks > 52) {
    return 'Course length must be a whole number of weeks (1-52).'
  }
  if (!Number.isInteger(body.lessonsPerWeek) || body.lessonsPerWeek < 1 || body.lessonsPerWeek > 7) {
    return 'Lessons per week must be a whole number (1-7).'
  }
  if (!Number.isInteger(body.sessionDurationMinutes) || body.sessionDurationMinutes < 1 || body.sessionDurationMinutes > 1440) {
    return 'Session duration must be a whole number from 1 to 1440 minutes.'
  }

  if (!Array.isArray(body.stages) || body.stages.length < 1) return 'A course needs at least 1 stage.'
  if (body.stages.length > MAX_STAGES) return 'A course can have up to ' + MAX_STAGES + ' stages.'
  for (const stage of body.stages) {
    if (typeof stage !== 'object' || stage === null) return 'A stage is not valid.'
    if (typeof stage.name !== 'string' || stage.name.trim() === '') return 'Every stage needs a name.'
    if (stage.name.trim().length > 60) return 'A stage name must be 60 characters or fewer.'
    if (stage.description !== undefined && (typeof stage.description !== 'string' || stage.description.length > 500)) {
      return 'A stage description must be 500 characters or fewer.'
    }
    const stageMedia = findMediaProblem(stage.media || [], uid, 3, true)
    if (stageMedia !== '') return stageMedia
  }

  const mediaProblem = findMediaProblem(body.media || [], uid, 5, false)
  if (mediaProblem !== '') return mediaProblem

  if (!Array.isArray(body.slots) || body.slots.length < 1) return 'Add at least one start date and time.'
  if (body.slots.length > maxSlots) return 'You can add up to ' + maxSlots + ' start times.'
  const oldIds = []
  for (const slot of (existing && existing.slots) || []) {
    oldIds.push(slot.id)
  }
  for (const slot of body.slots) {
    if (!isRealSlot(slot)) return 'A start date or time is not valid.'
    const id = slot.date + '-' + slot.time
    // a start time that is already saved may be in the past; a new one may not
    if (!oldIds.includes(id) && slotMoment(slot.date, slot.time) <= new Date()) {
      return 'Start times must be in the future.'
    }
  }

  return ''
}

// ---------- Building the document we store ----------

function buildSlots(bodySlots, capacity, existing) {
  const oldSlots = (existing && existing.slots) || []
  const slots = []
  const seen = []

  for (const slot of bodySlots) {
    const id = slot.date + '-' + slot.time
    if (seen.includes(id)) continue // the same start time twice
    seen.push(id)

    // keep the people who already booked this slot
    let bookedBy = []
    for (const old of oldSlots) {
      if (old.id === id && Array.isArray(old.bookedBy)) bookedBy = old.bookedBy
    }
    slots.push({ id: id, date: slot.date, time: slot.time, capacity: capacity, bookedBy: bookedBy })
  }

  // slots sorted soonest first
  slots.sort((a, b) => (a.id < b.id ? -1 : 1))
  return slots
}

// an existing slot that people booked must not disappear or shrink below its bookings
function findSlotProblem(slots, capacity, existing) {
  for (const old of (existing && existing.slots) || []) {
    const taken = Array.isArray(old.bookedBy) ? old.bookedBy.length : 0
    if (taken === 0) continue
    let found = null
    for (const slot of slots) {
      if (slot.id === old.id) found = slot
    }
    if (found === null) return 'You cannot remove a start time that students have booked (' + old.date + ' ' + old.time + ').'
    if (taken > capacity) return 'Maximum students cannot be lower than the ' + taken + ' already booked on ' + old.date + ' ' + old.time + '.'
  }
  return ''
}

// ---------- Where a physical class meets ----------

// true if the browser sent back the course's saved place unchanged
function samePlace(existing, picked) {
  if (typeof picked !== 'object' || picked === null) return false
  return picked.lat === existing.lat && picked.lng === existing.lng && picked.address === existing.address
}

// The browser sends the place picked in the search box: { name, address, postal, lat, lng }.
// The server checks it with OneMap and keeps OneMap's copy, so the pin is exact and the place is
// real. A course being edited keeps its checked place without asking OneMap again.
// -> { place } (place is null for an online class) or { status, error }
async function findMeetingPlace(body, existing) {
  if (body.mode !== 'physical') return { place: null }

  if (existing && existing.placeVerified === true && samePlace(existing, body.location)) {
    return {
      place: {
        name: existing.place,
        address: existing.address,
        postal: existing.postal || '',
        lat: existing.lat,
        lng: existing.lng,
        region: existing.region,
      },
    }
  }

  let place = null
  try {
    place = await verifyPlace(body.location)
  } catch (err) {
    console.log('meeting place check failed:', err.message)
    return { status: 503, error: 'We could not check the meeting place right now. Please try again in a minute.' }
  }
  if (place === null) {
    return { status: 400, error: 'We could not find that meeting place in Singapore. Please search for it again and pick it from the list.' }
  }
  return { place: place }
}

// place = the checked meeting place from findMeetingPlace (null for an online class)
function buildOffer(body, uid, user, existing, place) {
  const skill = findProfileSkill(user, 'skillsTeach', body.skill)
  const physical = body.mode === 'physical'
  const equipmentOption = physical ? body.equipmentOption : 'not_required'
  const difficulty = body.difficulty

  const stages = []
  for (const stage of body.stages) {
    stages.push({
      name: stage.name.trim(),
      description: (stage.description || '').trim(),
      media: cleanMedia(stage.media || []),
    })
  }

  // The price is worked out HERE, from the answers. Anything the browser
  // sends for it is ignored.
  const creditCost = calcCreditCost({ mode: body.mode, equipmentOption: equipmentOption })

  return {
    title: body.title.trim(),
    description: (body.description || '').trim(),
    media: cleanMedia(body.media || []),
    skill: skill.name,
    category: skill.category,
    mode: body.mode,
    // all from OneMap (see findMeetingPlace): the browser's own numbers are never stored
    region: place ? place.region : '',
    place: place ? place.name : '',
    address: place ? place.address : '',
    postal: place ? place.postal : '',
    lat: place ? place.lat : null, // the exact pin on the Courses page map
    lng: place ? place.lng : null,
    placeVerified: place !== null, // false for online classes, and for courses saved before the map search
    equipmentOption: equipmentOption,
    equipmentProvided: equipmentOption === 'provided',
    difficulty: difficulty,
    maxCapacity: body.maxCapacity,
    durationWeeks: body.durationWeeks,
    lessonsPerWeek: body.lessonsPerWeek,
    sessionDurationMinutes: body.sessionDurationMinutes,
    stages: stages,
    slots: buildSlots(body.slots, body.maxCapacity, existing),
    creditCost: creditCost, // paid by the student when booking; goes to the teacher when the course is finished
    teacherUid: uid,
  }
}

// Loads the signed-in user's profile. The teacher's name is shown to students,
// so a profile without a name cannot publish a course.
async function loadTeacher(uid) {
  const snapshot = await db.collection('users').doc(uid).get()
  if (!snapshot.exists) return { error: 'Set up your profile first.' }
  const user = snapshot.data()
  if (!user.name || user.name.trim() === '') return { error: 'Add your name on your profile first.' }
  return { user: user }
}

// Does this teacher already have a course with this title?
async function titleTaken(uid, title, exceptId) {
  const result = await findDocsWhereEquals('offers', 'teacherUid', uid)
  for (const offer of result.docs || []) {
    if (offer.id !== exceptId && (offer.title || '').toLowerCase() === title.trim().toLowerCase()) {
      return true
    }
  }
  return false
}

// ---------- Routes ----------

// Every course (the home page filters and searches in the browser)
router.get('/', verifyToken, async (req, res) => {
  const offers = await getAllDocs('offers')
  const list = []
  for (const offer of offers) {
    list.push(publicOffer(offer, req.user.uid))
  }
  res.json(list)
})

// My own courses (for the profile page and the edit form).
// This route must stay above '/:id'.
router.get('/mine', verifyToken, async (req, res) => {
  const result = await findDocsWhereEquals('offers', 'teacherUid', req.user.uid)
  if (!result.status) {
    return res.status(500).json({ error: 'Could not load your courses.' })
  }
  const list = []
  for (const offer of result.docs) {
    list.push(publicOffer(offer, req.user.uid))
  }
  list.sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1)) // newest first
  res.json(list)
})

router.post('/', verifyToken, async (req, res) => {
  const teacher = await loadTeacher(req.user.uid)
  if (teacher.error) {
    return res.status(400).json({ error: teacher.error })
  }

  const problem = findProblem(req.body, req.user.uid, teacher.user, null)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }
  if (await titleTaken(req.user.uid, req.body.title, null)) {
    return res.status(409).json({ error: 'You already have a course with this title.' })
  }

  const meeting = await findMeetingPlace(req.body, null)
  if (meeting.error) {
    return res.status(meeting.status).json({ error: meeting.error })
  }

  const offer = buildOffer(req.body, req.user.uid, teacher.user, null, meeting.place)
  offer.teacherName = teacher.user.name.trim()
  offer.createdAt = new Date().toISOString()
  offer.updatedAt = offer.createdAt

  const result = await addDoc('offers', offer)
  if (!result.status) {
    return res.status(500).json({ error: 'Could not save your course.' })
  }
  res.status(201).json(publicOffer({ id: result.id, ...offer }, req.user.uid))
})

// Book a start time. The checks and the saving happen together in models/bookings.js.
// -> { booking, offer }  (the offer is sent back so the home page can show the new seat count)
router.post('/:id/slots/:slotId/book', verifyToken, async (req, res) => {
  try {
    const result = await bookSlot(req.user.uid, req.params.id, req.params.slotId)
    if (result.error) {
      return res.status(result.status).json({ error: result.error })
    }
    res.status(201).json({
      booking: publicBooking(result.booking, req.user.uid),
      offer: publicOffer(result.offer, req.user.uid),
    })
  } catch (err) {
    console.log('bookSlot failed:', err.message)
    res.status(500).json({ error: 'Could not complete the booking. Please try again.' })
  }
})

// The teacher adds one more start time to a course (the "Add new timeslot" popup on My classes).
// body = { date: '2026-11-08', time: '14:00' }
router.post('/:id/slots', verifyToken, async (req, res) => {
  const slot = { date: req.body.date, time: req.body.time }
  if (!isRealSlot(slot)) {
    return res.status(400).json({ error: 'Please pick a valid date and time.' })
  }
  if (slotMoment(slot.date, slot.time) <= new Date()) {
    return res.status(400).json({ error: 'The start time must be in the future.' })
  }

  const ref = db.collection('offers').doc(req.params.id)
  // in a transaction, so a booking made at the same moment is never wiped out
  const outcome = await db.runTransaction(async (t) => {
    const snapshot = await t.get(ref)
    if (!snapshot.exists) return { status: 404, error: 'Course not found.' }
    const offer = snapshot.data()
    if (offer.teacherUid !== req.user.uid) return { status: 403, error: 'This is not your course.' }

    const oldSlots = offer.slots || []
    const id = slot.date + '-' + slot.time
    for (const old of oldSlots) {
      if (old.id === id) return { status: 409, error: 'This course already starts at that time.' }
    }
    if (oldSlots.length >= maxSlots) {
      return { status: 409, error: 'You can add up to ' + maxSlots + ' start times.' }
    }

    const newSlot = { id: id, date: slot.date, time: slot.time, capacity: offer.maxCapacity || 1, bookedBy: [] }
    const slots = [...oldSlots, newSlot]
    slots.sort((a, b) => (a.id < b.id ? -1 : 1)) // soonest first
    const updatedAt = new Date().toISOString()
    t.update(ref, { slots: slots, updatedAt: updatedAt })
    return { offer: { id: snapshot.id, ...offer, slots: slots, updatedAt: updatedAt } }
  })

  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error })
  }
  res.status(201).json(publicOffer(outcome.offer, req.user.uid))
})

router.put('/:id', verifyToken, async (req, res) => {
  const ref = db.collection('offers').doc(req.params.id)
  const snapshot = await ref.get()
  if (!snapshot.exists) {
    return res.status(404).json({ error: 'Course not found.' })
  }
  const existing = { id: snapshot.id, ...snapshot.data() }
  if (existing.teacherUid !== req.user.uid) {
    return res.status(403).json({ error: 'This is not your course.' })
  }

  const teacher = await loadTeacher(req.user.uid)
  if (teacher.error) {
    return res.status(400).json({ error: teacher.error })
  }

  const problem = findProblem(req.body, req.user.uid, teacher.user, existing)
  if (problem !== '') {
    return res.status(400).json({ error: problem })
  }
  if (await titleTaken(req.user.uid, req.body.title, existing.id)) {
    return res.status(409).json({ error: 'You already have a course with this title.' })
  }

  const meeting = await findMeetingPlace(req.body, existing)
  if (meeting.error) {
    return res.status(meeting.status).json({ error: meeting.error })
  }

  const offer = buildOffer(req.body, req.user.uid, teacher.user, existing, meeting.place)
  offer.teacherName = teacher.user.name.trim()
  offer.updatedAt = new Date().toISOString()

  // OUTSIDE THE SLIDES: a student can book while this request is running. So the slots are
  // worked out again from the newest copy of the course, and saved inside a transaction
  // (see models/bookings.js), so a booking that just happened is never wiped out.
  const outcome = await db.runTransaction(async (t) => {
    const freshSnap = await t.get(ref)
    if (!freshSnap.exists) return { status: 404, error: 'Course not found.' }
    const fresh = { id: freshSnap.id, ...freshSnap.data() }

    offer.slots = buildSlots(req.body.slots, offer.maxCapacity, fresh)
    const slotProblem = findSlotProblem(offer.slots, offer.maxCapacity, fresh)
    if (slotProblem !== '') return { status: 409, error: slotProblem }

    t.update(ref, offer)
    return {}
  })
  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error })
  }

  // pictures the teacher took off: the browser deletes these from Storage
  const keep = allMediaPaths(offer.media, offer.stages)
  const removedPaths = []
  for (const path of allMediaPaths(existing.media, existing.stages)) {
    if (!keep.includes(path)) removedPaths.push(path)
  }

  res.json({ offer: publicOffer({ ...existing, ...offer }, req.user.uid), removedPaths: removedPaths })
})

router.delete('/:id', verifyToken, async (req, res) => {
  const ref = db.collection('offers').doc(req.params.id)

  // In a transaction (outside the slides), so nobody can book the course in the
  // moment between "no students yet" and the delete.
  const outcome = await db.runTransaction(async (t) => {
    const snapshot = await t.get(ref)
    if (!snapshot.exists) return { status: 404, error: 'Course not found.' }
    const offer = snapshot.data()
    if (offer.teacherUid !== req.user.uid) return { status: 403, error: 'This is not your course.' }

    let students = 0
    for (const slot of offer.slots || []) {
      if (Array.isArray(slot.bookedBy)) students += slot.bookedBy.length
    }
    if (students > 0) return { status: 409, error: "Can't delete this course: students have booked it." }

    t.delete(ref)
    return { offer: offer }
  })

  if (outcome.error) {
    return res.status(outcome.status).json({ error: outcome.error })
  }

  // the course is gone, so its public discussion goes too (the delete above already worked,
  // so a problem here is only logged)
  try {
    await deleteDiscussion(req.params.id)
  } catch (err) {
    console.log('deleteDiscussion failed:', err.message)
  }

  res.json({ ok: true, removedPaths: allMediaPaths(outcome.offer.media, outcome.offer.stages) })
})

export default router
