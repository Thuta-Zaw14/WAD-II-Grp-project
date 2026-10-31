import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, runTransaction,
} from 'firebase/firestore'
import { db } from '../firebase'
import { deleteMany, collectPaths } from './storage'

// ---- Rules you may want to tweak ----
export const MAX_STAGES = 12
export const BONUS_MIN_STAGES = 4
export const BONUS_MIN_LESSONS_PER_WEEK = 2
export const BONUS_STAGE_INTERVAL = 5

export function calcCreditCost({ mode, equipmentOption }) {
  return 1 + (mode === 'physical' && equipmentOption === 'provided' ? 1 : 0)
}

export function calcCompletionCredits({ stageCount, lessonsPerWeek, equipmentOption, difficulty }) {
  const stageCredits = stageCount >= BONUS_MIN_STAGES
    ? 1 + Math.floor((stageCount - BONUS_MIN_STAGES) / BONUS_STAGE_INTERVAL)
    : 0

  return 1 + stageCredits +
    (lessonsPerWeek >= BONUS_MIN_LESSONS_PER_WEEK ? 1 : 0) +
    (equipmentOption === 'bring' ? 1 : 0) +
    (difficulty === 'high_risk' ? 1 : 0)
}

const skillField = (kind) => {
  if (kind === 'teach') return 'skillsTeach'
  if (kind === 'learn') return 'skillsLearn'
  throw new Error('Skill kind must be "teach" or "learn".')
}

const normalizeSkills = (skills) =>
  Array.isArray(skills)
    ? skills
      .map((skill) => typeof skill === 'string' ? { title: skill } : skill)
      .filter((skill) => skill && typeof skill.title === 'string' && skill.title.trim())
    : []

const normalizedTitle = (title) => title.trim().toLowerCase()

// ---- Users ----
// Call after signup AND after login (covers accounts made before this existed)
export async function ensureUserProfile(user, name) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const profile = snap.data()
    const skillsTeach = normalizeSkills(profile.skillsTeach)
    const skillsLearn = normalizeSkills(profile.skillsLearn)
    if (!Array.isArray(profile.skillsTeach) || !Array.isArray(profile.skillsLearn) ||
      profile.skillsTeach.some((skill) => typeof skill === 'string') ||
      profile.skillsLearn.some((skill) => typeof skill === 'string')) {
      await setDoc(ref, { skillsTeach, skillsLearn }, { merge: true })
    }
    return { ...profile, skillsTeach, skillsLearn }
  }

  const profile = {
    name: name || user.displayName || user.email.split('@')[0],
    email: user.email,
    credits: 2,
    skillsTeach: [],
    skillsLearn: [],
    createdAt: serverTimestamp(),
  }
  await setDoc(ref, profile)
  return profile
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export async function updateUserProfile(uid, data) {
  await setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  )
}

// ---- Skills ----
const millis = (s) => s.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER

export async function getMySkills(uid, kind) {
  const q = query(
    collection(db, 'skills'),
    where('ownerId', '==', uid),
    where('kind', '==', kind)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(b) - millis(a))
}

export async function getSkill(id) {
  const snap = await getDoc(doc(db, 'skills', id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Same shape your HomePage already uses: { id, skill, teacher }
export async function getAllTeachSkills() {
  const snap = await getDocs(
    query(collection(db, 'skills'), where('kind', '==', 'teach'))
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(b) - millis(a))
    .map((s) => ({
      id: s.id,
      skill: s.title,
      teacher: s.ownerName,
      description: s.description,
      media: s.media,
      mode: s.mode,
      creditCost: s.creditCost,
    }))
}

export async function saveSkill({ id, uid, ownerName, kind, data }) {
  const payload = { ...data, kind, ownerId: uid, ownerName, updatedAt: serverTimestamp() }

  if (id) {
    await updateDoc(doc(db, 'skills', id), payload)
    return id
  }
  const ref = await addDoc(collection(db, 'skills'), {
    ...payload,
    activeStudents: 0,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteSkill(skill) {
  if (skill.activeStudents > 0) {
    throw new Error(
      `Can't delete this skill: ${skill.activeStudents} active student(s) are participating.`
    )
  }
  await deleteDoc(doc(db, 'skills', skill.id))
  await deleteMany(collectPaths(skill.media, skill.stages))
}

// ---- Past skills (skill cards earned by completing courses) ----
export async function getPastSkillCards(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'skillCards'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function saveUserSkill({ uid, kind, skill, originalTitle }) {
  const field = skillField(kind)
  const title = skill.title.trim()
  if (!title) throw new Error('Please enter a title.')

  const userRef = doc(db, 'users', uid)
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef)
    if (!snap.exists()) throw new Error('Profile not found.')

    const currentSkills = normalizeSkills(snap.data()[field])
    const originalKey = originalTitle ? normalizedTitle(originalTitle) : null
    const editIndex = originalKey
      ? currentSkills.findIndex((item) => normalizedTitle(item.title) === originalKey)
      : -1

    if (originalKey && editIndex === -1) {
      throw new Error('This skill no longer exists. Reload your profile and try again.')
    }

    const duplicate = currentSkills.some((item, index) =>
      index !== editIndex && normalizedTitle(item.title) === normalizedTitle(title)
    )
    if (duplicate) throw new Error('A skill with this title already exists.')

    const nextSkills = [...currentSkills]
    const savedSkill = { ...skill, title }
    if (editIndex === -1) nextSkills.push(savedSkill)
    else nextSkills[editIndex] = savedSkill

    transaction.update(userRef, { [field]: nextSkills, updatedAt: serverTimestamp() })
    return savedSkill
  })
}

export async function deleteUserSkill({ uid, kind, title }) {
  const field = skillField(kind)
  const userRef = doc(db, 'users', uid)
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef)
    if (!snap.exists()) throw new Error('Profile not found.')

    const currentSkills = normalizeSkills(snap.data()[field])
    const targetKey = normalizedTitle(title)
    const removed = currentSkills.find((item) => normalizedTitle(item.title) === targetKey)
    if (!removed) throw new Error('This skill no longer exists.')

    transaction.update(userRef, {
      [field]: currentSkills.filter((item) => normalizedTitle(item.title) !== targetKey),
      updatedAt: serverTimestamp(),
    })
    return removed
  })
}