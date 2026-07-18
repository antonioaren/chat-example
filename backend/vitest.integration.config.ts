import { defineConfig } from 'vitest/config'

// Opt-in tier: `pnpm test:integration` (requires `pnpm docker:up` first).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
  },
})
