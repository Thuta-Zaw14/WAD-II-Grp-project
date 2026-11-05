// END-TO-END TEST 2: the instructor's journey on Progress.
// Workflow: log in -> Progress -> Teaching tab -> set a new assignment for a student ->
// open the work waiting for review -> grade it with stars and feedback -> give the student
// their final mastery level.
// It runs against the real login, server and database (the test data is made and removed by
// helpers/progressSeed.js). How to run it: see "Progress page tests" in the README.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { teacher, testCourse, seedCourse, seedAssignment, seedSubmission, cleanUp, logIn } from './helpers/progressSeed.js'

const COURSE = testCourse('instructor')
const ASSIGNMENT_ID = 'zz-e2e-progress-to-grade'
const SEEDED_TITLE = 'zz E2E Cascade video'
const NEW_TITLE = 'zz E2E Juggle while walking'
const PHOTO = 'data:image/png;base64,' + readFileSync(new URL('./fixtures/practice-photo.png', import.meta.url)).toString('base64')

let people = null

test.beforeAll(async () => {
  people = await seedCourse(COURSE)
  await seedAssignment(ASSIGNMENT_ID, SEEDED_TITLE, people, 72)
  await seedSubmission(ASSIGNMENT_ID, people, PHOTO) // the student already sent their work
})

test.afterAll(async () => {
  await cleanUp(COURSE)
})

test('an instructor sets homework, grades a student\'s work and gives a final mastery level', async ({ page }) => {
  // (1) setup: log in as the instructor and open the Teaching side of Progress
  await logIn(page, teacher)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Progress/ }).click()
  await page.getByTestId('tab-teaching').click()
  await expect(page).toHaveURL(/tab=teaching/)

  const course = page.getByTestId('teaching-course').filter({ hasText: COURSE.title })
  await expect(course).toBeVisible()

  // (2a) set a new assignment for the course
  await course.getByTestId('new-assignment').click()
  const form = page.getByTestId('assignment-form')
  await form.getByTestId('assignment-title').fill(NEW_TITLE)
  await form.getByTestId('assignment-instructions').fill('Walk 10 steps while keeping three balls in the air. Film it from the front.')
  await expect(form.getByLabel(people.studentName)).toBeChecked() // everyone who had the class is picked
  await page.getByTestId('assignment-save').click()
  await expect(page.getByTestId('assignment-form')).toHaveCount(0)
  await expect(course.getByTestId('teaching-assignment').filter({ hasText: NEW_TITLE })).toContainText('0/1 sent')

  // (2b) open the work waiting for review
  const waiting = page.getByTestId('review-inbox').locator('li').filter({ hasText: SEEDED_TITLE })
  await expect(waiting).toContainText(people.studentName)
  await waiting.getByTestId('review-open').click()
  await expect(page.getByTestId('assignment-heading')).toHaveText(SEEDED_TITLE)
  const work = page.getByTestId('student-work')
  await expect(work.getByTestId('evidence-photo')).toHaveCount(1)
  await expect(work.getByTestId('evidence-note')).toHaveText('I managed 15 catches in a row!')

  // saving without stars is refused, then grade it 4 stars with feedback
  await page.getByTestId('save-grade').click()
  await expect(page.getByTestId('review-error')).toHaveText('Pick 1 to 5 stars first.')
  await page.getByTestId('star-4').click()
  await page.getByTestId('review-feedback').fill('Great rhythm! Keep your throws at eye level.')
  await page.getByTestId('save-grade').click()

  // (3a) assert: the work is graded
  const studentButton = page.getByTestId('student-button').filter({ hasText: people.studentName })
  await expect(studentButton).toContainText('Graded')
  await expect(work.getByTestId('star-display')).toHaveAttribute('aria-label', '4 out of 5 stars')

  // (2c) back on Progress: the inbox is empty, and the course is finished, so give the final grade
  await page.goto('/progress?tab=teaching')
  await expect(page.getByTestId('review-inbox').locator('li').filter({ hasText: SEEDED_TITLE })).toHaveCount(0)
  const studentRow = page.getByTestId('teaching-course').filter({ hasText: COURSE.title })
    .getByTestId('teaching-student').filter({ hasText: people.studentName })
  await studentRow.getByTestId('grade-mastery').click()
  await page.getByTestId('level-proficient').click()
  await page.getByTestId('mastery-summary').fill('Solid cascade. Next: work on walking while juggling.')
  await page.getByTestId('mastery-save').click()

  // (3b) assert: the student now shows the level
  await expect(page.getByTestId('mastery-form')).toHaveCount(0)
  await expect(studentRow).toContainText('Proficient')
  await expect(studentRow.getByTestId('grade-mastery')).toHaveText('Change')
})
