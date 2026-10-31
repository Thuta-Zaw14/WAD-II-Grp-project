import { auth } from '../firebase'

// Resolves once Firebase has restored the session (user or null)
export async function waitForUser() {
  await auth.authStateReady()
  return auth.currentUser
}