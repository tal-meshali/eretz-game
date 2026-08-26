import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5199/eretz-game/' },
  webServer: {
    command: 'VITE_USE_EMULATOR=1 npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/eretz-game/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
