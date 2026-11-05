
import { test, expect } from '@playwright/test'

const baseURL = 'http://localhost:5173'

test('user can open and close the Edit Profile popup', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD first.')
  }

  // Log in.
  await page.goto(`${baseURL}/login`)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/, {
    timeout: 15000,
  })

  // Open the Profile Page.
  await page.goto(`${baseURL}/profile`)

  await expect(page.locator('.profile-page h1')).toBeVisible({
    timeout: 15000,
  })

  // Open Edit Profile.
  await page.getByRole('button', { name: 'Edit profile' }).click()

  // Verify the popup appears.
  const modal = page.getByRole('dialog')

  await expect(modal).toBeVisible()
  await expect(modal.locator('#edit-name')).toBeVisible()

  // Verify the user can close the popup.
  await modal.getByRole('button', { name: 'Close', exact: true }).click()

  await expect(modal).not.toBeVisible()
})
