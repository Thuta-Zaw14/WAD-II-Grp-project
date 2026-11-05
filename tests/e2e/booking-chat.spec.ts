import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('w@gmail.com');
  await page.getByRole('textbox', { name: 'Email' }).press('Tab');
  await page.getByRole('textbox', { name: 'Password' }).fill('1234567890');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: 'My Classes', exact: true }).click();
  await page.getByRole('button', { name: 'Chat' }).click();
  await page.getByRole('textbox', { name: 'Write a message... (Enter to' }).click();
  await page.getByRole('textbox', { name: 'Write a message... (Enter to' }).fill('hello this is a playwright test');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Back to My Classes' }).click();
  await page.getByRole('button', { name: 'Chat' }).click();
  expect(page.getByText('hello this is a playwright test'));
});