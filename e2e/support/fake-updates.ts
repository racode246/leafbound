// Update server for the app project, on the port the E2E build is configured with
// (tests/app/build.setup.ts sets plugins.updater: this endpoint, http allowed, and the
// public key in fixtures/updater/test-key.pub instead of the release key).
//
//   none      latest.json answers 204 No Content: no update
//   tampered  announces 99.0.0, but the download is not the file that was signed
//   down      nothing listens on the port
//
// The payload is a text file signed with the throwaway test key (`tauri signer sign
// --app-version 99.0.0`; the private key was not kept). Only failing installs are served:
// the app must never get as far as running what it downloaded.
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { fixtures, ports } from './env.ts'

export type UpdateMode = 'none' | 'tampered' | 'down'

export const TEST_UPDATE_VERSION = '99.0.0'
export const TEST_UPDATE_NOTES =
  '## [99.0.0](https://github.com/racode246/leafbound/compare/v0.2.0...v99.0.0)\n\n### Features\n\n* **e2e:** a test release ([#19](https://github.com/racode246/leafbound/issues/19))'

const dir = join(fixtures, 'updater')
export const testPublicKey = () => readFileSync(join(dir, 'test-key.pub'), 'utf8').trim()

export interface FakeUpdates {
  /** Request paths in order. */
  requests: string[]
  close(): Promise<void>
}

export async function startFakeUpdates(mode: UpdateMode): Promise<FakeUpdates> {
  const requests: string[] = []
  if (mode === 'down') return { requests, close: async () => {} }

  const base = `http://127.0.0.1:${ports.updates}`
  const installer = `Leafbound_${TEST_UPDATE_VERSION}_x64-setup.exe`
  const signature = readFileSync(join(dir, 'payload.bin.sig'), 'utf8').trim()
  const payload = readFileSync(join(dir, 'payload.bin'))
  const tampered = Buffer.concat([payload, Buffer.from('tampered\n')])
  const platform = { signature, url: `${base}/${installer}` }

  const server: Server = createServer((req, res) => {
    const path = req.url ?? ''
    requests.push(path)
    if (path === '/latest.json') {
      if (mode === 'none') {
        res.writeHead(204).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          version: TEST_UPDATE_VERSION,
          notes: TEST_UPDATE_NOTES,
          pub_date: '2026-10-18T00:00:00Z',
          platforms: { 'windows-x86_64': platform, 'windows-x86_64-nsis': platform }
        })
      )
      return
    }
    if (path === `/${installer}`) {
      res
        .writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': tampered.length
        })
        .end(tampered)
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(ports.updates, '127.0.0.1', resolve)
  })
  return {
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}
