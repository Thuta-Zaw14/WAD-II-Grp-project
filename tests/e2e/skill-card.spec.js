
import { test, expect } from '@playwright/test'

const baseURL = 'http://localhost:5173'

test('user can view the Skill Cards section', async ({ page }) => {
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

  // Verify the Skill Cards section is displayed.
  await expect(
    page.getByRole('heading', { name: 'My Skill Cards' })
  ).toBeVisible()

  // Verify that either an achievement card or the empty state appears.
  const cards = page.locator('.achievement-card')
  const emptyState = page.getByText(
    'No skill cards yet. They will appear here after you finish a session.'
  )

  await expect(async () => {
    const cardCount = await cards.count()
    const isEmpty = await emptyState.isVisible()

    expect(cardCount > 0 || isEmpty).toBeTruthy()
  }).toPass({ timeout: 10000 })
})

