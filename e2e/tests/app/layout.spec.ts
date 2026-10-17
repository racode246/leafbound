// The window never scrolls sideways (issue #9), in WebView2 with its classic 17 px
// scrollbars: the library and every reader panel fit the window, and scrollIntoView()
// on anything inside them leaves the page where it is. The widths are set with CDP
// device metrics (the app may not resize its own window).
import { expect, test } from '../../support/app.ts'
import {
  expectReaderPanelsFlat,
  expectScrollIntoViewKeepsShell,
  expectShellFlat
} from '../../support/layout.ts'
import { Assistant, Library } from '../../support/pages.ts'

const BOOK = '古本屋のミケ'
const WIDTHS = [1200, 1280]

test.use({ seedOptions: { language: 'en', model: true } })

test('the library and every reader panel fit the window, also after scrollIntoView()', async ({
  app
}) => {
  const { page } = app
  const cdp = await page.context().newCDPSession(page)
  const setWidth = (width: number) =>
    cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    })

  const library = new Library(page)
  await expect(library.card(BOOK)).toBeVisible()
  for (const width of WIDTHS) {
    await setWidth(width)
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
    await expectShellFlat(page, `library at ${width}px`)
    await expectScrollIntoViewKeepsShell(page, page.locator('#root'), `the library at ${width}px`)
  }

  // Give the panels something to list: a highlight, search results, a conversation
  // whose answer cites the book.
  const reader = await library.open(BOOK)
  await reader.openChapter('第三章 カレーの作り方')
  await reader.highlightWithNote('隠し味', 'secret ingredient')
  const search = await reader.showPanel('Search', 'Search in book')
  await search.getByRole('searchbox').fill('ミケ')
  await search.getByRole('searchbox').press('Enter')
  await expect(search.locator('.search-hit').first()).toBeVisible({ timeout: 60_000 })
  const ai = new Assistant(page)
  await ai.open()
  await ai.waitUntilReady()
  await ai.ask('灯台の光は何秒ごとに回る？')
  await ai.turns.last().locator('.ai-cite').first().click()
  await expect(reader.chapter).toContainText('第四章')

  for (const width of WIDTHS) {
    await setWidth(width)
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
    await expectReaderPanelsFlat(reader, width)
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride')
})
