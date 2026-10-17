// The reader's title bar buttons are icons with a tooltip (issue #41): no visible text, the
// same accessible names as when they were text, and a themed tooltip on hover and keyboard
// focus that stays inside the window.
import { expect, type Locator, type Page, test } from '@playwright/test'
import { Library } from '../../support/pages.ts'

const BOOK = 'Leafbound サンプル'

/** In tab order: accessible name and tooltip, in English and Japanese. */
const BUTTONS = [
  {
    en: { name: 'Back to library', tip: 'Back to library' },
    ja: { name: 'ライブラリへ戻る', tip: 'ライブラリへ戻る' }
  },
  { en: { name: 'Contents', tip: 'Contents' }, ja: { name: '目次', tip: '目次' } },
  {
    en: { name: 'Search', tip: 'Search (Ctrl+F)' },
    ja: { name: '検索', tip: '検索 (Ctrl+F)' }
  },
  {
    en: { name: 'Highlights', tip: 'Highlights' },
    ja: { name: 'ハイライト', tip: 'ハイライト' }
  },
  { en: { name: 'Ask AI', tip: 'Ask AI' }, ja: { name: 'AI に質問', tip: 'AI に質問' } },
  { en: { name: 'Aa Display', tip: 'Display' }, ja: { name: 'Aa 表示', tip: '表示' } }
]

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

/** Moves the pointer onto the middle of the book, away from the title bar. */
async function pointAtBook(page: Page): Promise<void> {
  const size = page.viewportSize()
  if (!size) throw new Error('the page has no viewport size')
  await page.mouse.move(size.width / 2, size.height / 2)
}

async function expectInsideViewport(page: Page, tip: Locator, what: string): Promise<void> {
  const box = await tip.boundingBox()
  const size = page.viewportSize()
  if (!box || !size) throw new Error(`no bounding box for ${what}`)
  expect(box.x, `${what}: left edge`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${what}: top edge`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${what}: right edge`).toBeLessThanOrEqual(size.width)
  expect(box.y + box.height, `${what}: bottom edge`).toBeLessThanOrEqual(size.height)
}

for (const lang of ['en', 'ja'] as const) {
  test.describe(`${lang} UI`, () => {
    test.use({ locale: lang === 'en' ? 'en-US' : 'ja-JP' })

    test('the buttons show only an icon and keep their names', async ({ page }) => {
      const reader = await new Library(page).open(BOOK)
      for (const b of BUTTONS) {
        const button = reader.barButton(b[lang].name)
        await expect(button).toBeVisible()
        await expect(button.locator('svg')).toBeVisible()
        // innerText leaves out the hidden tooltip: nothing else is written on the button.
        expect(await button.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('')
        await expect(button).not.toHaveAttribute('title')
      }
    })

    test('each button shows its tooltip on hover and on Tab focus', async ({ page }) => {
      const reader = await new Library(page).open(BOOK)

      for (const b of BUTTONS) {
        const button = reader.barButton(b[lang].name)
        const tip = reader.barTip(button)
        await expect(tip).toBeHidden()
        await button.hover()
        await expect(tip).toBeVisible()
        await expect(tip).toHaveText(b[lang].tip)
        await pointAtBook(page)
        await expect(tip).toBeHidden()
      }

      // Keyboard: the back button is the first stop in the page, the panel buttons follow.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      let previous: Locator | null = null
      for (const b of BUTTONS) {
        const button = reader.barButton(b[lang].name)
        await page.keyboard.press('Tab')
        await expect(button).toBeFocused()
        await expect(reader.barTip(button)).toBeVisible()
        await expect(reader.barTip(button)).toHaveText(b[lang].tip)
        // Tab moved focus off the previous button, which hides its tooltip.
        if (previous) await expect(reader.barTip(previous)).toBeHidden()
        previous = button
      }
      await page.keyboard.press('Tab')
      if (previous) await expect(reader.barTip(previous)).toBeHidden()
    })
  })
}

test('Highlights keeps its count in the name and as a badge on the icon', async ({ page }) => {
  const reader = await new Library(page).open(BOOK)
  await reader.highlightWithNote('吾輩は猫である', 'a note')
  const button = reader.barButton('Highlights 1')
  await expect(button).toBeVisible()
  expect(await button.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('1')
  await button.hover()
  await expect(reader.barTip(button)).toHaveText('Highlights')
})

test('a button whose panel is open is marked active', async ({ page }) => {
  const reader = await new Library(page).open(BOOK)
  const contents = reader.barButton('Contents')
  await expect(contents).not.toHaveClass(/\bactive\b/)
  await reader.showToc()
  await expect(contents).toHaveClass(/\bactive\b/)
  await reader.barButton('Aa Display').click()
  await expect(contents).not.toHaveClass(/\bactive\b/)
  await expect(reader.barButton('Aa Display')).toHaveClass(/\bactive\b/)
})

test('the back button returns to the library', async ({ page }) => {
  const library = new Library(page)
  const reader = await library.open(BOOK)
  await reader.barButton('Back to library').click()
  await expect(library.card(BOOK)).toBeVisible()
  await expect(page.locator('.reader')).toHaveCount(0)
})

for (const lang of ['en', 'ja'] as const) {
  for (const width of [900, 1200]) {
    test.describe(`${lang} UI at ${width}px`, () => {
      test.use({
        locale: lang === 'en' ? 'en-US' : 'ja-JP',
        viewport: { width, height: 800 }
      })

      test('every tooltip lies inside the window', async ({ page }) => {
        const reader = await new Library(page).open(BOOK)
        // A highlight widens the Highlights button with its badge (the page objects add it
        // through the English UI, so only there).
        if (lang === 'en') await reader.highlightWithNote('吾輩は猫である', 'a note')
        for (const b of BUTTONS) {
          const button = reader.barButton(
            b.en.name === 'Highlights' ? new RegExp(`^${b[lang].name}`) : b[lang].name
          )
          const tip = reader.barTip(button)
          await button.hover()
          await expect(tip).toBeVisible()
          await expectInsideViewport(page, tip, `the tooltip of ${b[lang].name}`)
        }
      })
    })
  }
}
