# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server with watch (tsx), http://localhost:4000/graphql (GraphiQL enabled)
npm run build        # tsc → dist/
npm start            # run compiled dist/server.js
npm test             # vitest run (all tests once)
npx vitest run test/db/messagesRepo.test.ts   # single test file
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit via tsconfig.typecheck.json (includes test/, unlike build)
```

`PORT` env var overrides the default port 4000. Use GraphiQL at the endpoint above for interactive queries and subscriptions.

## Architecture

Minimal GraphQL chat API on GraphQL Yoga + Node 20+, TypeScript ESM (`"type": "module"`, NodeNext resolution — internal imports must use `.js` extensions). Strict mode is on and `noEmitOnError` is set, so type errors fail the build.

Layering (each file imports only from the layer below):

- `src/server.ts` — Node `http` bootstrap; only place that touches the network.
- `src/app.ts` — exports the Yoga instance without listening, so tests can call `yoga.fetch()` in-memory (see `test/app.test.ts`) with no real HTTP.
- `src/schema.ts` — SDL + resolvers. The GraphQL `MessageStatus` enum uses UPPERCASE names mapped to the store's lowercase internal values via the `MessageStatus` resolver map. `sendMessage` enqueues a `send-message` BullMQ job; status progression queued → sent → delivered happens via delayed jobs on the `message-status` queue, processed by a separate worker process.
- `src/services.ts` — messaging-provider seam (Twilio stand-in); enqueues onto `messageQueue` instead of writing directly.
- `src/store.ts` — pubsub only (`createPubSub`), used by `onMessageUpdate`.
- `src/db/` — DynamoDB persistence: `client.ts` (SDK client), `bootstrap.ts` (`ensureTableExists`, gated by `DYNAMODB_AUTO_CREATE_TABLE`), `messagesRepo.ts` (single-table repo: PK=`CONVERSATION#<id>`, SK=`METADATA` or `MESSAGE#<createdAtISO>#<messageId>`).
- `src/queue/` — BullMQ: `messageQueue`/`statusQueue` (producers), `messageWorker`/`statusWorker` (consumers), `index.ts` (`startWorkers()`). Run via the separate `src/worker.ts` process (`pnpm dev:worker`), not in-process with the server.
- `src/types.ts` — domain types.

Requires Docker services (`pnpm docker:up` from repo root) and a `backend/.env` (copy from `backend/env.example`) before `pnpm dev` or `pnpm dev:worker`.

Key invariants:

- `Message` is a discriminated union on `status`: `delivered` requires `deliveredAt`, `failed` requires `error`. Status changes go through `messagesRepo.updateMessageStatus` with a `StatusPatch` union — never mutate `status` directly, or the union guarantees break. Switches over these unions end with a `never` exhaustiveness check.
- Real-time updates use Yoga's `createPubSub` with topic `message-{conversationId}`. Only `statusWorker` publishes (on `sent`/`delivered`/`failed`); `messageWorker`'s initial `queued` persist does not, preserving "queued invisible to peers" until the first status advance. `onMessageUpdate` resolves the payload as-is.
- Resolver errors on nullable fields (e.g. `Query.conversation`) surface as `data.conversation: null` plus an `errors` entry — tests assert on the field, not on `data` itself.

## Tests

Vitest, two tiers. Default `npm test` runs the unit tier only (`vitest.config.ts` excludes `test/integration/**`) — no Docker required: `test/app.test.ts` exercises the full GraphQL layer through `yoga.fetch()` with the DB/queue mocked; `test/db/messagesRepo.test.ts` and `test/queue/messageWorker.test.ts` mock the AWS SDK client and BullMQ respectively; `test/services.test.ts` mocks `messageQueue.add`. `npm run test:integration` runs `test/integration/**` against real DynamoDB Local + Redis (`vitest.integration.config.ts`) — requires `pnpm docker:up` first.

## Notes

- The GraphQL `MessageStatus` enum resolver map in `src/schema.ts` is the `MESSAGE_STATUS` constant from `src/types.ts` — keep it as the single source of truth for status values.
