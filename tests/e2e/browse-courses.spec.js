// END-TO-END TEST 2: logging in and searching the courses.
// Workflow: log in, open Courses, search for a skill nobody teaches, see the "no match" message.
// It runs against the real login, server and database, so it needs a real account.
import { test, expect } from '@playwright/test'

// Fill these in with a test account that exists in Firebase. Use an account made only for
// testing: this file is saved in the public repository, so everybody can read this password.
const EMAIL = 'make@gmail.com'
const PASSWORD = 'iammake'

test('a member logs in, opens Courses and a search with no match shows a message', async ({ page }) => {
  // (1) setup: open the login page
  await page.goto('/login')

  // (2) actions: log in, go to Courses, search for a skill that does not exist
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

  await page.getByRole('link', { name: 'Courses', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Find your next course' })).toBeVisible()
  await page.getByRole('searchbox').fill('zzzzqqxx')

  // (3) assert: nothing matches, so the page says so
  await expect(page.getByText('No skills match your filters')).toBeVisible()
})
