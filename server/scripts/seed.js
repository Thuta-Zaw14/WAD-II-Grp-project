// Run once with:  npm run seed   (from the server folder)
// Puts the demo skills that used to be hard-coded in HomePage.vue into Firestore.
import { db } from '../config/firebaseAdmin.js'
import { skillList } from '../config/skills.js'

// Don't seed twice
const existing = await db.collection('offers').limit(1).get()
if (!existing.empty) {
  console.log('Offers already exist, nothing to do.')
  process.exit(0)
}

// the category comes from the shared skill list (config/skills.js)
function categoryOf(skillName) {
  for (const skill of skillList) {
    if (skill.name === skillName) return skill.category
  }
}

// Slots for the next 3 days, so the dates are never in the past
function makeSlots() {
  const slots = []
  const times = ['09:00', '14:00', '16:00']

  for (let day = 1; day <= 3; day++) {
    const d = new Date()
    d.setDate(d.getDate() + day)
    const date = d.toISOString().slice(0, 10) // "2026-10-28"

    for (const time of times) {
      slots.push({ id: date + '-' + time, date: date, time: time, booked: false })
    }
  }
  return slots
}

// "place" is a public meeting spot, not the coach's home
const offers = [
  { skill: 'Tennis', teacherName: 'Alex T.', place: 'Jurong East Sports Hall', region: 'West', lat: 1.3331, lng: 103.7424 },
  { skill: 'Videography', teacherName: 'Mei L.', place: 'Our Tampines Hub', region: 'East', lat: 1.3547, lng: 103.94 },
  { skill: 'Guitar basics', teacherName: 'Daniel K.', place: 'Somerset Library', region: 'Central', lat: 1.3004, lng: 103.839 },
  { skill: 'Python intro', teacherName: 'Sara R.', place: 'Woodlands Regional Library', region: 'North', lat: 1.437, lng: 103.7865 },
  { skill: 'Photo editing', teacherName: 'Jun W.', place: 'Bugis Junction', region: 'Central', lat: 1.3, lng: 103.856 },
  { skill: 'Basketball', teacherName: 'Chris P.', place: 'Bedok Community Club', region: 'East', lat: 1.324, lng: 103.93 },
  { skill: 'Tennis', teacherName: 'Priya N.', place: 'Toa Payoh Sports Hall', region: 'Central', lat: 1.3343, lng: 103.8563 },
  { skill: 'Tennis', teacherName: 'Marcus L.', place: 'Bishan Community Club', region: 'Central', lat: 1.3526, lng: 103.8352 },
  { skill: 'Python intro', teacherName: 'Wei H.', place: 'Jurong Regional Library', region: 'West', lat: 1.3396, lng: 103.7066 },
]

for (const offer of offers) {
  await db.collection('offers').add({
    ...offer,
    category: categoryOf(offer.skill),
    teacherUid: 'seed', // real teachers will have their own uid later
    slots: makeSlots(),
    createdAt: new Date().toISOString(),
  })
}

console.log('Added ' + offers.length + ' offers')
process.exit(0)