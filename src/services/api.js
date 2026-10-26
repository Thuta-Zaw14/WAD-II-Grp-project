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

export function createProfile() {
  return authFetch('/users', 'POST')
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