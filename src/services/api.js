import axios from 'axios'
import { auth } from '../firebase'
 
const API = import.meta.env.VITE_API_URL
 
async function authConfig() {
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