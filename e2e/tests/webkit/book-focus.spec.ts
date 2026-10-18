// WebKit (macOS's WKWebView) runs no listener the app adds to a book iframe sandboxed without
// allow-scripts, so keys, the wheel and selections inside the book reached nothing on macOS.
import { expect, test } from '@playwright/test'
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

test('selecting text in the book shows the selection menu', async ({ page }) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await reader.content.locator('p').first().selectText()
  await expect(reader.selectionMenu).toBeVisible()
})
