
import { test, expect } from '@playwright/test';

const EMAIL = "gooadmin@gmail.com"
const PASSWORD = "iamgoo"

test('TC_ADMIN_01 - Verify Admin Dashboard Statistics', async ({ page }) => {

  // Navigate to Admin Dashboard
  await page.goto('/admins');
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  // Verify Admin heading is displayed
  await expect(
    page.getByRole('heading', { name: 'Admin' })
  ).toBeVisible();

  // Verify all four statistics are visible
  await expect(
    page.getByRole('heading', { name: 'Total Users' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Total Reports' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Open Disputes' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Banned Accounts' })
  ).toBeVisible();

});
