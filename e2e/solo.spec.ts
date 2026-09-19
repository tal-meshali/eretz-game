import { expect, test, type Page } from '@playwright/test'

/* The solo path: no Google popup, no Firebase, no emulator. It covers the
   client-side loop — lobby, round, guess, reveal, scoring, the podium. It does
   NOT cover the RTDB writes, the rules, presence or host migration, which only
   smoke.spec.ts reaches — nor the map rendering itself, which belongs with the
   roadmap work (see the note above the round loop below). */

const ROUNDS = 3 // the floor Landing validates: rounds >= 3, seconds >= 10

/** Guessing immediately is what keeps this spec short: `shouldClose` fires
 *  once every online player has guessed, and solo has exactly one. */
async function guessAndConfirm(page: Page): Promise<void> {
  await page.locator('.map').click()
  await expect(page.getByText('נקודה סומנה · ניתן לתקן עד לאישור')).toBeVisible()
  await page.getByRole('button', { name: 'אישור' }).click()
}

test('a solo game plays through to the podium', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'משחק מקומי' }).click()

  await page.getByLabel('כינוי').fill('בודק')
  await page.getByLabel('סבבים', { exact: true }).fill(String(ROUNDS))
  await page.getByLabel('שניות לסבב', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'צור חדר' }).click()

  await expect(page.getByText('חדר המתנה')).toBeVisible()
  await page.getByRole('button', { name: 'התחל משחק' }).click()

  // No map-rendering assertion in this spec: the roadmap layers it was
  // originally written against (the detail-JSON fetch, the plate's canvas
  // strata) are not part of this branch — they are unrelated, uncommitted
  // work-in-progress in the tree. Coupling a solo-mode test to that would
  // make this spec fail on a clean checkout; that coverage belongs with the
  // roadmap work itself when it lands.

  for (let round = 1; round <= ROUNDS; round++) {
    // The host engine holds the reveal open for REVEAL_MS (8s, derive.ts)
    // before advancing — solo's guess-triggered close only shortens the
    // GUESS half of a round, not this fixed reveal window. The default 5s
    // expect timeout is shorter than that wait, so every round after the
    // first needs the longer one here.
    await expect(page.getByText(`סבב ${round} / ${ROUNDS}`)).toBeVisible({ timeout: 12_000 })
    await expect(page.locator('.locality-name')).not.toBeEmpty()

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
