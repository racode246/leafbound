// Back after a jump (issue #63): a jump through the reader's own navigation remembers where
// the reader was, and "Back to where you were" (Alt+← / ⌘[) returns there once.
import { expect, type Page, test } from '@playwright/test'
import { Assistant, Library, type Reader } from '../../support/pages.ts'

const BOOK = 'Leafbound サンプル'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

/** Opens the sample book and waits for its page numbers. */
async function openBook(page: Page): Promise<Reader> {
  const reader = await new Library(page).open(BOOK)
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  return reader
}

/**
 * Jumps to the next-to-last page through the page box (Ctrl+G's field), which is in the
 * last chapter. The page number changes at once; the chapter once the page is shown.
 */
async function goToLastChapter(reader: Reader): Promise<void> {
  const target = (await reader.totalPages()) - 1
  await reader.pageBox.fill(String(target))
  await reader.pageBox.press('Enter')
  await expect.poll(() => reader.pageNumber()).toBe(target)
  await expect(reader.chapter).toContainText('第三章')
}

/**
 * Clicks the middle of the shown page, so the keyboard focus is inside the book's iframe.
 * (Clicking a paragraph by locator would scroll it into view and turn the page.)
 */
async function focusBook(reader: Reader): Promise<void> {
  const box = await reader.page.locator('.reader-view').boundingBox()
  if (!box) throw new Error('the reader view has no bounding box')
  await reader.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

type ResultWindow = Window & { lbPrevented?: boolean }

/**
 * Presses `key` with the focus inside the book and checks that the browser's own action for
 * it (Alt+← is Back in WebView2) was cancelled. epub.js passes the book's keys on from a
 * passive listener, where the app's preventDefault() would do nothing.
 */
async function pressInBook(reader: Reader, key: string): Promise<void> {
  await focusBook(reader)
  await reader.page.evaluate(() => {
    const top = window as ResultWindow
    top.lbPrevented = undefined
    for (const frame of document.querySelectorAll<HTMLIFrameElement>('.reader-view iframe')) {
      // On the book's window, so it runs after the listeners on its document.
      frame.contentWindow?.addEventListener('keydown', (e) => {
        if (e.key !== 'Alt' && e.key !== 'Meta') top.lbPrevented = e.defaultPrevented
      })
    }
  })
  await reader.page.keyboard.press(key)
  const prevented = await reader.page.evaluate(() => (window as ResultWindow).lbPrevented)
  expect(prevented, `${key} inside the book is cancelled`).toBe(true)
}

/**
 * Runs `jump` from the current page, then checks that the Back button appears, returns to
 * the page the reader was on and disappears. `back` defaults to clicking the button.
 */
async function expectBackAfter(
  reader: Reader,
  jump: () => Promise<void>,
  back: () => Promise<void> = () => reader.jumpBack.click()
): Promise<void> {
  const before = await reader.pageNumber()
  await expect(reader.jumpBack).toHaveCount(0)
  await jump()
  await expect.poll(() => reader.pageNumber()).not.toBe(before)
  await expect(reader.jumpBack).toBeVisible()
  await back()
  await expect.poll(() => reader.pageNumber()).toBe(before)
  await expect(reader.jumpBack).toHaveCount(0)
}

test('Back returns from a Contents entry', async ({ page }) => {
  const reader = await openBook(page)
  await expectBackAfter(reader, () => reader.openChapter('第三章 奥付'))
  await expect(reader.chapter).toContainText('第一章')
})

test('Back returns from a search result', async ({ page }) => {
  const reader = await openBook(page)
  await expectBackAfter(reader, async () => {
    // Only the third chapter's paragraphs end with "(3-n)".
    const hits = await reader.search('(3-1)')
    await hits.first().click()
    await expect(reader.chapter).toContainText('第三章')
  })
})

test('Back returns from a highlight in the Highlights panel', async ({ page }) => {
  const reader = await openBook(page)
  // The highlight is on the first page; read from a later one. Going there is itself a jump,
  // and the one from the panel replaces it.
  await reader.highlightWithNote('吾輩は猫である', 'a note')
  await goToLastChapter(reader)
  const later = await reader.pageNumber()
  const panel = await reader.showPanel(/^Highlights/, 'Highlights')
  await panel.locator('.hl-text').first().click()
  await expect.poll(() => reader.pageNumber()).toBe(1)
  await expect(reader.jumpBack).toBeVisible()
  await reader.jumpBack.click()
  await expect.poll(() => reader.pageNumber()).toBe(later)
  await expect(reader.jumpBack).toHaveCount(0)
})

test('Back returns from an AI citation', async ({ page }) => {
  const reader = await openBook(page)
  const ai = new Assistant(page)
  await ai.open()
  await ai.waitUntilReady()
  await ai.saveKey('sk-x')
  await ai.ask('Where does the book end?')
  await expectBackAfter(reader, async () => {
    // The mock cites a passage of the last indexed chapter.
    await ai.turns.last().locator('.ai-cite').first().click()
    await expect(reader.chapter).toContainText('第三章')
  })
})

test('Back returns from Go to page, and its tooltip names Alt+←', async ({ page }) => {
  const reader = await openBook(page)
  await expectBackAfter(reader, () => goToLastChapter(reader))

  // A new jump overwrites the slot; turning pages keeps it.
  await goToLastChapter(reader)
  const last = await reader.pageNumber()
  await reader.openChapter('第二章 ページをめくる')
  await page.keyboard.press('ArrowRight')
  await reader.jumpBack.hover()
  await expect(reader.barTip(reader.jumpBack)).toHaveText('Back to where you were (Alt+←)')
  await reader.jumpBack.click()
  await expect.poll(() => reader.pageNumber()).toBe(last)
  await expect(reader.jumpBack).toHaveCount(0)
})

test('Alt+← goes back, also with the focus inside the book', async ({ page }) => {
  const reader = await openBook(page)
  await expectBackAfter(
    reader,
    () => goToLastChapter(reader),
    () => page.keyboard.press('Alt+ArrowLeft')
  )
  await expectBackAfter(
    reader,
    () => goToLastChapter(reader),
    () => pressInBook(reader, 'Alt+ArrowLeft')
  )
})

test('without a jump there is no Back button and Alt+← does nothing', async ({ page }) => {
  const reader = await openBook(page)
  // Read on (turning pages is not a jump) until the page number changes.
  const start = await reader.pageNumber()
  // One turn per try, waited for, so that no turn is still queued afterwards.
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => reader.pageNumber(), { timeout: 1_000 }).toBeGreaterThan(start)
  }).toPass({ timeout: 20_000 })
  const reading = await reader.pageNumber()
  const chapter = await reader.chapter.textContent()
  await expect(reader.jumpBack).toHaveCount(0)

  await page.keyboard.press('Alt+ArrowLeft')
  await pressInBook(reader, 'Alt+ArrowLeft')
  // Nothing happens, so there is no event to wait for: give a page turn time to show.
  await page.waitForTimeout(1000)
  expect(await reader.pageNumber()).toBe(reading)
  await expect(reader.chapter).toHaveText(chapter ?? '')
  await expect(reader.jumpBack).toHaveCount(0)
})

test.describe('macOS', () => {
  test.use({ userAgent: MAC_UA })

  test('⌘[ goes back, also with the focus inside the book', async ({ page }) => {
    const reader = await openBook(page)
    await expectBackAfter(
      reader,
      () => goToLastChapter(reader),
      () => page.keyboard.press('Meta+BracketLeft')
    )
    await expectBackAfter(
      reader,
      () => goToLastChapter(reader),
      () => pressInBook(reader, 'Meta+BracketLeft')
    )
    await goToLastChapter(reader)
    await reader.jumpBack.hover()
    await expect(reader.barTip(reader.jumpBack)).toHaveText('Back to where you were (⌘[)')
  })
})
