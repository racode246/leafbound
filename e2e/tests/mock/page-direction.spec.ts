// A book whose pages turn from right to left (spine page-progression-direction="rtl") moves
// forward with ← and the left edge, back with → and the right edge. PageDown / Space / PageUp
// and left-to-right books keep their direction.
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library, type Reader } from '../../support/pages.ts'

// scripts/make_e2e_epub.py
const RTL = { path: join(fixtures, 'rtl.epub'), title: 'rtl' }
const LTR = { path: join(fixtures, 'footnotes.epub'), title: 'footnotes' }

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

async function openBook(page: Page, book: { path: string; title: string }): Promise<Reader> {
  const library = new Library(page)
  await library.add(book.path, book.title)
  const reader = await library.open(book.title)
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  return reader
}

/** The saved position once it has settled; a save comes 400 ms after the last move. */
async function settled(reader: Reader): Promise<string> {
  await expect.poll(() => reader.savedCfi()).not.toBeNull()
  let last = await reader.savedCfi()
  await expect(async () => {
    await reader.page.waitForTimeout(600)
    const now = await reader.savedCfi()
    const same = now === last
    last = now
    expect(same).toBe(true)
  }).toPass()
  return last as string
}

/** Turns a page with `turn` and returns the new position; fails if it did not move. */
async function moved(reader: Reader, from: string, turn: () => Promise<void>): Promise<string> {
  await turn()
  await expect.poll(() => reader.savedCfi()).not.toBe(from)
  return settled(reader)
}

const edge = (page: Page, side: 'left' | 'right') => page.locator(`.edge-${side}`)

test('a right-to-left book turns forward with ← and back with →', async ({ page }) => {
  const reader = await openBook(page, RTL)
  const start = await settled(reader)

  // At the first page → goes back, so nothing moves.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(600)
  expect(await reader.savedCfi()).toBe(start)

  const second = await moved(reader, start, () => page.keyboard.press('ArrowLeft'))
  expect(await moved(reader, second, () => page.keyboard.press('ArrowRight'))).toBe(start)

  // PageDown / Space stay forward and PageUp back.
  expect(await moved(reader, start, () => page.keyboard.press('PageDown'))).toBe(second)
  expect(await moved(reader, second, () => page.keyboard.press('PageUp'))).toBe(start)
  expect(await moved(reader, start, () => page.keyboard.press('Space'))).toBe(second)
})

test('a right-to-left book has the next page on the left edge', async ({ page }) => {
  const reader = await openBook(page, RTL)
  await expect(edge(page, 'left')).toHaveAccessibleName('Next page')
  await expect(edge(page, 'right')).toHaveAccessibleName('Previous page')

  const start = await settled(reader)
  const second = await moved(reader, start, () => edge(page, 'left').click())
  expect(await moved(reader, second, () => edge(page, 'right').click())).toBe(start)
})

test('a left-to-right book keeps → and the right edge forward', async ({ page }) => {
  const reader = await openBook(page, LTR)
  await expect(edge(page, 'left')).toHaveAccessibleName('Previous page')
  await expect(edge(page, 'right')).toHaveAccessibleName('Next page')

  const start = await settled(reader)
  const second = await moved(reader, start, () => page.keyboard.press('ArrowRight'))
  expect(await moved(reader, second, () => page.keyboard.press('ArrowLeft'))).toBe(start)
  expect(await moved(reader, start, () => edge(page, 'right').click())).toBe(second)
  expect(await moved(reader, second, () => edge(page, 'left').click())).toBe(start)
})
