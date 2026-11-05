// Settings for the unit and component tests (run with: pnpm test).
// The end-to-end tests in tests/e2e are run by Playwright instead (pnpm test:e2e), so they are
// left out here.
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom is a pretend browser, so components can be mounted without a real one
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/component/**/*.test.js'],
  },
})
