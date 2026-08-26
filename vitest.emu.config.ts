import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.emu.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
})
