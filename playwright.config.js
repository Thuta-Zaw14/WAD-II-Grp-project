// Settings for the end-to-end tests (run with: pnpm playwright test).
// Playwright opens the real app in a real browser and clicks through it like a person.
// It tests the deployed site (https://wad-kongsi.vercel.app). To test another address, set
// BASE_URL first, e.g. $env:BASE_URL = "http://localhost:5173".
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    // where the app is running; change this to the live address to test the deployed site
    baseURL: process.env.BASE_URL || 'https://wad-kongsi.vercel.app',
    // a picture after every test, saved in test-results/ (used as evidence in the PDF)
    screenshot: 'on',
  },
  // Chromium (Chrome) only: the course marks the site in Chrome
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
