// The Content Security Policy from tauri.conf.json (embedded in this build) lets the
// whole app work: no violation while going through the library, the reader in both
// flows, display settings, search, highlights and Ask AI. The book has a cover and
// the publisher resources epub.js turns into blob:/data: URLs and inline styles
// (scripts/make_e2e_epub.py). At the end the check proves it would have seen a
// violation, in the window and in a chapter.
import type { Page } from '@playwright/test'
import { join } from 'node:path'
import { expect, TEST_BOOK, test } from '../../support/app.ts'
import { CspWatch } from '../../support/csp.ts'
import { fixtures } from '../../support/env.ts'
import { Assistant, Library } from '../../support/pages.ts'

const BOOK = 'Lantern Street'

test.use({
  seedOptions: { language: 'en', model: true },
  openFiles: [join(fixtures, 'cover-test.epub'), TEST_BOOK]
})

/** Resources that load: soft, so a blocked one still reaches the violation report. */
const loads = expect.configure({ soft: true, timeout: 5_000 })

/** Width of a loaded image, 0 while it is loading or if it was blocked. */
const loadedWidth = (img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)

test('runs the library, reader and Ask AI without CSP violations', async ({ app }, testInfo) => {
  const { page } = app
  const library = new Library(page)
  // Both books are imported before the reload that installs the listener.
  await expect(library.card(BOOK)).toBeVisible()
  await expect(library.card('古本屋のミケ')).toBeVisible()
  const csp = await CspWatch.start(page)
  try {
    await goThroughTheApp(page)
  } finally {
    // Also when a step fails: a blocked resource usually breaks a later step first.
    await testInfo.attach('csp-violations.json', {
      body: JSON.stringify(await csp.violations(), null, 2),
      contentType: 'application/json'
    })
  }
  const violations = await csp.violations()
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([])

  // The check works: blocked loads are reported from the window, from a chapter
  // document after it loaded, and from a sandboxed srcdoc frame while it parses.
  await page.evaluate(() => {
    const img = document.createElement('img')
    img.src = 'https://csp-probe.invalid/window.png'
    document.body.append(img)
    const chapter = document.querySelector<HTMLIFrameElement>('.reader-view iframe')
    const doc = chapter?.contentDocument
    if (!doc) throw new Error('no chapter document')
    const inChapter = doc.createElement('img')
    inChapter.src = 'https://csp-probe.invalid/chapter.png'
    doc.body.append(inChapter)
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.srcdoc = '<img src="https://csp-probe.invalid/srcdoc.png">'
    document.body.append(frame)
  })
  const seen = async () =>
    (await csp.violations()).map((v) => `${v.via} ${v.frame} ${v.blockedURI}`).sort()
  await expect
    .poll(seen)
    .toEqual(
      expect.arrayContaining([
        'event main https://csp-probe.invalid/window.png',
        'event iframe https://csp-probe.invalid/chapter.png',
        'audits unknown https://csp-probe.invalid/window.png',
        'audits unknown https://csp-probe.invalid/chapter.png',
        'audits unknown https://csp-probe.invalid/srcdoc.png'
      ])
    )
})

async function goThroughTheApp(page: Page): Promise<void> {
  const library = new Library(page)

  // Library: the cover comes through the lbcover protocol.
  const cover = library.card(BOOK).locator('img.cover')
  await expect(cover).toHaveAttribute('src', /^http:\/\/lbcover\.localhost\//)
  await loads.poll(() => cover.evaluate(loadedWidth)).toBeGreaterThan(0)

  // Paged: the cover page shows the EPUB image as a blob: URL.
  const reader = await library.open(BOOK)
  const coverPage = reader.content.locator('img')
  await expect(coverPage).toHaveAttribute('src', /^blob:/)
  await loads.poll(() => coverPage.evaluate(loadedWidth)).toBeGreaterThan(0)

  // A chapter with a linked stylesheet (blob:, with a url() image), <style>,
  // style attributes and a data: image.
  await reader.openChapter('Chapter 1 The Lamplighter')
  await loads
    .poll(() =>
      reader.content.locator('h1.ornament').evaluate((h) => getComputedStyle(h).backgroundImage)
    )
    .toMatch(/^url\("blob:/)
  await loads.poll(() => reader.content.locator('img.dot').evaluate(loadedWidth)).toBeGreaterThan(0)

  await reader.highlightWithNote('Every evening', 'lamps at dusk')
  await expect(reader.barButton(/^Highlights/)).toContainText('1')

  const hits = await reader.search('caraway')
  await hits.first().click()
  await expect(reader.chapter).toContainText('Chapter 3')

  // Display: colors, a system font, size, then the scrolled flow (new rendition).
  const display = await reader.display()
  await display.getByRole('button', { name: 'Sepia', exact: true }).click()
  await display.getByRole('button', { name: 'Dark', exact: true }).click()
  await reader.setFont('游明朝 / Yu Mincho')
  await display.getByRole('button', { name: 'Larger', exact: true }).click()
  await expect(
    reader.content.locator('body').evaluate((b) => getComputedStyle(b).fontFamily)
  ).resolves.toContain('Yu Mincho')
  await display.getByRole('button', { name: 'Scroll (vertical)', exact: true }).click()
  await reader.waitUntilShown()
  // Reopened at chapter 3 (the last); scrolling up renders the previous ones as more iframes.
  await page.locator('.reader-view .epub-container').evaluate((el) => {
    el.scrollTop = 0
  })
  await expect.poll(() => page.locator('.reader-view iframe').count()).toBeGreaterThan(1)

  const ai = new Assistant(page)
  await ai.open()
  await ai.waitUntilReady()
  await ai.ask('What does the bakery sell?')
  await expect(ai.turns.last().locator('.ai-cite').first()).toBeVisible()
}
