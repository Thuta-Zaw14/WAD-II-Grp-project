import axios from 'axios'
import { auth } from '../firebase'
 
const API = import.meta.env.VITE_API_URL

async function authFetch(path, method = 'GET', data = undefined) {
  const user = auth.currentUser

  if (!user) {
    throw new Error('You must be logged in to perform this action.')
  }

  if (!API) {
    throw new Error('Backend API URL is not configured.')
  }

  const token = await user.getIdToken()

  const response = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json()
}
 

export async function createProfile() {
  const response = await axios.post(API + '/users', {}, await authConfig())
  return response.data
}

export function getMe() {
  return authFetch('/users/me', 'GET')
}

export function updateProfile(profileData) {
  return authFetch('/users/me', 'PATCH', profileData)
}

export function getMySkillCards() {
  return authFetch('/users/me/skill-cards', 'GET')
}

export function getMySkills() {
  return authFetch('/skills/mine', 'GET')
}

export function createSkill(skill) {
  return authFetch('/skills', 'POST', skill)
}

export function updateSkill(id, skill) {
  return authFetch('/skills/' + id, 'PUT', skill)
}

export function deleteSkill(id) {
  return authFetch('/skills/' + id, 'DELETE')
}