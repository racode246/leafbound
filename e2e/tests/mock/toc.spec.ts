import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library, type Reader } from '../../support/pages.ts'

// Forty short chapters "Chapter 01" … "Chapter 40" (scripts/make_e2e_epub.py).
const LONG = { path: join(fixtures, 'long-contents.epub'), title: 'long-contents' }

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

async function openLongBook(page: Page): Promise<Reader> {
  const library = new Library(page)
  await library.add(LONG.path, LONG.title)
  return library.open(LONG.title)
}

async function expectCurrent(reader: Reader, title: string): Promise<void> {
  await expect(reader.currentTocEntries).toHaveCount(1)
  await expect(reader.currentTocEntries).toHaveText(title)
}

test('the Contents panel marks the chapter being read in bold', async ({ page }) => {
  const reader = await openLongBook(page)
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  await reader.openChapter('Chapter 05')
  const before = await reader.pageNumber()
  await page.keyboard.press('ArrowRight')
  // Read on: the page changes but the chapter does not.
  await expect.poll(() => reader.pageNumber()).toBeGreaterThan(before)
  await expect(reader.chapter).toContainText('Chapter 05')

  await reader.showToc()
  await expectCurrent(reader, 'Chapter 05')
  const weight = await reader.currentTocEntries.evaluate((el) => getComputedStyle(el).fontWeight)
  expect(Number(weight)).toBeGreaterThanOrEqual(600)
  await expect(reader.tocEntry('Chapter 04')).not.toHaveAttribute('aria-current')
})

test('the Contents panel scrolls to the current chapter without moving the page sideways', async ({
  page
}) => {
  const reader = await openLongBook(page)
  await reader.openChapter('Chapter 38')

  const toc = await reader.showToc()
  await expectCurrent(reader, 'Chapter 38')
  const m = await toc.evaluate((panel) => {
    const item = panel.querySelector('[aria-current="location"]')
    const head = panel.querySelector('.panel-head')
    if (!item || !head) throw new Error('no current entry or panel header')
    const box = panel.getBoundingClientRect()
    const r = item.getBoundingClientRect()
    return {
      scrolls: panel.scrollHeight > panel.clientHeight,
      top: r.top,
      bottom: r.bottom,
      visibleTop: head.getBoundingClientRect().bottom,
      visibleBottom: box.top + panel.clientHeight,
      scrollLeft: document.scrollingElement?.scrollLeft
    }
  })
  expect(m.scrolls).toBe(true)
  expect(m.top).toBeGreaterThanOrEqual(m.visibleTop)
  expect(m.bottom).toBeLessThanOrEqual(m.visibleBottom)
  expect(m.scrollLeft).toBe(0)
})

test('the mark follows the reader into the next chapter while the panel is open', async ({
  page
}) => {
  const reader = await openLongBook(page)
  await reader.openChapter('Chapter 10')
  await reader.showToc()
  await expectCurrent(reader, 'Chapter 10')

  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(reader.chapter).toContainText('Chapter 11', { timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
  await expect(reader.toc).toBeVisible()
  await expectCurrent(reader, 'Chapter 11')
})

test('an entry for an anchor inside a chapter is marked, not the chapter', async ({ page }) => {
  // The sample's 第二章 has a nested entry for ch2.xhtml#sec near its end.
  const reader = await new Library(page).open('Leafbound サンプル')
  await reader.openChapter('二の一 見返し')
  await reader.showToc()
  await expectCurrent(reader, '二の一 見返し')
})
