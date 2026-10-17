// Update check and dialog against the mock backend. localStorage.lbMockUpdate (read by
// src/lib/mockApi.ts) picks what the fake update server says; it is set before the app
// loads because the automatic check runs at startup.
import { expect, test, type Page } from '@playwright/test'
import { Library, Updates } from '../../support/pages.ts'

async function start(page: Page, mode: 'available' | 'badSignature' | 'checkError' | null) {
  if (mode) await page.addInitScript((m) => localStorage.setItem('lbMockUpdate', m), mode)
  await page.goto('/?rafShim=1')
  await expect(new Library(page).card('Leafbound サンプル')).toBeVisible()
  return new Updates(page)
}

test('with no update nothing is shown at startup; the manual check says so', async ({ page }) => {
  const updates = await start(page, null)
  await expect(page.getByText('Version 0.0.0-mock')).toBeVisible()
  await expect(updates.checkButton).toBeEnabled()
  await expect(updates.dialog).toHaveCount(0)
  await expect(updates.status).toBeHidden()

  await updates.check()
  await expect(updates.status).toHaveText('Leafbound is up to date.')
  await expect(updates.dialog).toHaveCount(0)
})

test('an update found at startup shows the version and notes, and installs on confirmation', async ({
  page
}) => {
  const updates = await start(page, 'available')
  await expect(updates.dialog).toBeVisible()
  await expect(updates.dialog).toContainText('Leafbound 9.9.9 is available. You have 0.0.0-mock.')
  // The release-please Markdown is shown as plain text.
  const notes = updates.dialog.getByRole('region', { name: 'What’s new' })
  await expect(notes).toContainText('• reader: a mock feature (#99)')
  await expect(notes).not.toContainText('](')
  await expect(updates.installButton).toBeFocused()

  // Later closes it; the manual check finds the update again.
  await updates.laterButton.click()
  await expect(updates.dialog).toHaveCount(0)
  await updates.check()
  await expect(updates.dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(updates.dialog).toHaveCount(0)
  await updates.check()

  // Download progress, then the installer takes over (the mock never returns, like the app).
  await updates.installButton.click()
  await expect(updates.installButton).toBeDisabled()
  await expect(updates.laterButton).toBeDisabled()
  await expect(updates.dialog.getByRole('status')).toContainText(
    'Installing… Leafbound will restart when it is done.'
  )
  await page.keyboard.press('Escape')
  await expect(updates.dialog).toBeVisible()
  await expect(updates.checkButton).toBeDisabled()
})

test('a rejected download is reported in the dialog and can be closed', async ({ page }) => {
  const updates = await start(page, 'badSignature')
  await updates.installButton.click()
  const alert = updates.dialog.getByRole('alert')
  await expect(alert).toContainText('The update couldn’t be installed.')
  await expect(alert).toContainText('signature')
  await expect(updates.installButton).toBeEnabled()
  await updates.laterButton.click()
  await expect(updates.dialog).toHaveCount(0)
  // The app is still usable.
  await new Library(page).open('Leafbound サンプル')
})

test('a failed check is silent at startup and short when checking by hand', async ({ page }) => {
  const updates = await start(page, 'checkError')
  await expect(updates.status).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await updates.check()
  await expect(updates.status).toHaveText('Couldn’t check for updates.')
  await expect(updates.status.locator('[title]')).toHaveAttribute('title', /example\.invalid/)
  await expect(updates.dialog).toHaveCount(0)
})

test.describe('Japanese UI', () => {
  test.use({ locale: 'ja-JP' })

  test('shows the update dialog in Japanese', async ({ page }) => {
    await start(page, 'available')
    const dialog = page.getByRole('dialog', { name: 'アップデートがあります' })
    await expect(dialog).toContainText('Leafbound 9.9.9 が利用できます')
    await expect(dialog.getByRole('button', { name: 'インストールして再起動' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'アップデートを確認' })).toBeVisible()
  })
})
