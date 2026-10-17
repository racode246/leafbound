// Playwright fixture for the real app: seeds a fresh data directory, launches the
// E2E build (see tests/app/build.setup.ts), connects over WebView2's CDP and tears
// everything down afterwards. One app per slot, so the app project runs with
// --workers=1 (the identifier is compiled in; a second instance would be handed
// to the first by the single-instance plugin).
import { chromium, expect, test as base, type Browser, type Page } from '@playwright/test'
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appExe, fixtures, ports } from './env.ts'
import { startFakeLlm, type FakeLlm } from './fake-llm.ts'
import { startFakeUpdates, type FakeUpdates, type UpdateMode } from './fake-updates.ts'
import { keepDownloadedModel, removeAppData, seed, type Seed } from './seed.ts'

export const TEST_BOOK = join(fixtures, 'assistant-test.epub')

export interface App {
  page: Page
  llm: FakeLlm
  /** The update server the build checks (the `updateMode` option picks its answers). */
  updates: FakeUpdates
  /** What the app has written to stdout/stderr so far (app.log). */
  log(): string
  /** Calls a Tauri command from the page. */
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>
  /**
   * Quits and starts the app again on the same data (persistence checks).
   * `whileStopped` runs in between, e.g. to change files in the data directory.
   */
  relaunch(whileStopped?: () => void): Promise<void>
}

export interface AppOptions {
  seedOptions: Pick<Seed, 'language' | 'model'>
  /** Files passed on the command line (like "Open with"). */
  openFiles: string[]
  updateMode: UpdateMode
}

/** Credential Manager entries of the installed app; E2E runs must not change them. */
function installedAppCredentials(): string[] {
  return execFileSync('cmdkey', ['/list'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((l) => /llm-api-key:[a-z]+\.dev\.leafbound\.app\b/.test(l))
    .map((l) => l.trim())
    .sort()
}

const killTree = (proc: ChildProcess | null) => {
  if (proc?.pid) spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
}

async function waitForCdp(proc: ChildProcess, timeout = 120_000): Promise<void> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (proc.exitCode !== null)
      throw new Error(`the app exited with code ${proc.exitCode} before CDP came up (see app.log)`)
    try {
      const res = await fetch(`http://127.0.0.1:${ports.app}/json/version`)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `no CDP endpoint on port ${ports.app} after ${timeout / 1000}s; the app is still running (see app.log)`
  )
}

async function appPage(browser: Browser): Promise<Page> {
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith('http://tauri.localhost'))
    if (page) return page
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('the app window never loaded http://tauri.localhost')
}

export const test = base.extend<AppOptions & { app: App }>({
  seedOptions: [{ language: 'en', model: false }, { option: true }],
  openFiles: [[TEST_BOOK], { option: true }],
  updateMode: ['none', { option: true }],

  app: async ({ seedOptions, openFiles, updateMode }, use, testInfo) => {
    if (testInfo.parallelIndex > 0)
      throw new Error('run the app project with --workers=1 (npm run e2e:app)')
    if (!existsSync(appExe))
      throw new Error(`no E2E build at ${appExe}; run the app-build project first`)

    // Every first launch makes the automatic update check against this server.
    const updates = await startFakeUpdates(updateMode)
    const llm = await startFakeLlm()
    seed({ ...seedOptions, llmUrl: llm.url })
    const credentialsBefore = installedAppCredentials()
    const log = createWriteStream(testInfo.outputPath('app.log'))

    let proc: ChildProcess | null = null
    let browser: Browser | null = null
    const launch = async (files: string[]) => {
      proc = spawn(appExe, files, {
        env: { ...process.env, RUST_BACKTRACE: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      proc.stdout?.pipe(log, { end: false })
      proc.stderr?.pipe(log, { end: false })
      await waitForCdp(proc)
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${ports.app}`)
      return appPage(browser)
    }
    const quit = async () => {
      await browser?.close().catch(() => {})
      killTree(proc)
      browser = null
      proc = null
      await new Promise((r) => setTimeout(r, 500))
    }

    const app: App = {
      page: await launch(openFiles),
      llm,
      updates,
      log: () => readFileSync(testInfo.outputPath('app.log'), 'utf8'),
      invoke: (cmd, args = {}) =>
        app.page.evaluate(
          ([c, a]) =>
            (
              window as unknown as {
                __TAURI_INTERNALS__: { invoke(c: string, a: unknown): Promise<never> }
              }
            ).__TAURI_INTERNALS__.invoke(c, a),
          [cmd, args] as const
        ),
      relaunch: async (whileStopped) => {
        await quit()
        whileStopped?.()
        app.page = await launch([])
      }
    }

    try {
      await use(app)
    } finally {
      await quit()
      log.end()
      await testInfo.attach('app.log', { path: testInfo.outputPath('app.log') }).catch(() => {})
      await llm.close()
      await updates.close()
      keepDownloadedModel()
      removeAppData()
    }
    expect(
      installedAppCredentials(),
      "the installed app's Credential Manager entries are untouched"
    ).toEqual(credentialsBefore)
  }
})

export { expect }
