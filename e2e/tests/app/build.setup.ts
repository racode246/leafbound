// Builds the app once for the app project: debug profile, frontend embedded, the
// slot's identifier, and WebView2's remote debugging port in the window's browser
// arguments (set in config rather than WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS).
// Headless by default: the window is never shown. `--headed` builds a visible one.
// E2E_SKIP_BUILD=1 reuses the previous build if it was made in the same mode.
import { test as setup } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appExe, identifier, ports, root, workDir, WRY_DEFAULT_ARGS } from '../../support/env.ts'
import { testPublicKey } from '../../support/fake-updates.ts'

setup('build the E2E app', async ({ headless }) => {
  setup.setTimeout(30 * 60_000)
  const mode = join(workDir, 'build-mode.json')
  const built = existsSync(mode) ? JSON.parse(readFileSync(mode, 'utf8')) : null
  if (process.env.E2E_SKIP_BUILD === '1' && existsSync(appExe) && built?.headless === headless)
    return

  // `--config` is merged as a JSON merge patch: arrays are replaced, so the window
  // list is copied whole with the browser arguments (and visibility) changed.
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const windows = conf.app.windows.map((w: Record<string, unknown>) => ({
    ...w,
    additionalBrowserArgs: `${WRY_DEFAULT_ARGS} --remote-debugging-port=${ports.app}`,
    // The page keeps rendering (requestAnimationFrame, screenshots) in a hidden window.
    ...(headless ? { visible: false, skipTaskbar: true } : {})
  }))
  mkdirSync(workDir, { recursive: true })
  const config = join(workDir, 'tauri.e2e.json')
  // Updates come from the fake server (support/fake-updates.ts), over http, signed with
  // the test key rather than the release key.
  const updater = {
    endpoints: [`http://127.0.0.1:${ports.updates}/latest.json`],
    pubkey: testPublicKey(),
    dangerousInsecureTransportProtocol: true
  }
  writeFileSync(config, JSON.stringify({ identifier, app: { windows }, plugins: { updater } }))

  const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const build = spawnSync(
    process.execPath,
    [cli, 'build', '--debug', '--no-bundle', '--config', config],
    {
      cwd: root,
      stdio: 'inherit'
    }
  )
  if (build.status !== 0) throw new Error('tauri build failed')
  // Run a copy so a parallel `tauri dev` rebuild cannot replace the exe under the tests.
  copyFileSync(join(root, 'src-tauri', 'target', 'debug', 'leafbound.exe'), appExe)
  writeFileSync(mode, JSON.stringify({ headless }))
})
