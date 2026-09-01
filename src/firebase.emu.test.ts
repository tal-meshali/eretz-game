import { expect, test, vi } from 'vitest'

process.env.VITE_USE_EMULATOR = '1'

test('watchUser signs persisted anonymous sessions out instead of reporting them', async () => {
  const { auth, watchUser } = await import('./firebase')
  const { signInAnonymously } = await import('firebase/auth')

  const seen: (object | null)[] = []
  const stop = watchUser((u) => seen.push(u))

  // Simulates a session persisted before the Google-only switch.
  await signInAnonymously(auth)

  await vi.waitFor(() => expect(auth.currentUser).toBeNull())
  stop()
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((u) => u === null)).toBe(true)
})
