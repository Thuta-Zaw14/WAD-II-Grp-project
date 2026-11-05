
import { test, expect } from '@playwright/test';

const EMAIL = "gooadmin@gmail.com"
const PASSWORD = "iamgoo"

test('TC_ADMIN_02 - Admin can view a user profile', async ({ page }) => {

  // Step 1: Login as admin
  await page.goto('/login');

  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);

  await page.getByRole('button', { name: 'Log in', exact: true }).click();

  // Wait for successful login
  await expect(page).toHaveURL(/\/admins/);

  // Step 2: Navigate to Admin Dashboard
  await page.goto('/admins');

  // Step 3: Wait for users table
  await expect(
    page.getByRole('columnheader', { name: 'Name' })
  ).toBeVisible();

  // Step 4: Click the first user's View button
  const viewButton = page.getByRole('button', { name: 'View' }).first();

  await expect(viewButton).toBeVisible();
  await viewButton.click();

  // Step 5: Verify User Profile page
  await expect(
    page.getByRole('heading', { name: 'User Profile' })
  ).toBeVisible();

  // Step 6: Verify user information
  await expect(page.getByText('Email:', { exact: false })).toBeVisible();
  await expect(page.getByText('User ID:', { exact: false })).toBeVisible();
  await expect(page.getByText('Credits:', { exact: false })).toBeVisible();

  // Step 7: Verify admin actions
  await expect(
    page.getByRole('heading', { name: 'Admin Actions' })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Warn User' })
  ).toBeVisible();

  // Step 8: Verify warning and report history
  await expect(
    page.getByRole('heading', { name: 'Warning History' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Report History' })
  ).toBeVisible();

});