// Where an E2E run lives: identifier, ports and folders. Inside a worktree made by
// .claude/scripts/wt-new.ps1, the slot number in .wt.json shifts all of them so
// worktrees can run the suites at the same time.
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const root = resolve(import.meta.dirname, '..', '..')

const wtFile = join(root, '.wt.json')
export const slot: number = existsSync(wtFile)
  ? JSON.parse(readFileSync(wtFile, 'utf8').replace(/^﻿/, '')).slot
  : 0

/** Baked into the E2E build (tauri.conf.json is compiled in), hence one app per slot. */
export const identifier = slot ? `dev.leafbound.e2e.wt${slot}` : 'dev.leafbound.e2e'

export const ports = {
  /** Vite dev server for the mock project. */
  vite: 1425 + 10 * slot,
  /** WebView2 remote debugging port of the E2E app. */
  app: 9360 + slot
}

/** Outside the repository so a running `tauri dev` (Vite watcher) never sees it. */
export const workDir = join(tmpdir(), `leafbound-e2e-${slot}`)
export const appExe = join(workDir, 'leafbound-e2e.exe')

export const appData = join(process.env.APPDATA ?? '', identifier)
export const localAppData = join(process.env.LOCALAPPDATA ?? '', identifier)

export const MODEL_DIR_NAME = 'multilingual-e5-small'

/** The arguments wry passes by default; setting additionalBrowserArgs replaces them. */
export const WRY_DEFAULT_ARGS = '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection'

export const fixtures = join(root, 'e2e', 'fixtures')
