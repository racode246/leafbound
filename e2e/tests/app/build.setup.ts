// Builds the app once for the app project: debug profile, frontend embedded, the
// slot's identifier, and WebView2's remote debugging port in the window's browser
// arguments (set in config rather than WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS).
// E2E_SKIP_BUILD=1 reuses the previous build.
import { test as setup } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appExe, identifier, ports, root, workDir, WRY_DEFAULT_ARGS } from '../../support/env.ts'

setup('build the E2E app', async () => {
  setup.setTimeout(30 * 60_000)
  if (process.env.E2E_SKIP_BUILD === '1' && existsSync(appExe)) return

  // `--config` is merged as a JSON merge patch: arrays are replaced, so the window
  // list is copied whole and only the browser arguments are added.
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const windows = conf.app.windows.map((w: Record<string, unknown>) => ({
    ...w,
    additionalBrowserArgs: `${WRY_DEFAULT_ARGS} --remote-debugging-port=${ports.app}`
  }))
  mkdirSync(workDir, { recursive: true })
  const config = join(workDir, 'tauri.e2e.json')
  writeFileSync(config, JSON.stringify({ identifier, app: { windows } }))

  const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const build = spawnSync(process.execPath, [cli, 'build', '--debug', '--no-bundle', '--config', config], {
    cwd: root,
    stdio: 'inherit'
  })
  if (build.status !== 0) throw new Error('tauri build failed')
  // Run a copy so a parallel `tauri dev` rebuild cannot replace the exe under the tests.
  copyFileSync(join(root, 'src-tauri', 'target', 'debug', 'leafbound.exe'), appExe)
})
