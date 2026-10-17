// Ask AI panel against the mock backend: consent and download, missing key,
// key storage, streaming, Stop, and the conversation surviving panel switches.
import { expect, test } from '@playwright/test'
import { Assistant, Library } from '../../support/pages.ts'

test('Ask AI flow with the mock backend', async ({ page }) => {
  await page.goto('/?rafShim=1')
  await page.evaluate(() => localStorage.clear())
  const reader = await new Library(page).open('Leafbound サンプル')
  const ai = new Assistant(page)
  await ai.open()

  // First use: download only after consent; the input waits for the model.
  await expect(ai.input).toBeDisabled()
  await ai.panel.getByRole('button', { name: 'Download and set up' }).click()
  await expect(ai.panel.locator('progress')).toBeVisible()
  await expect(ai.input).toBeEnabled()
  await expect(ai.panel.locator('.ai-progress')).toHaveCount(0)
  await expect(ai.panel.getByText('No Anthropic API key is set.')).toBeVisible()

  // Without a key the error is translated and the question is kept.
  await ai.input.fill('Who is the narrator?')
  await ai.input.press('Enter')
  await expect(ai.panel.locator('.ai-error')).toContainText('API key')
  await expect(ai.input).toHaveValue('Who is the narrator?')

  // Store a key: the field is cleared, the status says saved.
  await ai.panel.getByRole('button', { name: 'AI settings' }).click()
  const keyField = ai.panel.getByLabel('API key')
  await keyField.fill('sk-x')
  await keyField.press('Enter')
  await expect(ai.panel.locator('h3 .value', { hasText: 'Saved' })).toBeVisible()
  await expect(keyField).toHaveValue('')
  await ai.panel.getByRole('button', { name: 'Done' }).click()

  // Streaming, then Stop discards the partial answer without an error.
  await ai.input.press('Enter')
  await expect(ai.stopButton).toBeVisible()
  await expect(ai.panel.locator('.ai-answer').first()).not.toBeEmpty()
  await ai.stopButton.click()
  await expect(ai.stopButton).toHaveCount(0)
  await expect(ai.turns).toHaveCount(0)
  await expect(ai.panel.locator('.ai-error')).toHaveCount(0)

  // A full answer, kept when switching to another panel and back.
  await ai.input.press('Enter')
  await expect(ai.turns).toHaveCount(1)
  await expect(ai.stopButton).toHaveCount(0)
  await reader.barButton('Contents').click()
  await reader.barButton('Ask AI').click()
  await expect(ai.turns).toHaveCount(1)
})
