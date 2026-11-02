import express from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { getAllDocs } from '../models/dbQuery.js'
import { MAX_REFERRAL_REWARDS, REFERRAL_REWARD_INVITER, REFERRAL_REWARD_FRIEND } from '../config/credits.js'

// The Insights page. The browser may not read other people's profiles, so the server
// counts everything here and sends back TOTALS only: no names, emails or uids.
// (It reads whole collections, which is fine for a class project; a big app would keep
// running totals instead.)
const router = express.Router()

const WEEK = 7 * 24 * 60 * 60 * 1000
const weeksShown = 8

// The three collections are read at most once a minute however many people open the page
// (the totals may be up to a minute old). Without this every visit reads every document.
const CACHE_MS = 60 * 1000
let cached = null
async function loadCollections() {
  if (cached !== null && Date.now() - cached.at < CACHE_MS) return cached
  const [users, offers, bookings] = await Promise.all([getAllDocs('users'), getAllDocs('offers'), getAllDocs('bookings')])
  cached = { at: Date.now(), users: users, offers: offers, bookings: bookings }
  return cached
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const { users, offers, bookings } = await loadCollections()

    // ---------- Learners and teachers for each skill ----------
    // Skills are typed by people, so "Tennis" and "tennis" are the same skill. A Map is used
    // (not a plain object) so a skill called "constructor" cannot cause trouble.
    const tally = new Map()
    function entryFor(name, category) {
      const key = name.toLowerCase()
      if (!tally.has(key)) {
        tally.set(key, { skill: name, category: category || '', learners: 0, teachers: 0, teacherUids: [] })
      }
      return tally.get(key)
    }

    // learners: people who listed the skill under "skills I want to learn"
    // (a person's list never has the same skill twice, so each one counts once).
    // Old or hand-edited profiles may hold something other than { name, category },
    // e.g. a plain string, so anything that does not look right is skipped.
    let totalLearners = 0
    for (const user of users) {
      const wanted = Array.isArray(user.skillsLearn) ? user.skillsLearn : []
      let counted = false
      for (const skill of wanted) {
        if (typeof skill !== 'object' || skill === null) continue
        if (typeof skill.name !== 'string' || skill.name.trim() === '') continue
        entryFor(skill.name.trim(), skill.category).learners++
        counted = true
      }
      if (counted) totalLearners++
    }

    // teachers: people who have a course in the skill (each teacher counts once per skill)
    for (const offer of offers) {
      if (typeof offer.skill !== 'string' || offer.skill.trim() === '') continue
      if (typeof offer.teacherUid !== 'string' || offer.teacherUid === '') continue
      const entry = entryFor(offer.skill.trim(), offer.category)
      if (!entry.teacherUids.includes(offer.teacherUid)) {
        entry.teacherUids.push(offer.teacherUid)
        entry.teachers++
      }
    }

    const skills = []
    for (const entry of tally.values()) {
      skills.push({ skill: entry.skill, category: entry.category, learners: entry.learners, teachers: entry.teachers })
    }
    skills.sort((a, b) => b.learners - a.learners || (a.skill < b.skill ? -1 : 1))

    // ---------- Bookings in each of the last 8 weeks (cancelled ones do not count) ----------
    const now = Date.now()
    const counts = []
    const labels = []
    for (let i = 0; i < weeksShown; i++) {
      counts.push(0)
      // each week is labelled with its first day, e.g. "3 Nov"
      const start = new Date(now - (weeksShown - i) * WEEK)
      labels.push(start.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short' }))
    }
    for (const booking of bookings) {
      if (booking.status === 'cancelled') continue
      const age = now - new Date(booking.createdAt).getTime()
      if (Number.isNaN(age) || age < 0 || age >= weeksShown * WEEK) continue
      counts[weeksShown - 1 - Math.floor(age / WEEK)]++
    }

    // ---------- My invites ----------
    let friendsJoined = 0
    let rewarded = 0
    for (const user of users) {
      if (user.referredBy === req.user.uid) friendsJoined++
      if (user.id === req.user.uid) rewarded = user.referralsRewarded || 0
    }

    res.json({
      totalLearners: totalLearners,
      skills: skills,
      weekly: { labels: labels, counts: counts },
      invite: {
        friendsJoined: friendsJoined,
        rewarded: rewarded,
        max: MAX_REFERRAL_REWARDS,
        creditsEarned: rewarded * REFERRAL_REWARD_INVITER,
        rewardInviter: REFERRAL_REWARD_INVITER,
        rewardFriend: REFERRAL_REWARD_FRIEND,
      },
    })
  } catch (err) {
    console.log('insights failed:', err) // the whole error, with the line it came from
    res.status(500).json({ error: 'Could not load the insights.' })
  }
})

export default router
