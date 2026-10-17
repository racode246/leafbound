// E2E projects (see e2e/README.md):
//   mock       browser build against the mock backend, installed Edge (headless)
//   app-build  builds the real app with the slot's identifier and CDP port
//   app        the real app over WebView2 CDP, window hidden unless --headed; run with --workers=1
//   live       real LLM and model quality; local only, for related issues
import { defineConfig } from '@playwright/test'
import { ports, root } from './support/env.ts'

const ci = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  outputDir: './results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'mock',
      testDir: './tests/mock',
      fullyParallel: true,
      use: {
        channel: 'msedge',
        headless: true,
        locale: 'en-US',
        viewport: { width: 1200, height: 800 },
        baseURL: `http://localhost:${ports.vite}`
      }
    },
    { name: 'app-build', testDir: './tests/app', testMatch: /build\.setup\.ts/ },
    { name: 'app', testDir: './tests/app', testIgnore: /build\.setup\.ts/, dependencies: ['app-build'] },
    { name: 'live', testDir: './tests/live', dependencies: ['app-build'] }
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${ports.vite} --strictPort`,
    cwd: root,
    url: `http://localhost:${ports.vite}`,
    reuseExistingServer: !ci,
    timeout: 60_000
  }
})
