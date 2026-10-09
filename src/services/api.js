import { auth } from '../firebase'

const API = import.meta.env.VITE_API_URL

// Sends a request with the user's Firebase token attached
async function authFetch(path, options = {}) {
  const token = await auth.currentUser.getIdToken()
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  })
  if (!res.ok) throw new Error('Request failed: ' + res.status)
  return res.json()
}

export const createProfile = () => authFetch('/users', { method: 'POST' })
export const getMe = () => authFetch('/users/me')