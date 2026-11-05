// Landing Page Testing: a visitor goes from the landing page to sign up and to log in.
import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('4a: "Get started" opens the sign-up form', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Share what you know.')

    await page.getByRole('link', { name: "Get started, it's free" }).click()

    await expect(page).toHaveURL(/\/login\?mode=signup/)
    await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('4b: "I have an account" opens the login form', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'I have an account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  })
})
