import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'updater-artifacts.mjs')
const BASE = 'https://github.com/racode246/leafbound/releases/download/v1.2.3'

let dir: string

function run(...args: string[]): { status: number; stderr: string } {
  try {
    execFileSync('node', [SCRIPT, ...args], { cwd: dir, stdio: 'pipe' })
    return { status: 0, stderr: '' }
  } catch (err) {
    const e = err as { status: number; stderr: Buffer }
    return { status: e.status, stderr: e.stderr.toString() }
  }
}

function makeManifest(platform: string, file: string, out: string) {
  writeFileSync(join(dir, file), 'package')
  writeFileSync(join(dir, `${file}.sig`), `sig of ${file}`)
  const args = ['manifest', '--version', '1.2.3', '--installer', file, '--url', `${BASE}/${file}`]
  if (platform) args.push('--platform', platform)
  return run(...args, '--out', out)
}

const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'updater-artifacts-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('manifest', () => {
  it('defaults to windows-x86_64', () => {
    expect(makeManifest('', 'Leafbound_1.2.3_x64-setup.exe', 'latest.json').status).toBe(0)
    expect(read('latest.json').platforms).toEqual({
      'windows-x86_64': {
        signature: 'sig of Leafbound_1.2.3_x64-setup.exe',
        url: `${BASE}/Leafbound_1.2.3_x64-setup.exe`
      }
    })
  })

  it('writes the given platform', () => {
    const file = 'Leafbound_1.2.3_aarch64.app.tar.gz'
    expect(makeManifest('darwin-aarch64', file, 'latest.json').status).toBe(0)
    expect(Object.keys(read('latest.json').platforms)).toEqual(['darwin-aarch64'])
  })
})

describe('merge', () => {
  beforeEach(() => {
    makeManifest('windows-x86_64', 'Leafbound_1.2.3_x64-setup.exe', 'windows.json')
    makeManifest('darwin-aarch64', 'Leafbound_1.2.3_aarch64.app.tar.gz', 'mac.json')
  })

  it('combines the platforms of several manifests into one', () => {
    expect(run('merge', '--out', 'latest.json', 'windows.json', 'mac.json').status).toBe(0)
    const merged = read('latest.json')
    expect(merged.version).toBe('1.2.3')
    expect(merged.platforms).toEqual({
      ...read('windows.json').platforms,
      ...read('mac.json').platforms
    })
  })

  it('refuses manifests of different versions', () => {
    const other = { ...read('mac.json'), version: '1.2.4' }
    writeFileSync(join(dir, 'mac.json'), JSON.stringify(other))
    const { status, stderr } = run('merge', '--out', 'latest.json', 'windows.json', 'mac.json')
    expect(status).toBe(1)
    expect(stderr).toMatch(/version/)
  })

  it('refuses the same platform twice', () => {
    const { status, stderr } = run('merge', '--out', 'latest.json', 'mac.json', 'mac.json')
    expect(status).toBe(1)
    expect(stderr).toMatch(/darwin-aarch64/)
  })
})
