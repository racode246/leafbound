// macOS runs the listeners on the book's iframe only because of allowScriptedContent, so the note
// popup (issue #82) has to open from a click inside the iframe in WebKit too.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fixtures } from '../../support/env.ts'
import { Library } from '../../support/pages.ts'

test('a reference in the book opens the note popup', async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
  const library = new Library(page)
  await library.add(join(fixtures, 'footnotes.epub'), 'footnotes')
  const reader = await library.open('footnotes')
  await expect(reader.chapter).toContainText('Chapter One')

  await reader.bookLink('1').click()
  await expect(reader.notePopup).toContainText('The lamp burned whale oil until 1890.')
  await page.keyboard.press('Escape')
  await expect(reader.notePopup).toHaveCount(0)

  await reader.bookLink('2').click()
  await expect(reader.notePopup).toContainText('The ferry only ran at high tide.')
  await expect(reader.chapter).toContainText('Chapter One')
})
