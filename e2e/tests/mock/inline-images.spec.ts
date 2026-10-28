import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library, type Reader } from '../../support/pages.ts'

// A 525x367 formula inside a sentence (sized in px by the CSS, as calibre does), a 12x12
// gaiji-like image in a sentence, and a 320x200 figure alone in its paragraph
// (scripts/make_e2e_epub.py).
const BOOK = { path: join(fixtures, 'inline-images.epub'), title: 'inline-images' }

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

async function openBook(page: Page): Promise<Reader> {
  const library = new Library(page)
  await library.add(BOOK.path, BOOK.title)
  return library.open(BOOK.title)
}

/** Rendered height of the image in the paragraph with this id, and the paragraph's font size. */
async function measure(reader: Reader, id: string): Promise<{ height: number; fontSize: number }> {
  const img = reader.content.locator(`#${id} img`)
  await expect(img).toBeVisible()
  return img.evaluate(async (el: HTMLImageElement) => {
    await el.decode()
    const p = el.parentElement as HTMLElement
    return {
      height: el.getBoundingClientRect().height,
      fontSize: Number.parseFloat(getComputedStyle(p).fontSize)
    }
  })
}

test('an image inside a sentence is sized to the text, a figure keeps its size', async ({
  page
}) => {
  const reader = await openBook(page)

  const formula = await measure(reader, 'inline')
  expect(formula.height).toBeGreaterThan(formula.fontSize * 0.5)
  expect(formula.height).toBeLessThanOrEqual(formula.fontSize * 1.05)
  const width = await reader.content
    .locator('#inline img')
    .evaluate((el) => el.getBoundingClientRect().width)
  // The aspect ratio is kept.
  expect(width / formula.height).toBeCloseTo(525 / 367, 1)

  // A cap, not a height: a small inline image is not enlarged.
  expect((await measure(reader, 'gaiji')).height).toBeCloseTo(12, 0)
  expect((await measure(reader, 'figure')).height).toBeCloseTo(200, 0)
})

test('images inside a sentence follow the font size', async ({ page }) => {
  const reader = await openBook(page)
  const before = await measure(reader, 'inline')

  await reader.display()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let i = 0; i < 6; i++) await page.keyboard.press('Control+Equal')
  await expect(reader.fontSize).toHaveText('24px')

  await expect
    .poll(async () => (await measure(reader, 'inline')).fontSize)
    .toBeGreaterThan(before.fontSize)
  const after = await measure(reader, 'inline')
  expect(after.height / before.height).toBeCloseTo(after.fontSize / before.fontSize, 1)
  expect(after.height).toBeLessThanOrEqual(after.fontSize * 1.05)
  expect((await measure(reader, 'figure')).height).toBeCloseTo(200, 0)
})
