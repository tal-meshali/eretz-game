import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// Drives the Auth emulator's fake Google account chooser that opens in a popup.
async function signInWithGoogle(page: Page, ctx: BrowserContext): Promise<void> {
  const popupPromise = ctx.waitForEvent('page')
  await page.getByRole('button', { name: 'התחברות עם Google' }).click()
  const popup = await popupPromise
  // let the account list finish loading — clicking during its reflow can land
  // on an existing account instead of "Add new account"
  await popup.waitForLoadState('networkidle')
  await popup.getByText('Add new account').click()
  await popup.getByRole('button', { name: 'Auto-generate user information' }).click()
  await popup.getByRole('button', { name: /Sign in with Google/ }).click()
}

test('two players play a round end to end', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const guestCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const guest = await guestCtx.newPage()

  // Host signs in and creates a fast room
  await host.goto('/')
  await signInWithGoogle(host, hostCtx)
  await host.getByLabel('כינוי').fill('מארח')
  // exact: the stepper's −/+ buttons are labelled "הפחת סבבים"/"הוסף סבבים"
  await host.getByLabel('סבבים', { exact: true }).fill('3')
  await host.getByLabel('שניות לסבב', { exact: true }).fill('15')
  await host.getByRole('button', { name: 'צור חדר' }).click()
  await expect(host.getByText('חדר המתנה')).toBeVisible()
  const url = host.url()
  expect(url).toMatch(/#[A-Z]{4}$/)

  // Guest signs in and joins via the invite URL
  await guest.goto(url)
  await signInWithGoogle(guest, guestCtx)
  await guest.getByLabel('כינוי').fill('אורחת')
  await guest.getByRole('button', { name: 'הצטרפות' }).click()
  await expect(guest.getByText('חדר המתנה')).toBeVisible()
  await expect(host.getByText('אורחת')).toBeVisible({ timeout: 15_000 })

  // Host starts; both see a round
  await host.getByRole('button', { name: 'התחל משחק' }).click()
  await expect(host.getByText(/סבב 1 \/ 3/)).toBeVisible()
  await expect(guest.getByText(/סבב 1 \/ 3/)).toBeVisible()

  // Both click the middle of the map and confirm
  for (const page of [host, guest]) {
    await page.locator('.map').click({ position: { x: 200, y: 200 } })
    await page.getByRole('button', { name: 'אישור' }).click()
    await expect(page.getByText(/ההימור נקלט/)).toBeVisible()
  }

  // All guessed → reveal appears with a scores table on both screens
  await expect(host.locator('table.scores')).toBeVisible({ timeout: 15_000 })
  await expect(guest.locator('table.scores')).toBeVisible({ timeout: 15_000 })
  await expect(host.getByRole('cell', { name: 'מארח' })).toBeVisible()
  await expect(host.getByText(/ק״מ/).first()).toBeVisible()
})
