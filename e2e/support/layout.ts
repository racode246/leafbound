// Checks that the app shell (html, body, #root) never scrolls sideways (issue #9).
// The shell has no scrollbar, but a box that is scrollable at all can still be
// moved by scrollIntoView(), focus changes or find-in-page, which leaves a blank
// strip along the right edge of the window.
import { expect, type Locator, type Page } from '@playwright/test'
import type { Reader } from './pages.ts'

type PerBox = Record<'html' | 'body' | 'root', number>

export interface Shell {
  /** How far each box's content reaches past its right edge (scrollWidth - clientWidth). */
  overflow: PerBox
  scrollLeft: PerBox
}

const ZERO: PerBox = { html: 0, body: 0, root: 0 }

/** The side panels of the reader: title bar button and the panel's accessible name. */
export const READER_PANELS: { button: string | RegExp; name: string }[] = [
  { button: 'Contents', name: 'Table of contents' },
  { button: 'Search', name: 'Search in book' },
  { button: /^Highlights/, name: 'Highlights & notes' },
  { button: 'Ask AI', name: 'Ask AI' },
  { button: 'Aa Display', name: 'Display' }
]

export function shellSideways(page: Page): Promise<Shell> {
  return page.evaluate(() => {
    // documentElement is also document.scrollingElement in standards mode.
    const boxes = {
      html: document.documentElement,
      body: document.body,
      root: document.getElementById('root')
    }
    const each = (f: (el: Element) => number) =>
      Object.fromEntries(
        Object.entries(boxes).map(([k, el]) => [k, el ? f(el) : Number.NaN])
      ) as PerBox
    return {
      overflow: each((el) => el.scrollWidth - el.clientWidth),
      scrollLeft: each((el) => el.scrollLeft)
    }
  })
}

/** Fails unless nothing in the shell is wider than the window or scrolled sideways. */
export async function expectShellFlat(page: Page, where: string): Promise<void> {
  expect(await shellSideways(page), `the shell fits the window (${where})`).toEqual({
    overflow: ZERO,
    scrollLeft: ZERO
  })
}

/**
 * Calls scrollIntoView() on `container` and every element inside it (the default
 * options and the ones that pull hardest sideways), then checks that no part of the
 * shell has been scrolled sideways.
 */
export async function expectScrollIntoViewKeepsShell(
  page: Page,
  container: Locator,
  where: string
): Promise<void> {
  const count = await container.evaluate((root) => {
    const all = [root, ...root.querySelectorAll('*')]
    for (const el of all) {
      el.scrollIntoView()
      el.scrollIntoView({ block: 'center', inline: 'center' })
      el.scrollIntoView({ block: 'end', inline: 'end' })
    }
    return all.length
  })
  expect(count, `elements to scroll into view (${where})`).toBeGreaterThan(0)
  const { scrollLeft } = await shellSideways(page)
  expect(scrollLeft, `the shell stays in place after scrollIntoView() in ${where}`).toEqual(ZERO)
}

/** Opens each reader panel in turn and checks the shell, also after scrollIntoView(). */
export async function expectReaderPanelsFlat(reader: Reader, width: number): Promise<void> {
  for (const { button, name } of READER_PANELS) {
    const panel = await reader.showPanel(button, name)
    await expectShellFlat(reader.page, `${name} panel at ${width}px`)
    await expectScrollIntoViewKeepsShell(reader.page, panel, `the ${name} panel at ${width}px`)
  }
}
