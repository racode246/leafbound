// Runs the end-to-end suites:
//
//   npm run e2e            # both
//   npm run e2e -- mock    # browser build + mock backend in headless Edge
//   npm run e2e -- app     # the real app (built with an E2E identifier) over WebView2 CDP
//
// Each run uses its own identifier (dev.leafbound.e2e: data dir, single instance,
// Credential Manager entries) and ports; inside a worktree made by wt-new.ps1 the
// slot number from .wt.json shifts them so worktrees can run E2E at the same time.
// Everything started is stopped and the E2E app data is removed afterwards.
//
// Environment:
//   E2E_SKIP_BUILD=1   reuse src-tauri/target/debug/leafbound.exe from a previous E2E build
//   E2E_MODEL_DIR=dir  embedding model cache (copied in before, filled after a download; used by CI)
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pageTarget, Session, sleep } from './lib/cdp.mjs'
import { startFakeLlm } from './fake-llm.mjs'
import mockSuite from './mock.spec.mjs'
import appSuite from './app.spec.mjs'

const root = resolve(import.meta.dirname, '..')
const mode = process.argv[2] ?? 'all'
if (!['all', 'mock', 'app'].includes(mode)) throw new Error(`unknown suite: ${mode} (use mock, app or all)`)

const wtFile = join(root, '.wt.json')
const slot = existsSync(wtFile) ? JSON.parse(readFileSync(wtFile, 'utf8').replace(/^\uFEFF/, '')).slot : 0
const cfg = {
  identifier: slot ? `dev.leafbound.e2e.wt${slot}` : 'dev.leafbound.e2e',
  vitePort: 1425 + 10 * slot,
  edgePort: 9350 + slot,
  appPort: 9360 + slot,
  llmPort: 18090 + slot,
  outDir: join(root, 'e2e', '.out'),
  work: join(tmpdir(), `leafbound-e2e-${slot}`)
}
const MODEL = 'multilingual-e5-small'
const appData = join(process.env.APPDATA, cfg.identifier)
const localData = join(process.env.LOCALAPPDATA, cfg.identifier)

const results = []
const cleanups = []
const killTree = (pid) => spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })

async function suite(name, fn) {
  console.log(`\n# ${name}`)
  const started = Date.now()
  let session = null
  try {
    session = await fn((s) => (session = s))
  } catch (err) {
    console.log(`  ERROR ${err.message}`)
    session?.failures.push(`error: ${err.message}`)
    if (!session) results.push({ name, passed: 0, failures: [`error: ${err.message}`] })
    await session?.shot(`${name}-error.png`).catch(() => {})
  } finally {
    if (session) {
      for (const e of session.errors) session.failures.push(`page exception: ${e.split('\n')[0]}`)
      results.push({ name, passed: session.passed, failures: session.failures, seconds: Math.round((Date.now() - started) / 1000) })
      session.close()
    }
    while (cleanups.length) await cleanups.pop()()
  }
}

async function waitForHttp(url, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error(`${url} did not come up`)
}

function edgePath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Microsoft Edge not found')
  return found
}

async function runMock(track) {
  const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(cfg.vitePort), '--strictPort'], {
    cwd: root,
    stdio: 'ignore'
  })
  cleanups.push(async () => killTree(vite.pid))
  const baseUrl = `http://localhost:${cfg.vitePort}`
  await waitForHttp(baseUrl)

  const profile = join(cfg.work, 'edge-profile')
  rmSync(profile, { recursive: true, force: true })
  const edge = spawn(edgePath(), [
    '--headless=new', `--remote-debugging-port=${cfg.edgePort}`, `--user-data-dir=${profile}`,
    '--lang=en-US', '--accept-lang=en-US', '--window-size=1200,800', 'about:blank'
  ], { stdio: 'ignore' })
  cleanups.push(async () => {
    killTree(edge.pid)
    await sleep(500)
    rmSync(profile, { recursive: true, force: true })
  })
  const s = track(await Session.connect(await pageTarget(cfg.edgePort), { outDir: cfg.outDir, name: 'mock' }))
  await mockSuite(s, { baseUrl })
  return s
}

function removeAppData() {
  for (const dir of [appData, localData]) {
    for (let i = 0; i < 10 && existsSync(dir); i++) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500'])
      }
    }
  }
}

/** Credential Manager entries of the installed app; the run must not change them. */
const appCredentials = () =>
  execFileSync('cmdkey', ['/list'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((l) => /llm-api-key:[a-z]+\.dev\.leafbound\.app\b/.test(l))
    .map((l) => l.trim())
    .sort()

async function runApp(track) {
  const exe = join(root, 'src-tauri', 'target', 'debug', 'leafbound.exe')
  if (process.env.E2E_SKIP_BUILD !== '1') {
    mkdirSync(cfg.work, { recursive: true })
    const config = join(cfg.work, 'tauri.e2e.json')
    writeFileSync(config, JSON.stringify({ identifier: cfg.identifier }))
    console.log(`  building the app (debug, identifier ${cfg.identifier})…`)
    const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
    const build = spawnSync(process.execPath, [cli, 'build', '--debug', '--no-bundle', '--config', config], { cwd: root, stdio: 'inherit' })
    if (build.status !== 0) throw new Error('tauri build failed')
  }
  // Run a copy so a parallel `tauri dev` rebuild cannot replace the exe under the test.
  mkdirSync(cfg.work, { recursive: true })
  const runExe = join(cfg.work, 'leafbound-e2e.exe')
  cpSync(exe, runExe)

  removeAppData()
  const modelSource = [process.env.E2E_MODEL_DIR, join(process.env.APPDATA, 'dev.leafbound.app', 'models', MODEL)]
    .find((dir) => dir && existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.onnx')))
  if (modelSource) cpSync(modelSource, join(appData, 'models', MODEL), { recursive: true })

  const credentialsBefore = appCredentials()
  const llm = await startFakeLlm(cfg.llmPort)
  cleanups.push(() => llm.close())

  // The app's own output (Rust eprintln!, panics) goes to e2e/.out/app.log for CI artifacts.
  mkdirSync(cfg.outDir, { recursive: true })
  const appLog = createWriteStream(join(cfg.outDir, 'app.log'))
  const app = spawn(runExe, [join(root, 'e2e', 'fixtures', 'assistant-test.epub')], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cfg.appPort}`, RUST_BACKTRACE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  app.stdout.pipe(appLog)
  app.stderr.pipe(appLog)
  let appExit = null
  app.on('exit', (code, signal) => (appExit = `exited with ${code ?? signal}`))
  cleanups.push(async () => {
    killTree(app.pid)
    await sleep(1000)
    const downloaded = join(appData, 'models', MODEL)
    const cache = process.env.E2E_MODEL_DIR
    if (cache && existsSync(downloaded) && !(existsSync(cache) && readdirSync(cache).some((f) => f.endsWith('.onnx')))) {
      cpSync(downloaded, cache, { recursive: true })
    }
    removeAppData()
    rmSync(runExe, { force: true })
  })

  let target
  try {
    target = await pageTarget(cfg.appPort, { timeout: 120000, match: (t) => !t.url.startsWith('devtools') })
  } catch (err) {
    // Say why: did the app die, is the CDP endpoint up, what targets exist?
    let endpoint = 'CDP endpoint not reachable'
    try {
      const version = await (await fetch(`http://127.0.0.1:${cfg.appPort}/json/version`)).json()
      const targets = await (await fetch(`http://127.0.0.1:${cfg.appPort}/json`)).json()
      endpoint = `CDP up (${version.Browser}); targets: ${JSON.stringify(targets.map((t) => [t.type, t.url]))}`
    } catch {
      // keep the default message
    }
    throw new Error(`${err.message}; app ${appExit ?? 'still running'}; ${endpoint}; see e2e/.out/app.log`)
  }
  const s = track(await Session.connect(target, { outDir: cfg.outDir, name: 'app' }))
  await appSuite(s, { llm })
  s.check(JSON.stringify(appCredentials()) === JSON.stringify(credentialsBefore), "the installed app's Credential Manager entries are untouched")
  return s
}

console.log(`E2E (${mode}) — slot ${slot}, identifier ${cfg.identifier}, screenshots in e2e/.out/`)
rmSync(cfg.outDir, { recursive: true, force: true })
if (mode !== 'app') await suite('mock', runMock)
if (mode !== 'mock') await suite('app', runApp)

console.log('\n# summary')
let failed = 0
for (const r of results) {
  failed += r.failures.length
  console.log(`  ${r.name}: ${r.passed} passed, ${r.failures.length} failed${r.seconds ? ` (${r.seconds}s)` : ''}`)
  for (const f of r.failures) console.log(`    - ${f}`)
}
process.exit(failed ? 1 : 0)
