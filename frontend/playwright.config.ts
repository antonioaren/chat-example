import { defineConfig } from '@playwright/test'

// Prerequisite: Docker infra must be running (`pnpm docker:dev` from repo
// root) — DynamoDB Local + Redis. The web servers below are started
// automatically if not already running (and reused if they are).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      // Backend API + queue worker. The worker has no port of its own, so it
      // rides alongside the server command; readiness is gated on the API URL.
      // Jobs enqueued before the worker is up simply wait in Redis.
      command:
        "sh -c 'pnpm --filter @chat-example/backend dev:worker & exec pnpm --filter @chat-example/backend dev'",
      cwd: '..',
      url: 'http://localhost:4000/graphql',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @chat-example/frontend dev',
      cwd: '..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
