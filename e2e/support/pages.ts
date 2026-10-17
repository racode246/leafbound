// Page objects shared by the mock and app projects. Locators use roles and labels
// where the UI has them; the rest (epub.js internals, cards) stays in here. They
// assume the English UI.
import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test'

export class Library {
  constructor(readonly page: Page) {}

  card(title: string): Locator {
    return this.page.locator('.card', { hasText: title })
  }

  async open(title: string): Promise<Reader> {
    await this.card(title).locator('.card-cover').click()
    const reader = new Reader(this.page)
    await reader.waitUntilShown()
    return reader
  }
}

export class Reader {
  readonly content: FrameLocator

  constructor(readonly page: Page) {
    this.content = page.frameLocator('.reader-view iframe')
  }

  async waitUntilShown(): Promise<void> {
    await expect(this.page.locator('.reader-view iframe')).toBeVisible()
    await expect(this.page.locator('.reader-overlay')).toHaveCount(0)
  }

  /** A title bar button; pass a RegExp when the name carries a badge ("Highlights 1"). */
  barButton(name: string | RegExp): Locator {
    return this.page.locator('.titlebar').getByRole('button', typeof name === 'string' ? { name, exact: true } : { name })
  }

  panel(name: string): Locator {
    return this.page.getByRole('complementary', { name })
  }

  get chapter(): Locator {
    return this.page.locator('.reader-chapter')
  }

  get pageBox(): Locator {
    return this.page.getByLabel('Type a page number and press Enter (Ctrl+G)')
  }

  get seek(): Locator {
    return this.page.getByLabel('Reading position')
  }

  async pageNumber(): Promise<number> {
    return Number(await this.pageBox.inputValue())
  }

  async totalPages(): Promise<number> {
    return Number((await this.page.locator('.page-jump span').textContent())?.replace(/\D/g, ''))
  }

  async openChapter(title: string): Promise<void> {
    await this.barButton('Contents').click()
    await this.panel('Table of contents').getByRole('button', { name: title, exact: true }).click()
    await expect(this.chapter).toContainText(title)
  }

  /** Selects a whole paragraph of the shown chapter (selection menu appears). */
  async selectParagraph(startsWith: string): Promise<void> {
    await this.content.locator('p', { hasText: startsWith }).first().evaluate((p) => {
      const doc = p.ownerDocument
      const range = doc.createRange()
      range.selectNodeContents(p)
      const sel = doc.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      doc.dispatchEvent(new Event('selectionchange'))
    })
    await expect(this.page.getByRole('toolbar')).toBeVisible()
  }

  /** Highlights a paragraph through the selection menu and adds a note. */
  async highlightWithNote(startsWith: string, note: string): Promise<void> {
    await this.selectParagraph(startsWith)
    await this.page.getByRole('toolbar').getByRole('button', { name: 'Note' }).click()
    const editor = this.page.getByRole('dialog', { name: 'Edit' })
    await editor.locator('textarea').fill(note)
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toBeHidden()
  }
}

export class Assistant {
  readonly panel: Locator

  constructor(readonly page: Page) {
    this.panel = page.getByRole('complementary', { name: 'Ask AI' })
  }

  get input(): Locator {
    return this.panel.getByRole('textbox', { name: 'Ask a question (Enter to send, Shift+Enter for a new line)' })
  }

  get turns(): Locator {
    return this.panel.locator('.ai-turn')
  }

  get stopButton(): Locator {
    return this.panel.getByRole('button', { name: 'Stop', exact: true })
  }

  /** Shows the panel (the title bar button toggles, and other panels hide it). */
  async open(): Promise<void> {
    if (!(await this.panel.isVisible())) await new Reader(this.page).barButton('Ask AI').click()
    await expect(this.panel).toBeVisible()
  }

  /** Waits until the model is loaded and the book indexed; consents to the download if asked. */
  async waitUntilReady(): Promise<void> {
    const consent = this.panel.getByRole('button', { name: 'Download and set up' })
    // Without the model both the consent button and the (disabled) input are shown.
    await expect.poll(async () => (await consent.isVisible()) || (await this.input.isEnabled()), { timeout: 60_000 }).toBe(true)
    if (await consent.isVisible()) await consent.click()
    await expect(this.input).toBeEnabled({ timeout: 600_000 })
    await expect(this.panel.locator('.ai-progress')).toHaveCount(0, { timeout: 600_000 })
  }

  /** Sends a question and waits for the answer to finish. */
  async ask(question: string): Promise<void> {
    await this.open()
    const before = await this.turns.count()
    await this.input.fill(question)
    await this.input.press('Enter')
    await expect(this.input).toHaveValue('')
    await expect(this.stopButton).toHaveCount(0, { timeout: 60_000 })
    await expect(this.panel.locator('.ai-error')).toHaveCount(0)
    await expect(this.turns).toHaveCount(before + 1)
  }
}
