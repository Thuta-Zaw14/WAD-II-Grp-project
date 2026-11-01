import axios from 'axios'
import { auth } from '../firebase'

const API = import.meta.env.VITE_API_URL

// The server sends a helpful message when it says no (e.g. "Please enter your name.")
export function errorText(err) {
  if (err.response && err.response.data && err.response.data.error) {
    return err.response.data.error
  }
  return err.message
}

async function authConfig() {
  // After a page refresh Firebase needs a moment to restore the login,
  // so wait for it before reading auth.currentUser
  await auth.authStateReady()
  if (!auth.currentUser) {
    throw new Error('Please log in first.')
  }
  const token = await auth.currentUser.getIdToken()
  return { headers: { Authorization: 'Bearer ' + token } }
}

export async function createProfile() {
  const response = await axios.post(API + '/users', {}, await authConfig())
  return response.data
}

export async function getMe() {
  const response = await axios.get(API + '/users/me', await authConfig())
  return response.data
}

// changes = { name, bio, region, skillsTeach, skillsLearn } (any of them)
export async function updateProfile(changes) {
  const response = await axios.patch(API + '/users/me', changes, await authConfig())
  return response.data
}

export async function getMySkillCards() {
  const response = await axios.get(API + '/users/me/skill-cards', await authConfig())
  return response.data
}

// the genres and regions people can choose from -> { categories: [...], regions: [...] }
export async function getOptions() {
  const response = await axios.get(API + '/options', await authConfig())
  return response.data
}

export async function getOffers() {
  const response = await axios.get(API + '/offers', await authConfig())
  return response.data
}

// ---------- Courses I teach ----------
export async function getMyOffers() {
  const response = await axios.get(API + '/offers/mine', await authConfig())
  return response.data
}

export async function createOffer(offer) {
  const response = await axios.post(API + '/offers', offer, await authConfig())
  return response.data
}

// -> { offer, removedPaths }
export async function updateOffer(id, offer) {
  const response = await axios.put(API + '/offers/' + id, offer, await authConfig())
  return response.data
}

// -> { ok, removedPaths }
export async function deleteOffer(id) {
  const response = await axios.delete(API + '/offers/' + id, await authConfig())
  return response.data
}

// ---------- Skills I want to learn ----------
export async function getMyGoals() {
  const response = await axios.get(API + '/learn-goals/mine', await authConfig())
  return response.data
}

export async function createGoal(goal) {
  const response = await axios.post(API + '/learn-goals', goal, await authConfig())
  return response.data
}

export async function updateGoal(id, goal) {
  const response = await axios.put(API + '/learn-goals/' + id, goal, await authConfig())
  return response.data
}

export async function deleteGoal(id) {
  const response = await axios.delete(API + '/learn-goals/' + id, await authConfig())
  return response.data
}
