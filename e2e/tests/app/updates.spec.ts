// Update checks in the real app against the fake update server (support/fake-updates.ts).
// Installing a real update is checked by hand with an installed test build (see the PR
// for issue #19); here only what must not install: nothing offered, the server down, and
// a download that does not match its signature.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../../support/app.ts'
import { appData, root } from '../../support/env.ts'
import { TEST_UPDATE_VERSION } from '../../support/fake-updates.ts'
import { Library, Updates } from '../../support/pages.ts'

const BOOK = '古本屋のミケ'
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const latestJson = (requests: string[]) => requests.filter((r) => r === '/latest.json').length

test('checks for updates at startup at most once a day, quietly when there is none', async ({
  app
}) => {
  const updates = new Updates(app.page)
  await expect(new Library(app.page).card(BOOK)).toBeVisible()
  await expect.poll(() => latestJson(app.updates.requests)).toBe(1)
  await expect.poll(() => app.log()).toContain('update: up to date')
  await expect(updates.dialog).toHaveCount(0)
  await expect(updates.status).toBeHidden()
  await expect(app.page.getByText(`Version ${appVersion}`)).toBeVisible()

  // Within a day: no request.
  await app.relaunch()
  await expect(new Library(app.page).card(BOOK)).toBeVisible()
  await expect.poll(() => app.log()).toContain('update: no automatic check, the last one was at')
  expect(latestJson(app.updates.requests)).toBe(1)

  // A day later: checked again.
  const dayAgo = new Date(Date.now() - 25 * 3600_000).toISOString()
  await app.relaunch(() =>
    writeFileSync(join(appData, 'update-check.json'), JSON.stringify({ lastCheckedAt: dayAgo }))
  )
  await expect(new Library(app.page).card(BOOK)).toBeVisible()
  await expect.poll(() => latestJson(app.updates.requests)).toBe(2)

  // The manual check always asks (relaunch replaced the page).
  const again = new Updates(app.page)
  await again.check()
  await expect(again.status).toHaveText('Leafbound is up to date.')
  expect(latestJson(app.updates.requests)).toBe(3)
})

test.describe('update server unreachable', () => {
  test.use({ updateMode: 'down' })

  test('starts normally and only logs the error; the manual check reports it', async ({ app }) => {
    const updates = new Updates(app.page)
    const library = new Library(app.page)
    await expect(library.card(BOOK)).toBeVisible()
    await expect.poll(() => app.log()).toContain('update: check failed')
    await expect(updates.dialog).toHaveCount(0)
    await expect(app.page.getByRole('alert')).toHaveCount(0)
    await expect(updates.status).toBeHidden()

    await updates.check()
    await expect(updates.status).toHaveText('Couldn’t check for updates.')
    await library.open(BOOK)
  })
})

test.describe('tampered update', () => {
  test.use({ updateMode: 'tampered' })

  test('shows the update and rejects a download that does not match its signature', async ({
    app
  }) => {
    const updates = new Updates(app.page)
    await expect(updates.dialog).toBeVisible()
    await expect(updates.dialog).toContainText(
      `Leafbound ${TEST_UPDATE_VERSION} is available. You have ${appVersion}.`
    )
    await expect(updates.dialog.getByRole('region', { name: 'What’s new' })).toContainText(
      '• e2e: a test release (#19)'
    )

    await updates.installButton.click()
    await expect(updates.dialog.getByRole('alert')).toContainText(
      'The update couldn’t be installed.'
    )
    expect(app.updates.requests).toContain(`/Leafbound_${TEST_UPDATE_VERSION}_x64-setup.exe`)
    await expect.poll(() => app.log()).toMatch(/update: install failed: .*signature/i)

    // Still running and usable.
    await updates.laterButton.click()
    await expect(updates.dialog).toHaveCount(0)
    await new Library(app.page).open(BOOK)
  })
})
