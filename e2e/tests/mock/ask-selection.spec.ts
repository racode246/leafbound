// "Ask AI" in the selection menu: the Ask AI panel opens with the selection quoted in
// the input, in both reading directions. Sending it is checked against the fake LLM in
// e2e/tests/app/assistant.spec.ts.
import { expect, test } from '@playwright/test'
import { Assistant, Library } from '../../support/pages.ts'

const P1 =
  '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。 (1-1)'

test.beforeEach(async ({ page }) => {
  // rafShim keeps epub.js running in a headless/background page (src/devShim.ts).
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
})

for (const flow of ['Paged (horizontal)', 'Scroll (vertical)'] as const) {
  test(`Ask AI from the selection menu quotes the selection (${flow})`, async ({ page }) => {
    const reader = await new Library(page).open('Leafbound サンプル')
    if (flow !== 'Paged (horizontal)') await reader.setFlow(flow)
    // The page-turn edges exist only in the paged layout.
    await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(
      flow === 'Paged (horizontal)' ? 1 : 0
    )
    const ai = new Assistant(page)

    await reader.selectParagraph('(1-1)')
    await expect(reader.selectionMenu.getByRole('button', { name: 'Ask AI' })).toBeVisible()
    await reader.askAboutSelection()
    await expect(ai.panel).toBeVisible()
    await expect(ai.input).toHaveValue(`"${P1}" — `)

    // With the panel open, asking again keeps it open and adds the quote on a new line.
    await reader.selectParagraph('(1-2)')
    await reader.askAboutSelection()
    await expect(ai.panel).toBeVisible()
    await expect(ai.input).toHaveValue(`"${P1}" —\n"${P1.replace('(1-1)', '(1-2)')}" — `)
  })
}
