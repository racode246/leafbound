import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, TEST_BOOK } from '../../support/app.ts'
import { appData } from '../../support/env.ts'
import { Library } from '../../support/pages.ts'

const BOOK = '古本屋のミケ'

test('opens a book passed on the command line and keeps position and highlights after a restart', async ({
  app
}) => {
  const library = new Library(app.page)
  await expect(library.card(BOOK)).toBeVisible()
  await expect(library.card(BOOK)).toContainText('Unread')

  const reader = await library.open(BOOK)
  await reader.openChapter('第三章 カレーの作り方')
  await reader.highlightWithNote('隠し味', 'secret ingredient')
  await expect(reader.barButton(/^Highlights/)).toContainText('1')

  // The reading position is saved 400 ms after the last move.
  await app.page.waitForTimeout(1000)
  await app.relaunch()
  const again = new Library(app.page)
  await expect(again.card(BOOK)).not.toContainText('Unread')
  const reopened = await again.open(BOOK)
  await expect(reopened.chapter).toContainText('第三章')
  await reopened.barButton(/^Highlights/).click()
  await expect(reopened.panel('Highlights & notes')).toContainText('secret ingredient')
})

test('removes files of books that are not in the library on startup', async ({ app }) => {
  const library = new Library(app.page)
  await expect(library.card(BOOK)).toBeVisible()
  const { books } = await app.invoke<{ books: { id: string; title: string }[] }>('get_library')
  const { id } = books.find((b) => b.title === BOOK) ?? { id: '' }
  expect(id).not.toBe('')
  // The test book has no cover; its stored copy is the file to keep.
  const own = [join(appData, 'books', `${id}.epub`)]

  const orphan = randomUUID()
  const orphans = [
    join(appData, 'books', `${orphan}.epub`),
    join(appData, 'covers', `${orphan}.img`),
    join(appData, 'annotations', `${orphan}.json`)
  ]
  // Not named like a book file, so not the app's to remove.
  const foreign = join(appData, 'books', 'keep me.epub')
  await app.relaunch(() => {
    for (const file of [...orphans, foreign]) writeFileSync(file, 'left behind')
  })

  const again = new Library(app.page)
  await expect(again.card(BOOK)).toBeVisible()
  for (const file of orphans) expect(existsSync(file), file).toBe(false)
  for (const file of [...own, foreign]) expect(existsSync(file), file).toBe(true)
  await again.open(BOOK)
})

test.describe('Japanese UI', () => {
  test.use({ seedOptions: { language: 'ja', model: false }, openFiles: [TEST_BOOK] })

  test('shows the library and reader in Japanese', async ({ app }) => {
    await expect(app.page.getByText('すべての本').first()).toBeVisible()
    await app.page.locator('.card', { hasText: BOOK }).locator('.card-cover').click()
    await expect(
      app.page.locator('.titlebar').getByRole('button', { name: 'AI に質問', exact: true })
    ).toBeVisible()
  })
})
