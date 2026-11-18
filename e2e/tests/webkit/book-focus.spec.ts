// WebKit (macOS's WKWebView) runs no listener the app adds to a book iframe sandboxed without
// allow-scripts, so keys, the wheel and selections inside the book reached nothing on macOS.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library, type Reader } from '../../support/pages.ts'

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

/** Clicks the book's text, so the keyboard focus is inside its iframe. */
async function focusBook(reader: Reader): Promise<void> {
  await reader.content.locator('p').first().click()
}

test('shortcuts work while the book has the focus', async ({ page }) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  const start = await reader.pageNumber()

  // A page number spans more than one screen, so turn until it changes. The focus stays in
  // the book.
  await focusBook(reader)
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    expect(await reader.pageNumber()).toBeGreaterThan(start)
  }).toPass({ timeout: 20_000 })

  await focusBook(reader)
  await page.keyboard.press('Meta+f')
  await expect(reader.panel('Search')).toBeVisible()

  await focusBook(reader)
  await page.keyboard.press('Meta+g')
  await expect(reader.pageBox).toBeFocused()

  await focusBook(reader)
  await page.keyboard.press('Meta+Equal')
  await reader.display()
  await expect(reader.fontSize).toHaveText('19px')
})

test('← turns forward in a right-to-left book while the book has the focus', async ({ page }) => {
  // scripts/make_e2e_epub.py: a vertical book whose pages turn from right to left.
  const library = new Library(page)
  await library.add(join(fixtures, 'rtl.epub'), 'rtl')
  const reader = await library.open('rtl')
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  await expect.poll(() => reader.savedCfi()).not.toBeNull()
  const start = await reader.savedCfi()

  await focusBook(reader)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => reader.savedCfi()).not.toBe(start)

  await focusBook(reader)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.savedCfi()).toBe(start)
})

test('selecting text in the book shows the selection menu', async ({ page }) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await reader.content.locator('p').first().selectText()
  await expect(reader.selectionMenu).toBeVisible()
})
