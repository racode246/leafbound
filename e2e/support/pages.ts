// Page objects shared by the mock and app projects. Locators use roles and labels
// where the UI has them; the rest (epub.js internals, cards) stays in here. They
// assume the English UI.
import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test'

export class Library {
  constructor(readonly page: Page) {}

  card(title: string): Locator {
    return this.page.locator('.card', { hasText: title })
  }

  /** Adds a book through the "+ Add EPUB" file picker (mock: the card title is the file name). */
  async add(path: string, title: string): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser')
    await this.page.getByRole('button', { name: '+ Add EPUB' }).click()
    await (await chooser).setFiles(path)
    await expect(this.card(title)).toBeVisible()
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
    // Scrolled flow shows several chapter iframes at once.
    await expect(this.page.locator('.reader-view iframe').first()).toBeVisible()
    await expect(this.page.locator('.reader-overlay')).toHaveCount(0)
  }

  /** Shows the Display panel (the title bar button toggles it). */
  async display(): Promise<Locator> {
    const panel = this.panel('Display')
    if (!(await panel.isVisible())) await this.barButton('Aa Display').click()
    await expect(panel).toBeVisible()
    return panel
  }

  /** Switches the reading direction in the Display panel and waits for the new rendition. */
  async setFlow(name: 'Paged (horizontal)' | 'Scroll (vertical)'): Promise<void> {
    const panel = await this.display()
    await panel.getByRole('button', { name, exact: true }).click()
    await this.waitUntilShown()
  }

  /** Picks a font in the Display panel by the option's label. */
  async setFont(label: string): Promise<void> {
    const panel = await this.display()
    await panel
      .locator('section', { has: this.page.getByRole('heading', { name: 'Font', exact: true }) })
      .getByRole('combobox')
      .selectOption({ label })
  }

  /** Searches the book and returns the hit buttons. */
  async search(query: string): Promise<Locator> {
    const panel = this.panel('Search in book')
    if (!(await panel.isVisible())) await this.barButton('Search').click()
    await panel.getByRole('searchbox').fill(query)
    await panel.getByRole('searchbox').press('Enter')
    const hits = panel.locator('.search-hit')
    await expect(hits.first()).toBeVisible({ timeout: 60_000 })
    return hits
  }

  /** A title bar button; pass a RegExp when the name carries a badge ("Highlights 1"). */
  barButton(name: string | RegExp): Locator {
    return this.page
      .locator('.titlebar')
      .getByRole('button', typeof name === 'string' ? { name, exact: true } : { name })
  }

  /** The tooltip of a title bar button (hidden from screen readers, so not found by role). */
  barTip(button: Locator): Locator {
    return button.locator('.bar-tip')
  }

  panel(name: string): Locator {
    return this.page.getByRole('complementary', { name })
  }

  /** Shows a side panel through its title bar button (the buttons toggle, so only if hidden). */
  async showPanel(button: string | RegExp, name: string): Promise<Locator> {
    const panel = this.panel(name)
    if (!(await panel.isVisible())) await this.barButton(button).click()
    await expect(panel).toBeVisible()
    return panel
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

  get toc(): Locator {
    return this.panel('Table of contents')
  }

  tocEntry(title: string): Locator {
    return this.toc.getByRole('button', { name: title, exact: true })
  }

  /** Entries marked as the reading position (there should be exactly one). */
  get currentTocEntries(): Locator {
    return this.toc.locator('[aria-current="location"]')
  }

  async showToc(): Promise<Locator> {
    return this.showPanel('Contents', 'Table of contents')
  }

  /** Opens a chapter from the Contents panel (which closes it). */
  async openChapter(title: string): Promise<void> {
    await this.showToc()
    await this.tocEntry(title).click()
    await expect(this.chapter).toContainText(title)
  }

  /** Selects a whole paragraph of the shown chapter (selection menu appears). */
  async selectParagraph(startsWith: string): Promise<void> {
    await this.content
      .locator('p', { hasText: startsWith })
      .first()
      .evaluate((p) => {
        const doc = p.ownerDocument
        const range = doc.createRange()
        range.selectNodeContents(p)
        const sel = doc.getSelection()
        if (!sel) throw new Error('the chapter document has no selection')
        sel.removeAllRanges()
        sel.addRange(range)
        doc.dispatchEvent(new Event('selectionchange'))
      })
    await expect(this.selectionMenu).toBeVisible()
  }

  /** The bubble over a text selection (highlight colours, Note, Ask AI). */
  get selectionMenu(): Locator {
    return this.page.getByRole('toolbar')
  }

  /** "Ask AI" in the selection menu: opens the Ask AI panel with the selection quoted. */
  async askAboutSelection(): Promise<void> {
    await this.selectionMenu.getByRole('button', { name: 'Ask AI', exact: true }).click()
    await expect(this.selectionMenu).toBeHidden()
  }

  /** Highlights a paragraph through the selection menu and adds a note. */
  async highlightWithNote(startsWith: string, note: string): Promise<void> {
    await this.selectParagraph(startsWith)
    await this.selectionMenu.getByRole('button', { name: 'Note' }).click()
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
    return this.panel.getByRole('textbox', {
      name: 'Ask a question (Enter to send, Shift+Enter for a new line)'
    })
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
    await expect
      .poll(async () => (await consent.isVisible()) || (await this.input.isEnabled()), {
        timeout: 60_000
      })
      .toBe(true)
    if (await consent.isVisible()) await consent.click()
    await expect(this.input).toBeEnabled({ timeout: 600_000 })
    await expect(this.panel.locator('.ai-progress')).toHaveCount(0, { timeout: 600_000 })
  }

  /** Stores an API key through the AI settings view and returns to the conversation. */
  async saveKey(key: string): Promise<void> {
    await this.open()
    await this.panel.getByRole('button', { name: 'AI settings' }).click()
    const keyField = this.panel.getByLabel('API key')
    await keyField.fill(key)
    await keyField.press('Enter')
    await expect(this.panel.locator('h3 .value', { hasText: 'Saved' })).toBeVisible()
    await this.panel.getByRole('button', { name: 'Done' }).click()
  }

  /** Sends a question and waits for the answer to finish. */
  async ask(question: string): Promise<void> {
    await this.open()
    await this.input.fill(question)
    await this.send()
  }

  /** Sends what is in the input (Enter) and waits for the answer to finish. */
  async send(): Promise<void> {
    const before = await this.turns.count()
    await this.input.press('Enter')
    await expect(this.input).toHaveValue('')
    await expect(this.stopButton).toHaveCount(0, { timeout: 60_000 })
    await expect(this.panel.locator('.ai-error')).toHaveCount(0)
    await expect(this.turns).toHaveCount(before + 1)
  }
}

/** Update check in the library sidebar and the "Update available" dialog. */
export class Updates {
  constructor(readonly page: Page) {}

  get checkButton(): Locator {
    return this.page.getByRole('button', { name: 'Check for updates' })
  }

  /** The result of the manual check, under the button. */
  get status(): Locator {
    return this.page.locator('.sidebar').getByRole('status')
  }

  get dialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Update available' })
  }

  get installButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Install and restart' })
  }

  get laterButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Later' })
  }

  async check(): Promise<void> {
    await this.checkButton.click()
  }
}
