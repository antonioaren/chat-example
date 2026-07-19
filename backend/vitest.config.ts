import { defineConfig } from 'vitest/config'

// Default `pnpm test` stays fast/mocked, no Docker required.
// `test/integration/**` is opt-in only, run via `pnpm test:integration`.
export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'dist/**', 'test/integration/**'],
  },
})
