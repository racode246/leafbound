// The font size keys (issue #64) change the book's text in WebView2, not the zoom of the
// whole page, with the focus on the reader and inside the book. Tauri also keeps WebView2's
// own zoom keys off (zoomHotkeysEnabled defaults to false), so this passes even without the
// app's preventDefault(); the mock test checks that the keys are cancelled.
import { expect, test } from '../../support/app.ts'
import { Library } from '../../support/pages.ts'

const BOOK = '古本屋のミケ'

test('Ctrl+= / Ctrl+- / Ctrl+0 change the font size and leave the page zoom alone', async ({
  app
}) => {
  const { page } = app
  const reader = await new Library(page).open(BOOK)
  // Page zoom shows as a different devicePixelRatio and a narrower CSS viewport.
  const zoom = () => page.evaluate(() => [window.devicePixelRatio, window.innerWidth])
  const before = await zoom()
  const bookFontSize = () =>
    reader.content.locator('body').evaluate((b) => getComputedStyle(b).fontSize)

  await reader.display()
  await expect(reader.fontSize).toHaveText('18px')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+Equal')
  await expect(reader.fontSize).toHaveText('19px')
  await expect.poll(bookFontSize).toBe('19px')
  expect(await zoom()).toEqual(before)

  await reader.content.locator('p').first().click()
  await page.keyboard.press('Control+Minus')
  await page.keyboard.press('Control+Minus')
  await reader.display()
  await expect(reader.fontSize).toHaveText('17px')
  await expect.poll(bookFontSize).toBe('17px')
  expect(await zoom()).toEqual(before)

  await reader.content.locator('p').first().click()
  await page.keyboard.press('Control+0')
  await reader.display()
  await expect(reader.fontSize).toHaveText('18px')
  expect(await zoom()).toEqual(before)
})
