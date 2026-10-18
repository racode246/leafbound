// The Enter that confirms an IME conversion must not act as a plain Enter (#53).
// WebKit (WKWebView on macOS) fires compositionend before that keydown, so it is
// not composing and only carries keyCode 229. The tests replay that order with
// synthetic events, which behave the same in any engine, so they live here (CI).
import { expect, type Locator, test } from '@playwright/test'
import { Assistant, Library } from '../../support/pages.ts'

/** Replays what WebKit sends when an IME conversion is confirmed with Enter. */
async function confirmConversion(field: Locator): Promise<void> {
  await field.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '今日は' }))
    const keydown = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: false
    })
    // keyCode is not part of KeyboardEventInit.
    Object.defineProperty(keydown, 'keyCode', { get: () => 229 })
    el.dispatchEvent(keydown)
  })
}

test('the IME Enter does not send the question in Ask AI', async ({ page }) => {
  await page.goto('/?rafShim=1')
  await new Library(page).open('Leafbound サンプル')
  const ai = new Assistant(page)
  await ai.open()
  await ai.waitUntilReady()
  await ai.saveKey('sk-x')

  await ai.input.fill('今日は')
  await confirmConversion(ai.input)
  await expect(ai.input).toHaveValue('今日は')
  await expect(ai.stopButton).toHaveCount(0)
  await expect(ai.turns).toHaveCount(0)

  // The next, plain Enter sends it.
  await ai.send()
})

test('the IME Enter does not commit a category rename', async ({ page }) => {
  await page.goto('/')
  const sidebar = page.locator('.sidebar')
  await sidebar.getByLabel('New category name').fill('Fiction')
  await sidebar.getByRole('button', { name: 'Add', exact: true }).click()
  await sidebar.getByRole('button', { name: /^Fiction/ }).dblclick()

  const field = sidebar.locator('.nav-edit input')
  await field.fill('小説')
  await confirmConversion(field)
  await expect(field).toBeVisible()
  await expect(field).toHaveValue('小説')

  await field.press('Enter')
  await expect(field).toHaveCount(0)
  await expect(sidebar.getByRole('button', { name: /^小説/ })).toBeVisible()
})
