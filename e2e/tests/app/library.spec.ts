import { expect, test, TEST_BOOK } from '../../support/app.ts'
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
