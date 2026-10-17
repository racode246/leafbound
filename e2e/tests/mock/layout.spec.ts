// The window never scrolls sideways (issue #9): the library and every reader panel
// fit the window, and scrollIntoView() on anything inside them leaves the page where
// it is. Scrollbars are shown (Playwright hides them in headless mode) so the widths
// match the app, where a scrollbar takes 15-17 px.
import { expect, test } from '@playwright/test'
import {
  expectReaderPanelsFlat,
  expectScrollIntoViewKeepsShell,
  expectShellFlat
} from '../../support/layout.ts'
import { Assistant, Library } from '../../support/pages.ts'

const BOOK = 'Leafbound サンプル'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.beforeEach(async ({ page }) => {
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

for (const width of [1200, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('the library and every reader panel fit the window, also after scrollIntoView()', async ({
      page
    }) => {
      const library = new Library(page)
      await expect(library.card(BOOK)).toBeVisible()
      await expectShellFlat(page, `library at ${width}px`)
      await expectScrollIntoViewKeepsShell(page, page.locator('#root'), `the library at ${width}px`)

      const reader = await library.open(BOOK)

      // Give the panels something to list: a highlight, search results, a conversation.
      await reader.highlightWithNote('吾輩は猫である', 'a note')
      const search = await reader.showPanel('Search', 'Search in book')
      await search.getByRole('searchbox').fill('吾輩')
      await search.getByRole('searchbox').press('Enter')
      await expect(search.locator('.search-hit').first()).toBeVisible({ timeout: 60_000 })
      const ai = new Assistant(page)
      await ai.open()
      await ai.waitUntilReady()
      await ai.saveKey('sk-x')
      await ai.ask('Who is the narrator?')

      await expectReaderPanelsFlat(reader, width)
    })
  })
}

test('a box wider than the window cannot shift the page', async ({ page }) => {
  const reader = await new Library(page).open(BOOK)
  await reader.showPanel('Ask AI', 'Ask AI')
  // Stand-in for any future layout bug: 17 px (a scrollbar) wider than the reader.
  const wide = await page.evaluate(() => {
    const el = document.createElement('div')
    el.id = 'too-wide'
    el.style.cssText = 'position: absolute; top: 0; left: 0; width: calc(100% + 17px); height: 4px'
    document.querySelector('.reader-body')?.append(el)
    return el.getBoundingClientRect().right - document.documentElement.clientWidth
  })
  expect(wide).toBe(17)
  await expectScrollIntoViewKeepsShell(
    page,
    page.locator('#too-wide'),
    'a box wider than the window'
  )
  await expectScrollIntoViewKeepsShell(page, reader.panel('Ask AI'), 'the Ask AI panel')
})
