// Settings for the end-to-end tests (run with: pnpm playwright test).
// Playwright opens the real app in a real browser and clicks through it like a person.
// The app must already be running (the front end on port 5173 and the server on port 3000),
// the same way the slides host the page before testing it.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    // where the app is running; change this to the live address to test the deployed site
    baseURL: 'http://localhost:5173',
    // a picture after every test, saved in test-results/ (used as evidence in the PDF)
    screenshot: 'on',
  },
  // Chromium (Chrome) only: the course marks the site in Chrome
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
