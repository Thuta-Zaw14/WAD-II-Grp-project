import axios from 'axios'
import { auth } from '../firebase'

const API = import.meta.env.VITE_API_URL

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

// { categories: [...], regions: [...] }.
export async function getOptions() {
  const response = await axios.get(API + '/options', await authConfig())
  return response.data
}

export async function getOffers() {
  const response = await axios.get(API + '/offers', await authConfig())
  return response.data
}