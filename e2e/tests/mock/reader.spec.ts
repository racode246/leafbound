import { expect, test } from '@playwright/test'
import { Library } from '../../support/pages.ts'

const toFullWidth = (n: number) =>
  String(n).replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

test('jump to a page, seek with the progress bar, focus the page box with Ctrl+G', async ({
  page
}) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  const total = await reader.totalPages()
  expect(total).toBeGreaterThan(1)

  const target = Math.max(2, Math.floor(total / 2))
  await reader.pageBox.fill(toFullWidth(target))
  await reader.pageBox.press('Enter')
  await expect.poll(() => reader.pageNumber()).toBe(target)

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => reader.pageNumber()).toBeGreaterThanOrEqual(target)

  const dragTo = Math.max(1, Math.round(total * 0.8))
  // fill() does not take range inputs; set the value the way a drag does.
  await reader.seek.evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, dragTo)
  await expect(page.locator('.seek-tip')).toBeVisible()
  await reader.seek.dispatchEvent('pointerup')
  await expect
    .poll(async () => Math.abs((await reader.pageNumber()) - dragTo))
    .toBeLessThanOrEqual(1)

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+g')
  await expect(reader.pageBox).toBeFocused()
})

test('the search panel header stays at the top while results scroll', async ({ page }) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await page.keyboard.press('Control+f')
  const panel = reader.panel('Search in book')
  await panel.getByRole('searchbox').fill('吾輩')
  await panel.getByRole('searchbox').press('Enter')
  await expect(panel.locator('.search-hit').first()).toBeVisible({ timeout: 60_000 })

  const m = await panel.evaluate(async (p) => {
    p.scrollTop = 400
    await new Promise((r) => setTimeout(r, 300))
    const head = p.querySelector('.panel-sticky')!.getBoundingClientRect()
    return { scrolled: p.scrollTop > 0, panelTop: p.getBoundingClientRect().top, headTop: head.top }
  })
  expect(m.scrolled).toBe(true)
  expect(Math.abs(m.headTop - m.panelTop)).toBeLessThanOrEqual(1)
})
