// Updater artifacts for the release workflow (.github/workflows/release.yml).
//
//   node scripts/updater-artifacts.mjs manifest --version X.Y.Z --installer <setup.exe> \
//     --url <download URL of the installer> [--changelog CHANGELOG.md] --out <latest.json>
//   node scripts/updater-artifacts.mjs verify --manifest <latest.json> --dir <folder> \
//     --version X.Y.Z --url <download URL of the installer> [--pubkey <base64>]
//
// `manifest` writes the static JSON read by tauri-plugin-updater, with the signature
// taken verbatim from `<installer>.sig` (written by `tauri build` when
// bundle.createUpdaterArtifacts is on).
//
// `verify` checks latest.json against the files in <folder> and verifies the minisign
// signature the way the updater does (minisign-verify: Ed25519 over the BLAKE2b-512 of
// the file, plus the global signature over the trusted comment). The public key comes
// from --pubkey or UPDATER_PUBKEY; when src-tauri/tauri.conf.json has
// plugins.updater.pubkey it must be the same key.
// No dependencies: runs right after `npm ci` or with plain Node.

import { createHash, createPublicKey, verify as edVerify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const PLATFORM = 'windows-x86_64'

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function required(values, ...names) {
  for (const name of names) if (!values[name]) fail(`--${name} is required`)
}

// The release-please section for `version`, without its heading and the commit/PR links.
function changelogNotes(path, version) {
  const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^##? \[?v?([^\]\s]+)/.exec(l)?.[1] === version)
  if (start < 0) return ''
  let end = lines.findIndex((l, i) => i > start && /^##? /.test(l))
  if (end < 0) end = lines.length
  return lines
    .slice(start + 1, end)
    .join('\n')
    .replace(/ \(\[[^\]]+\]\([^)]+\)(, \[[^\]]+\]\([^)]+\))*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function manifest(values) {
  required(values, 'version', 'installer', 'url', 'out')
  const signature = readFileSync(`${values.installer}.sig`, 'utf8')
  if (basename(new URL(values.url).pathname) !== basename(values.installer)) {
    fail(`URL ${values.url} does not end with ${basename(values.installer)}`)
  }
  const json = {
    version: values.version,
    notes: values.changelog ? changelogNotes(values.changelog, values.version) : '',
    pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: { [PLATFORM]: { signature, url: values.url } }
  }
  writeFileSync(values.out, `${JSON.stringify(json, null, 2)}\n`)
  console.log(readFileSync(values.out, 'utf8'))
}

// Tauri's keys and signatures are base64 of the minisign text files.
function minisignLines(b64) {
  return Buffer.from(b64.trim(), 'base64')
    .toString('utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '')
}

const keyIdHex = (bytes) => Buffer.from(bytes).reverse().toString('hex').toUpperCase()

function edKey(raw) {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw).toString('base64url') },
    format: 'jwk'
  })
}

function decodePublicKey(b64) {
  const lines = minisignLines(b64)
  const raw = Buffer.from(lines[lines.length - 1], 'base64')
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== 'Ed') fail('not a minisign public key')
  return { keyId: raw.subarray(2, 10), key: edKey(raw.subarray(10)) }
}

// Returns the trusted comment on success; exits on any mismatch.
function verifySignature(file, sigB64, pubB64) {
  const pub = decodePublicKey(pubB64)
  const lines = minisignLines(sigB64)
  if (lines.length !== 4 || !lines[0].startsWith('untrusted comment:')) {
    fail('malformed signature')
  }
  const sig = Buffer.from(lines[1], 'base64')
  const trusted = lines[2].replace(/^trusted comment: /, '')
  const globalSig = Buffer.from(lines[3], 'base64')
  if (sig.length !== 74 || globalSig.length !== 64) fail('malformed signature')
  const alg = sig.subarray(0, 2).toString()
  if (!sig.subarray(2, 10).equals(pub.keyId)) {
    fail(
      `signed with key ${keyIdHex(sig.subarray(2, 10))}, expected ${keyIdHex(pub.keyId)} (wrong signing key?)`
    )
  }
  const data = readFileSync(file)
  const message =
    alg === 'ED' ? createHash('blake2b512').update(data).digest() : alg === 'Ed' ? data : null
  if (!message) fail(`unknown signature algorithm ${alg}`)
  const sig64 = sig.subarray(10)
  if (!edVerify(null, message, pub.key, sig64)) fail(`signature does not match ${file}`)
  if (!edVerify(null, Buffer.concat([sig64, Buffer.from(trusted)]), pub.key, globalSig)) {
    fail('global signature (trusted comment) does not verify')
  }
  return { keyId: keyIdHex(pub.keyId), trusted }
}

function configuredPubkey() {
  try {
    const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
    return conf.plugins?.updater?.pubkey
  } catch {
    return undefined
  }
}

function verifyManifest(values) {
  required(values, 'manifest', 'dir', 'version', 'url')
  const pubkey = values.pubkey || process.env.UPDATER_PUBKEY
  if (!pubkey) fail('no public key (--pubkey or UPDATER_PUBKEY)')
  const configured = configuredPubkey()
  if (configured && configured.trim() !== pubkey.trim()) {
    fail('the public key differs from plugins.updater.pubkey in src-tauri/tauri.conf.json')
  }

  const json = JSON.parse(readFileSync(values.manifest, 'utf8'))
  if (json.version !== values.version) fail(`version ${json.version}, expected ${values.version}`)
  if (Number.isNaN(Date.parse(json.pub_date))) fail(`bad pub_date ${json.pub_date}`)
  if (typeof json.notes !== 'string') fail('notes is not a string')
  const entry = json.platforms?.[PLATFORM]
  if (!entry) fail(`no platforms["${PLATFORM}"]`)
  if (entry.url !== values.url) fail(`url ${entry.url}, expected ${values.url}`)

  const installer = join(values.dir, basename(new URL(entry.url).pathname))
  const sigFile = readFileSync(`${installer}.sig`, 'utf8')
  if (entry.signature !== sigFile) fail(`signature differs from ${installer}.sig`)
  const { keyId, trusted } = verifySignature(installer, entry.signature, pubkey)
  console.log(`ok: ${basename(installer)} verifies with key ${keyId} (${trusted})`)
}

const [command, ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    version: { type: 'string' },
    installer: { type: 'string' },
    url: { type: 'string' },
    changelog: { type: 'string' },
    out: { type: 'string' },
    manifest: { type: 'string' },
    dir: { type: 'string' },
    pubkey: { type: 'string' }
  }
})
if (command === 'manifest') manifest(values)
else if (command === 'verify') verifyManifest(values)
else fail('usage: updater-artifacts.mjs manifest|verify [options]')
