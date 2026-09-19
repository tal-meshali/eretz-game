import { expect, test, type Page } from '@playwright/test'

/* The solo path: no Google popup, no Firebase, no emulator. It covers the
   client-side loop — lobby, round, guess, reveal, scoring, the podium — and
   that the map draws. It does NOT cover the RTDB writes, the rules, presence
   or host migration, which only smoke.spec.ts reaches. */

const ROUNDS = 3 // the floor Landing validates: rounds >= 3, seconds >= 10

/** Guessing immediately is what keeps this spec short: `shouldClose` fires
 *  once every online player has guessed, and solo has exactly one. */
async function guessAndConfirm(page: Page): Promise<void> {
  await page.locator('.map').click()
  await expect(page.getByText('נקודה סומנה · ניתן לתקן עד לאישור')).toBeVisible()
  await page.getByRole('button', { name: 'אישור' }).click()
}

test('a solo game plays through to the podium', async ({ page }) => {
  const detail = page.waitForResponse(
    (r) => r.url().endsWith('geo-detail.json') && r.status() === 200,
  )

  await page.goto('/')
  await page.getByRole('button', { name: 'משחק מקומי' }).click()

  await page.getByLabel('כינוי').fill('בודק')
  await page.getByLabel('סבבים', { exact: true }).fill(String(ROUNDS))
  await page.getByLabel('שניות לסבב', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'צור חדר' }).click()

  await expect(page.getByText('חדר המתנה')).toBeVisible()
  await page.getByRole('button', { name: 'התחל משחק' }).click()

  for (let round = 1; round <= ROUNDS; round++) {
    // The host engine holds the reveal open for REVEAL_MS (8s, derive.ts)
    // before advancing — solo's guess-triggered close only shortens the
    // GUESS half of a round, not this fixed reveal window. The default 5s
    // expect timeout is shorter than that wait, so every round after the
    // first needs the longer one here.
    await expect(page.getByText(`סבב ${round} / ${ROUNDS}`)).toBeVisible({ timeout: 12_000 })
    await expect(page.locator('.locality-name')).not.toBeEmpty()

    if (round === 1) {
      // The roadmap: the detail layer was fetched, and the plate's canvas
      // strata are on the map. Checked here, while RoundView's MapView is
      // mounted — FinalView (the podium) has no `.map` at all, so the same
      // assertion after the loop always finds zero elements regardless of
      // whether the map itself ever drew correctly.
      await detail
      await expect(page.locator('.map canvas.leaflet-zoom-animated')).toHaveCount(3)
    }

    await guessAndConfirm(page)

    // The round closes on the guess, not on the clock.
    await expect(page.getByText(`סבב ${round} · תוצאה`)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('table.scores tbody tr')).toHaveCount(1)
    await expect(page.locator('table.scores tbody td.num.muted')).toContainText('ק״מ')
  }

  // Same REVEAL_MS wait gates the last round's transition to the podium.
  await expect(page.locator('.crown')).toContainText('בודק', { timeout: 12_000 })
  await expect(page.locator('.podium .slot')).toHaveCount(1)
})
