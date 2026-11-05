// Refund testing: the instructor cancels a class, and the student is told they got their credits back.
import { test, expect } from '@playwright/test'

const student = { email: process.env.E2E_STUDENT_EMAIL, password: process.env.E2E_STUDENT_PASSWORD }
test.skip(!student.email || !student.password, 'Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to a test student account')

const TEACHER_ID = 'zz-e2e-instructor'
const OFFER_ID = 'zz-e2e-cancel-offer'
const TITLE = 'zz E2E Cancelled Course'
const REASON = 'Sorry, I am unwell that day'

let db = null
let bookingId = ''
let creditsBefore = 0

test.beforeAll(async () => {
  if (!student.email || !student.password) return
  // the server's own admin access and booking code (the same files the server uses)
  const admin = await import('../../server/config/firebaseAdmin.js')
  const { bookSlot, cancelStartTime } = await import('../../server/models/bookings.js')
  db = admin.db

  const studentUid = (await admin.adminAuth.getUserByEmail(student.email)).uid
  creditsBefore = (await db.collection('users').doc(studentUid).get()).data().credits || 0

  // a start time 3 days from now, in Singapore time
  const sg = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString()
  const slot = { id: 'slot-1', date: sg.slice(0, 10), time: '10:00', capacity: 2, bookedBy: [] }

  await db.collection('users').doc(TEACHER_ID).set({ name: 'Test Instructor', credits: 0 })
  await db.collection('offers').doc(OFFER_ID).set({
    teacherUid: TEACHER_ID, teacherName: 'Test Instructor', title: TITLE, skill: 'Testing', category: 'Other',
    creditCost: 1, sessionDurationMinutes: 60, mode: 'online', stages: [{ name: 'Basics' }], slots: [slot],
  })

  // the student books it (1 credit is held)...
  const booked = await bookSlot(studentUid, OFFER_ID, slot.id)
  if (booked.error) throw new Error('Could not book the test class: ' + booked.error)
  bookingId = booked.booking.id
  // ...and the instructor cancels the start time (the student is refunded and notified)
  const cancelled = await cancelStartTime(TEACHER_ID, OFFER_ID, slot.id, REASON)
  if (cancelled.error) throw new Error('Could not cancel the test class: ' + cancelled.error)
})

test.afterAll(async () => {
  if (!db) return
  if (bookingId) await db.collection('bookings').doc(bookingId).delete()
  await db.collection('offers').doc(OFFER_ID).delete()
  await db.collection('users').doc(TEACHER_ID).delete()
})

test('5: the instructor cancels the class, and the student is told they got their credits back', async ({ page }) => {
  // the student logs in
  await page.goto('/login')
  await page.getByLabel('Email').fill(student.email)
  await page.getByLabel('Password').fill(student.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/home/)

  // the notice at the top of Home
  const notice = page.locator('.cancel-notice', { hasText: TITLE })
  await expect(notice).toContainText('Test Instructor cancelled ' + TITLE)
  await expect(notice).toContainText('You got your 1 credit back')
  await expect(notice).toContainText('Reason: ' + REASON)

  // the refund really happened: the credits in the nav bar are back to what they were
  await expect(page.locator('.credit-pill').first()).toHaveText(creditsBefore + ' credit' + (creditsBefore === 1 ? '' : 's'))

  // pressing "Got it" clears the notice
  await notice.getByRole('button', { name: 'Got it' }).click()
  await expect(page.locator('.cancel-notice', { hasText: TITLE })).toHaveCount(0)
})
