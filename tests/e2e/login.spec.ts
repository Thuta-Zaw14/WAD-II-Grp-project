import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
await page.goto('http://localhost:5173/');
await page.getByRole('link', { name: 'Sign up' }).click();
await page.getByRole('textbox', { name: 'Email' }).click();
await page.getByRole('textbox', { name: 'Email' }).fill('ddd@gmail.com');
await page.getByRole('textbox', { name: 'Email' }).press('Tab');
await page.getByRole('textbox', { name: 'Password' }).fill('FuckAIFuckAmerica');
await page.getByRole('button', { name: 'Sign up' }).click();
 expect(page.getByText('Welcome! 👋'));

 });