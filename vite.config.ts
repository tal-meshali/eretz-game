/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/eretz-game/',
  plugins: [react()],
  // 'hidden': emit .map files without a //# sourceMappingURL comment, so the
  // shipped JS is unchanged — check-bundle.mjs reads and then deletes them.
  build: { sourcemap: 'hidden' },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', 'e2e/**', '**/*.emu.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
})
