// Minimal Chrome DevTools Protocol client for the E2E suites: connects to a
// page target (WebView2 or headless Edge) and offers the few helpers the
// specs need. Failures are collected by `check` so a run reports every
// broken expectation, not just the first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Waits for a CDP endpoint and returns the first page target's WebSocket URL. */
export async function pageTarget(port, { timeout = 60000, match = () => true } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = targets.find((t) => t.type === 'page' && match(t))
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error(`no CDP page target on port ${port}`)
}

export class Session {
  /** @param {string} url WebSocket debugger URL @param {{ outDir: string, name: string }} opts */
  static async connect(url, opts) {
    const s = new Session(url, opts)
    await new Promise((resolve, reject) => {
      s.ws.addEventListener('open', resolve)
      s.ws.addEventListener('error', reject)
    })
    await s.send('Runtime.enable')
    await s.send('Page.enable')
    return s
  }

  constructor(url, { outDir, name }) {
    this.ws = new WebSocket(url)
    this.outDir = outDir
    this.name = name
    this.id = 0
    this.pending = new Map()
    this.failures = []
    this.passed = 0
    this.errors = []
    this.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg)
        this.pending.delete(msg.id)
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.errors.push(d.exception?.description ?? d.text)
      }
    })
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id
      this.pending.set(id, resolve)
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Evaluates an expression (awaited, returned by value). Throws on page errors. */
  async ev(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (res.result?.exceptionDetails) {
      const d = res.result.exceptionDetails
      throw new Error(d.exception?.description ?? JSON.stringify(d).slice(0, 400))
    }
    return res.result?.result?.value
  }

  async waitFor(expr, timeout = 30000) {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      if (await this.ev(expr)) return
      await sleep(150)
    }
    throw new Error(`timeout waiting for: ${expr}`)
  }

  check(ok, label) {
    if (ok) this.passed += 1
    else this.failures.push(label)
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  }

  async shot(file) {
    mkdirSync(this.outDir, { recursive: true })
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(this.outDir, file), Buffer.from(res.result.data, 'base64'))
  }

  /** Clicks the first element matching `selector` whose trimmed text is `text`. */
  clickText(selector, text) {
    return this.ev(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)})
      if (!el) throw new Error('no ' + ${JSON.stringify(selector)} + ' with text ' + ${JSON.stringify(text)})
      el.click()
    })()`)
  }

  /** Sets a React-controlled input/textarea value and fires `input`. */
  type(selector, value) {
    return this.ev(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
  }

  close() {
    this.ws.close()
  }
}
