// E2E projects (see e2e/README.md):
//   mock       browser build against the mock backend, installed Edge (headless) posing as Windows
//   webkit     the same build in Playwright's WebKit posing as macOS (WKWebView's engine)
//   app-build  builds the real app with the slot's identifier and CDP port
//   app        the real app over WebView2 CDP, window hidden unless --headed; run with --workers=1
//   live       real LLM and model quality; local only, for related issues
import { defineConfig } from '@playwright/test'
import { edgeInstalled, ports, root } from './support/env.ts'

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
        // The installed Edge needs no browser download (CI); without it, Playwright's
        // Chromium (`npx playwright install chromium` once).
        ...(edgeInstalled ? { channel: 'msedge' } : { browserName: 'chromium' }),
        headless: true,
        locale: 'en-US',
        viewport: { width: 1200, height: 800 },
        // WebView2 on Windows, whatever the host: src/lib/platform.ts reads the user agent
        // (shortcut labels, window controls), and the webkit project covers macOS.
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
        baseURL: `http://localhost:${ports.vite}`
      }
    },
    {
      name: 'webkit',
      testDir: './tests/webkit',
      fullyParallel: true,
      use: {
        browserName: 'webkit',
        headless: true,
        locale: 'en-US',
        viewport: { width: 1200, height: 800 },
        // src/lib/platform.ts tells macOS by "Macintosh" in the user agent.
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
        baseURL: `http://localhost:${ports.vite}`
      }
    },
    { name: 'app-build', testDir: './tests/app', testMatch: /build\.setup\.ts/ },
    {
      name: 'app',
      testDir: './tests/app',
      testIgnore: /build\.setup\.ts/,
      dependencies: ['app-build']
    },
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
