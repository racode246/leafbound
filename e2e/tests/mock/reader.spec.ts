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
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!setValue) throw new Error('HTMLInputElement has no value setter')
    setValue.call(el, String(v))
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
    const head = p.querySelector('.panel-sticky')?.getBoundingClientRect()
    if (!head) throw new Error('the search panel has no sticky header')
    return { scrolled: p.scrollTop > 0, panelTop: p.getBoundingClientRect().top, headTop: head.top }
  })
  expect(m.scrolled).toBe(true)
  expect(Math.abs(m.headTop - m.panelTop)).toBeLessThanOrEqual(1)
})

test('Ctrl+= / Ctrl+- / Ctrl+0 change the font size from the reader and from the book', async ({
  page
}) => {
  const reader = await new Library(page).open('Leafbound サンプル')
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  await reader.display()
  await expect(reader.fontSize).toHaveText('18px')

  // Whether each key's default action (the browser's page zoom) was cancelled. These
  // listeners run after the app's, which were added when the reader opened.
  await page.evaluate(() => {
    const w = window as unknown as { lbPrevented: boolean[] }
    w.lbPrevented = []
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Control') w.lbPrevented.push(e.defaultPrevented)
    })
  })

  // The focus on the reader itself.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+Equal')
  await expect(reader.fontSize).toHaveText('19px')
  await page.keyboard.press('Control+NumpadAdd')
  await expect(reader.fontSize).toHaveText('20px')
  await page.keyboard.press('Control+Minus')
  await expect(reader.fontSize).toHaveText('19px')
  await page.keyboard.press('Control+NumpadSubtract')
  await expect(reader.fontSize).toHaveText('18px')
  await page.keyboard.press('Control+Equal')
  await page.keyboard.press('Control+0')
  await expect(reader.fontSize).toHaveText('18px')
  expect(
    await page.evaluate(() => (window as unknown as { lbPrevented: boolean[] }).lbPrevented)
  ).toEqual([true, true, true, true, true, true])

  // The focus inside the book's iframe. The listener comes from this page: the iframe's
  // sandbox runs no script of its own, the same as the app's listeners.
  await page.evaluate(() => {
    const w = window as unknown as { lbPrevented: boolean[] }
    w.lbPrevented = []
    const book = document.querySelector<HTMLIFrameElement>('.reader-view iframe')?.contentWindow
    if (!book) throw new Error('the book has no iframe')
    book.addEventListener('keydown', (e) => {
      if (e.key !== 'Control') w.lbPrevented.push(e.defaultPrevented)
    })
  })
  await reader.content.locator('p').first().click()
  await page.keyboard.press('Control+Equal')
  await page.keyboard.press('Control+Equal')
  await reader.display()
  await expect(reader.fontSize).toHaveText('20px')
  await reader.content.locator('p').first().click()
  await page.keyboard.press('Control+Minus')
  await reader.display()
  await expect(reader.fontSize).toHaveText('19px')
  await reader.content.locator('p').first().click()
  await page.keyboard.press('Control+0')
  await reader.display()
  await expect(reader.fontSize).toHaveText('18px')
  expect(
    await page.evaluate(() => (window as unknown as { lbPrevented: boolean[] }).lbPrevented)
  ).toEqual([true, true, true, true])
})
