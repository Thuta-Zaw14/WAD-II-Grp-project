// END-TO-END TEST: the Insights page.
// Workflow: log in, open Insights from the menu, check its sections appear, and that the
// "Invite a friend" box has a ready invite link.
// It runs against the real login, server and database, so it needs a real account.
import { test, expect } from '@playwright/test'

// Fill these in with a test account that exists in Firebase. Use an account made only for
// testing: this file is saved in the public repository, so everybody can read this password.
const EMAIL = 'make@gmail.com'
const PASSWORD = 'iammake'

test('a member opens Insights and sees the demand charts and an invite link', async ({ page }) => {
  // (1) setup: open the login page
  await page.goto('/login')

  // (2) actions: log in, then open Insights from the main menu
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()

  await page.getByRole('link', { name: 'Insights', exact: true }).click()

  // (3) assert: the page and each of its sections are shown
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Top skills in demand' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Demand by genre' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bookings per week' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Teachers needed' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Invite a friend' })).toBeVisible()

  // the invite link is filled in once the page has loaded (the button stays disabled until then)
  await expect(page.getByRole('button', { name: 'Copy invite link' })).toBeEnabled()
  const inviteLink = await page.getByRole('textbox').inputValue()
  expect(inviteLink).toContain('/login?ref=')
})
