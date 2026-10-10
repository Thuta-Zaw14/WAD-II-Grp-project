import { auth } from '../firebase'

const API = import.meta.env.VITE_API_URL

async function authFetch(path, method) {
  const token = await auth.currentUser.getIdToken()

  const response = await fetch(API + path, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  })

  if (!response.ok) {
    throw new Error('Request failed: ' + response.status)
  }

  return response.json()
}

export function createProfile() {
  return authFetch('/users', 'POST')
}

export function getMe() {
  return authFetch('/users/me', 'GET')
}