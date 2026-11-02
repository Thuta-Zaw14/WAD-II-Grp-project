import axios from 'axios'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'

const API = import.meta.env.VITE_API_URL

// The server sends a helpful message when it says no (e.g. "Please enter your name.")
export function errorText(err) {
  if (err.response && err.response.data && err.response.data.error) {
    return err.response.data.error
  }
  return err.message
}

// One place for "this login is no longer good": the server answers 401 when the token is
// expired or revoked, and 403 with code 'banned' when an admin has suspended the account.
// Log out (the stores are cleared by the listener in main.js) and go back to the login page.
axios.interceptors.response.use(null, async (err) => {
  const status = err.response ? err.response.status : 0
  const banned = status === 403 && err.response.data && err.response.data.code === 'banned'
  if ((status === 401 || banned) && auth.currentUser) {
    await signOut(auth)
    if (window.location.pathname !== '/login') window.location.assign('/login')
  }
  return Promise.reject(err)
})

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
  // If this person came from a friend's invite link, the login page saved the friend's code
  // (see LoginPage.vue). It is sent once, when the profile is first created.
  const inviteRef = localStorage.getItem('inviteRef')
  const response = await axios.post(API + '/users', { ref: inviteRef }, await authConfig())
  localStorage.removeItem('inviteRef')
  return response.data
}

export async function getMe() {
  const response = await axios.get(API + '/users/me', await authConfig())
  return response.data
}

export async function getPublicProfile(uid) {
  const response = await axios.get(API + '/users/' + encodeURIComponent(uid) + '/public', await authConfig())
  return response.data
}

// changes = { name, bio, region, photo, showRegion, skillsTeach, skillsLearn } (any of them)
export async function updateProfile(changes) {
  const response = await axios.patch(API + '/users/me', changes, await authConfig())
  return response.data
}

// -> { ok, removedPaths } (the pictures of the deleted courses and goals)
export async function deleteAccount() {
  const response = await axios.delete(API + '/users/me', await authConfig())
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

// Add one start time to my course -> the course, with the new slot
export async function addSlot(offerId, date, time) {
  const response = await axios.post(API + '/offers/' + offerId + '/slots', { date: date, time: time }, await authConfig())
  return response.data
}

// -> { offer, removedPaths }
export async function updateOffer(id, offer) {
  const response = await axios.put(API + '/offers/' + encodeURIComponent(id), offer, await authConfig())
  return response.data
}

// -> { ok, removedPaths }
export async function deleteOffer(id) {
  const response = await axios.delete(API + '/offers/' + encodeURIComponent(id), await authConfig())
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
  const response = await axios.put(API + '/learn-goals/' + encodeURIComponent(id), goal, await authConfig())
  return response.data
}

export async function deleteGoal(id) {
  const response = await axios.delete(API + '/learn-goals/' + encodeURIComponent(id), await authConfig())
  return response.data
}

// ---------- Bookings ----------
// Book one start time of a course. -> { booking, offer }
// (the slot id looks like "2026-11-08-14:00", so it is encoded to be safe in the address)
export async function bookSlot(offerId, slotId) {
  const url = API + '/offers/' + encodeURIComponent(offerId) + '/slots/' + encodeURIComponent(slotId) + '/book'
  const response = await axios.post(url, {}, await authConfig())
  return response.data
}

// every booking I am part of, as a student or as a teacher (each has a "role")
export async function getMyBookings() {
  const response = await axios.get(API + '/bookings/mine', await authConfig())
  return response.data
}

export async function submitStageReflection(id, stageIndex, reflection) {
  const response = await axios.post(
    API + '/bookings/' + encodeURIComponent(id) + '/progress/stages/' + stageIndex + '/reflection',
    { reflection },
    await authConfig()
  )
  return response.data
}

export async function approveBookingStage(id, stageIndex) {
  const response = await axios.post(
    API + '/bookings/' + encodeURIComponent(id) + '/progress/stages/' + stageIndex + '/approve',
    {},
    await authConfig()
  )
  return response.data
}

// -> { booking, offer }
export async function cancelBooking(id) {
  const response = await axios.post(API + '/bookings/' + encodeURIComponent(id) + '/cancel', {}, await authConfig())
  return response.data
}

// -> { booking }
export async function confirmBooking(id) {
  const response = await axios.post(API + '/bookings/' + encodeURIComponent(id) + '/confirm', {}, await authConfig())
  return response.data
}

// The teacher removes a student from the class -> { booking }
export async function removeStudent(id, reason) {
  const response = await axios.post(API + '/bookings/' + id + '/remove', { reason: reason }, await authConfig())
  return response.data
}

// -> { booking }
export async function reportBooking(id, reason) {
  const response = await axios.post(API + '/bookings/' + encodeURIComponent(id) + '/report', { reason: reason }, await authConfig())
  return response.data
}

// ---------- Reports (the Reports page) ----------
// my reports, the one with the newest news first
export async function getMyReports() {
  const response = await axios.get(API + '/reports/mine', await authConfig())
  return response.data
}

// report = { title, type, description }; type is 'user', 'course', 'website' or 'other'
export async function createReport(report) {
  const response = await axios.post(API + '/reports', report, await authConfig())
  return response.data
}

// The search box on the report form: type is 'user' or 'course' -> [{ id, name, detail }]
export async function searchReportTargets(type, typed) {
  const config = await authConfig()
  config.params = { type: type, q: typed }
  const response = await axios.get(API + '/reports/search', config)
  return response.data
}

// I opened a report, so its "!" can go
export async function markReportSeen(id) {
  const response = await axios.post(API + '/reports/' + encodeURIComponent(id) + '/seen', {}, await authConfig())
  return response.data
}

// ---------- Insights ----------
// Totals worked out by the server: { totalLearners, skills, weekly, invite }
export async function getInsights() {
  const response = await axios.get(API + '/insights', await authConfig())
  return response.data
}

// ---------- Admin ----------
// Every one of these is refused by the server unless the person is an admin.

// -> { isAdmin: true or false }
export async function checkAdmin() {
  const response = await axios.get(API + '/admins/check', await authConfig())
  return response.data
}

export async function getAdminUsers() {
  const response = await axios.get(API + '/admins/users', await authConfig())
  return response.data
}

// one user with their warnings and the reports made against them
export async function getAdminUser(uid) {
  const response = await axios.get(API + '/admins/users/' + encodeURIComponent(uid), await authConfig())
  return response.data
}

export async function banUser(uid) {
  const response = await axios.put(API + '/admins/users/' + encodeURIComponent(uid) + '/ban', {}, await authConfig())
  return response.data
}

export async function unbanUser(uid) {
  const response = await axios.put(API + '/admins/users/' + encodeURIComponent(uid) + '/unban', {}, await authConfig())
  return response.data
}

// -> { warning }
export async function warnUser(uid, reason) {
  const response = await axios.post(API + '/admins/users/' + encodeURIComponent(uid) + '/warnings', { reason: reason }, await authConfig())
  return response.data
}

// index = the place of the warning in the list, counting from 0 -> { warnings }
export async function removeWarning(uid, index) {
  const response = await axios.delete(API + '/admins/users/' + encodeURIComponent(uid) + '/warnings/' + index, await authConfig())
  return response.data
}

// -> { open: [...], settled: [...] }
export async function getDisputes() {
  const response = await axios.get(API + '/admins/disputes', await authConfig())
  return response.data
}

// decision is 'pay-teacher' or 'refund-student' -> { report }
export async function settleDispute(bookingId, decision, note) {
  const response = await axios.post(API + '/admins/disputes/' + encodeURIComponent(bookingId) + '/settle', { decision: decision, note: note }, await authConfig())
  return response.data
}

// ---------- The private chat of a booking ----------
// The messages after number "after" (0 = the whole chat) -> { messages, open }
// open = can new messages still be written? (false once the booking is finished or cancelled)
export async function getMessages(bookingId, after) {
  const response = await axios.get(API + '/bookings/' + encodeURIComponent(bookingId) + '/messages?after=' + after, await authConfig())
  return response.data
}

// -> { message }
export async function sendChatMessage(bookingId, text) {
  const response = await axios.post(API + '/bookings/' + encodeURIComponent(bookingId) + '/messages', { text: text }, await authConfig())
  return response.data
}

// Admin only: the chat of a booking that was reported -> { messages }
export async function getDisputeMessages(bookingId) {
  const response = await axios.get(API + '/admins/disputes/' + encodeURIComponent(bookingId) + '/messages', await authConfig())
  return response.data
}

// ---------- The public discussion of a course ----------
// The posts after number "after" (0 = the page was just opened)
// -> { course, posts, removed, count, replace, earlier, open }
export async function getDiscussion(offerId, after) {
  const response = await axios.get(API + '/discussions/' + encodeURIComponent(offerId) + '?after=' + after, await authConfig())
  return response.data
}

// -> { post }
export async function sendPost(offerId, text) {
  const response = await axios.post(API + '/discussions/' + encodeURIComponent(offerId), { text: text }, await authConfig())
  return response.data
}

// Take a post down (its author, or the teacher of the course) -> { ok, n }
export async function removePost(offerId, n) {
  const response = await axios.delete(API + '/discussions/' + encodeURIComponent(offerId) + '/posts/' + n, await authConfig())
  return response.data
}

// ---------- Reporting one message ----------
// kind is 'public' (containerId = the course, n = the post) or 'private' (containerId = the booking, n = the message)
export async function reportMessage(kind, containerId, n, reason) {
  const body = { kind: kind, containerId: containerId, n: n, reason: reason }
  const response = await axios.post(API + '/message-reports', body, await authConfig())
  return response.data
}

// ---------- Admin: message reports ----------
// -> { open: [...], handled: [...] }
export async function getMessageReports() {
  const response = await axios.get(API + '/admins/message-reports', await authConfig())
  return response.data
}

// The messages around a reported one -> { messages, reportedN }
export async function getMessageReportContext(id) {
  const response = await axios.get(API + '/admins/message-reports/' + encodeURIComponent(id) + '/context', await authConfig())
  return response.data
}

// choices = { removeMessage: true/false, warning: '' or text, ban: true/false, note } -> { report }
export async function handleMessageReport(id, choices) {
  const response = await axios.post(API + '/admins/message-reports/' + encodeURIComponent(id) + '/handle', choices, await authConfig())
  return response.data
}
