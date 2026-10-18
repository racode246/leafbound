import { defineConfig } from 'vitest/config'

// Unit tests only; the E2E suites (e2e/) run under Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node'
  }
})
