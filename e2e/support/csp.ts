// Collects Content Security Policy violations in the app window, two ways:
//
// - `securitypolicyviolation` events, through an init script in the main document.
//   Chapter iframes are same-origin but sandboxed without scripts, so the init
//   script does not run in them; the main document hooks each iframe's document
//   instead (catches what happens after the chapter has loaded: theme changes,
//   highlights, selection).
// - Chrome's issue reporting (CDP Audits), which also sees what is blocked while a
//   chapter document is still being parsed, before any listener can be attached.
//   Issues are buffered, so enabling it also reports the ones raised before.
import type { CDPSession, Page } from '@playwright/test'

export interface CspViolation {
  via: 'event' | 'audits'
  frame: 'main' | 'iframe' | 'unknown'
  directive: string
  blockedURI: string
  source?: string
}

declare global {
  interface Window {
    __lbCspViolations?: Omit<CspViolation, 'via'>[]
  }
}

function listen(): void {
  if (window.__lbCspViolations) return
  const found: Omit<CspViolation, 'via'>[] = []
  window.__lbCspViolations = found
  const record = (frame: 'main' | 'iframe') => (e: SecurityPolicyViolationEvent) =>
    found.push({
      frame,
      directive: e.effectiveDirective || e.violatedDirective,
      blockedURI: e.blockedURI,
      source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : e.sample || undefined
    })
  document.addEventListener('securitypolicyviolation', record('main'), true)

  const hooked = new WeakSet<Document>()
  const hook = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument
    if (!doc || hooked.has(doc)) return
    hooked.add(doc)
    doc.addEventListener('securitypolicyviolation', record('iframe'), true)
  }
  const watch = (frame: HTMLIFrameElement) => {
    hook(frame)
    // srcdoc replaces the initial about:blank document once it loads.
    frame.addEventListener('load', () => hook(frame))
  }
  new MutationObserver((records) => {
    for (const r of records)
      for (const node of r.addedNodes) {
        if (node instanceof HTMLIFrameElement) watch(node)
        else if (node instanceof Element) node.querySelectorAll('iframe').forEach(watch)
      }
  }).observe(document, { childList: true, subtree: true })
}

interface AuditsIssue {
  issue: {
    code: string
    details: {
      contentSecurityPolicyIssueDetails?: {
        blockedURL?: string
        violatedDirective: string
        isReportOnly: boolean
        contentSecurityPolicyViolationType: string
        sourceCodeLocation?: { url: string; lineNumber: number }
      }
    }
  }
}

export class CspWatch {
  private readonly audits: CspViolation[] = []

  private constructor(
    readonly page: Page,
    cdp: CDPSession
  ) {
    cdp.on('Audits.issueAdded', ({ issue }: AuditsIssue) => {
      const d = issue.details.contentSecurityPolicyIssueDetails
      if (issue.code !== 'ContentSecurityPolicyIssue' || !d) return
      this.audits.push({
        via: 'audits',
        frame: 'unknown',
        directive: `${d.violatedDirective} (${d.contentSecurityPolicyViolationType})`,
        blockedURI: d.blockedURL ?? '',
        source: d.sourceCodeLocation
          ? `${d.sourceCodeLocation.url}:${d.sourceCodeLocation.lineNumber}`
          : undefined
      })
    })
  }

  /**
   * Starts collecting and reloads the page, so the listener is in place from the
   * first document. The app has already started by then; its issues still come in
   * through Audits.
   */
  static async start(page: Page): Promise<CspWatch> {
    const cdp = await page.context().newCDPSession(page)
    const watch = new CspWatch(page, cdp)
    await cdp.send('Audits.enable')
    await page.addInitScript(listen)
    await page.reload()
    return watch
  }

  async violations(): Promise<CspViolation[]> {
    const events = await this.page.evaluate(() => window.__lbCspViolations ?? [])
    return [...events.map((v) => ({ via: 'event' as const, ...v })), ...this.audits]
  }
}
