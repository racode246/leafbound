// Note popup (issue #82): a reference to a footnote or an endnote shows the note next to it and
// leaves the reading position alone; any other link keeps navigating.
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library, type Reader } from '../../support/pages.ts'

// scripts/make_e2e_epub.py. The references are on the first screen of Chapter One.
const BOOK = { path: join(fixtures, 'footnotes.epub'), title: 'footnotes' }
const FOOTNOTE = 'The lamp burned whale oil until 1890.'
const ENDNOTE = 'The ferry only ran at high tide.'

const FLOWS = ['Paged (horizontal)', 'Scroll (vertical)'] as const

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

async function openBook(page: Page, flow: (typeof FLOWS)[number]): Promise<Reader> {
  const library = new Library(page)
  await library.add(BOOK.path, BOOK.title)
  const reader = await library.open(BOOK.title)
  if (flow !== FLOWS[0]) {
    await reader.setFlow(flow)
    await reader.barButton('Aa Display').click()
  }
  await expect(reader.pageBox).toBeEnabled({ timeout: 60_000 })
  await expect(reader.chapter).toContainText('Chapter One')
  return reader
}

/** The saved position once it has settled; the first save comes 400 ms after opening. */
async function savedPosition(reader: Reader): Promise<string> {
  await expect.poll(() => reader.savedCfi()).not.toBeNull()
  return (await reader.savedCfi()) as string
}

/** Fails if the reading position moved. A save would come 400 ms after the move. */
async function expectNotMoved(reader: Reader, cfi: string, pageNumber: number): Promise<void> {
  await reader.page.waitForTimeout(600)
  expect(await reader.savedCfi()).toBe(cfi)
  expect(await reader.pageNumber()).toBe(pageNumber)
  await expect(reader.chapter).toContainText('Chapter One')
}

for (const flow of FLOWS) {
  test.describe(flow, () => {
    test('a reference shows the note without moving, and Esc closes it', async ({ page }) => {
      const reader = await openBook(page, flow)
      const cfi = await savedPosition(reader)
      const pageNumber = await reader.pageNumber()

      await reader.bookLink('1').click()
      await expect(reader.notePopup).toHaveText(new RegExp(`^${FOOTNOTE}`))
      await expect(reader.notePopup).not.toContainText('↩')
      await expect(reader.selectionMenu).toHaveCount(0)
      await expectNotMoved(reader, cfi, pageNumber)

      await page.keyboard.press('Escape')
      await expect(reader.notePopup).toHaveCount(0)
      await expectNotMoved(reader, cfi, pageNumber)
    })

    test('an endnote in another section shows without moving', async ({ page }) => {
      const reader = await openBook(page, flow)
      const cfi = await savedPosition(reader)
      const pageNumber = await reader.pageNumber()

      await reader.bookLink('2').click()
      await expect(reader.notePopup).toContainText(ENDNOTE)
      await expect(reader.notePopup).not.toContainText('↩')
      await expectNotMoved(reader, cfi, pageNumber)
    })

    test('a click outside closes the popup, in the book and in the app', async ({ page }) => {
      const reader = await openBook(page, flow)
      const box = await page.locator('.reader-view').boundingBox()
      if (!box) throw new Error('the reader view has no bounding box')

      await reader.bookLink('1').click()
      await expect(reader.notePopup).toBeVisible()
      // Low on the page, where the popup is not.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85)
      await expect(reader.notePopup).toHaveCount(0)

      await reader.bookLink('1').click()
      await expect(reader.notePopup).toBeVisible()
      await page.locator('.reader-foot').click({ position: { x: 2, y: 2 } })
      await expect(reader.notePopup).toHaveCount(0)
    })

    test('Go to note moves to the note and Back returns', async ({ page }) => {
      const reader = await openBook(page, flow)
      const pageNumber = await reader.pageNumber()

      await reader.bookLink('2').click()
      await reader.goToNote.click()
      await expect(reader.notePopup).toHaveCount(0)
      await expect(reader.chapter).toContainText('Notes')

      await reader.jumpBack.click()
      await expect(reader.chapter).toContainText('Chapter One')
      await expect.poll(() => reader.pageNumber()).toBe(pageNumber)
    })

    test('Go to note reaches a footnote later in the section', async ({ page }) => {
      const reader = await openBook(page, flow)
      const pageNumber = await reader.pageNumber()

      await reader.bookLink('1').click()
      await reader.goToNote.click()
      await expect.poll(() => reader.pageNumber()).toBeGreaterThan(pageNumber)

      await reader.jumpBack.click()
      await expect.poll(() => reader.pageNumber()).toBe(pageNumber)
    })

    test('a link that is not a note still navigates', async ({ page }) => {
      const reader = await openBook(page, flow)
      await reader.bookLink('see Chapter Two').click()
      await expect(reader.chapter).toContainText('Chapter Two')
      await expect(reader.notePopup).toHaveCount(0)
    })

    test('a reference whose target is missing navigates as a link', async ({ page }) => {
      const reader = await openBook(page, flow)
      await reader.bookLink('3').click()
      await expect(reader.chapter).toContainText('Chapter Two')
      await expect(reader.notePopup).toHaveCount(0)
    })
  })
}

test('turning the page closes the popup', async ({ page }) => {
  const reader = await openBook(page, FLOWS[0])
  await reader.bookLink('1').click()
  await expect(reader.notePopup).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(reader.notePopup).toHaveCount(0)
})
