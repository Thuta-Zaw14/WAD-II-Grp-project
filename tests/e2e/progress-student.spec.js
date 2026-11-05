// END-TO-END TEST 1: a student hands in their homework (the student's main journey on Progress).
// Workflow: log in -> open Progress from the menu -> find the new homework under "To do" ->
// open it -> attach a photo, a YouTube link and a note -> send -> see it is waiting for feedback.
// It runs against the real login, server and database (the test data is made and removed by
// helpers/progressSeed.js). How to run it: see "Progress page tests" in the README.
import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { student, testCourse, seedCourse, seedAssignment, cleanUp, logIn } from './helpers/progressSeed.js'

const COURSE = testCourse('student')
const ASSIGNMENT_ID = 'zz-e2e-progress-hand-in'
const TITLE = 'zz E2E Twenty catches'
const PHOTO = fileURLToPath(new URL('./fixtures/practice-photo.png', import.meta.url))

test.beforeAll(async () => {
  const people = await seedCourse(COURSE)
  await seedAssignment(ASSIGNMENT_ID, TITLE, people, 72) // due in 3 days
})

test.afterAll(async () => {
  await cleanUp(COURSE)
})

test('a student sends photos and a video of their practice before the due date', async ({ page }) => {
  // (1) setup: log in as the student and open Progress from the main menu
  await logIn(page, student)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Progress/ }).click()
  await expect(page).toHaveURL(/\/progress$/)
  await expect(page.getByTestId('learning-panel')).toBeVisible()

  // the homework is under "To do", with the time left
  const card = page.getByTestId('assignment-card').filter({ hasText: TITLE })
  await expect(card).toBeVisible()
  await expect(card.getByTestId('assignment-status')).toHaveText('To do')
  await expect(card.getByTestId('assignment-due')).toContainText('Due in 3 days')

  // (2) actions: open it and attach the work
  await card.getByTestId('assignment-action').click()
  await expect(page.getByTestId('assignment-heading')).toHaveText(TITLE)
  await expect(page.getByTestId('my-status')).toHaveText('To do')

  // sending nothing is refused with a clear message
  await page.getByTestId('send-work').click()
  await expect(page.getByTestId('work-error')).toContainText('Add at least one photo or video link')

  await page.getByTestId('photo-input').setInputFiles(PHOTO)
  await expect(page.getByTestId('remove-photo')).toHaveCount(1) // the photo was made small and shown
  await page.getByTestId('video-link-0').fill('https://youtu.be/dQw4w9WgXcQ')
  await page.getByTestId('work-note').fill('15 catches in a row on my third try!')
  await page.getByTestId('send-work').click()

  // (3) assert: the work is saved and waits for the instructor
  await expect(page.getByTestId('my-status')).toHaveText('Waiting for feedback')
  const gallery = page.getByTestId('evidence-gallery')
  await expect(gallery.getByTestId('evidence-photo')).toHaveCount(1)
  await expect(gallery.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1)
  await expect(gallery.getByTestId('evidence-note')).toHaveText('15 catches in a row on my third try!')
  await expect(page.getByTestId('edit-work')).toBeVisible() // still changeable until it is graded

  // ...and the Progress page moved it out of "To do"
  await page.goto('/progress')
  const sent = page.getByTestId('assignment-card').filter({ hasText: TITLE })
  await expect(sent.getByTestId('assignment-status')).toHaveText('Waiting for feedback')
})
