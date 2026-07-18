# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server with watch (tsx), http://localhost:4000/graphql (GraphiQL enabled)
npm run build        # tsc → dist/
npm start            # run compiled dist/server.js
npm test             # vitest run (all tests once)
npx vitest run test/store.test.ts   # single test file
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit via tsconfig.typecheck.json (includes test/, unlike build)
```

`PORT` env var overrides the default port 4000. Use GraphiQL at the endpoint above for interactive queries and subscriptions.

## Architecture

Minimal GraphQL chat API on GraphQL Yoga + Node 20+, TypeScript ESM (`"type": "module"`, NodeNext resolution — internal imports must use `.js` extensions). Strict mode is on and `noEmitOnError` is set, so type errors fail the build.

Layering (each file imports only from the layer below):

- `src/server.ts` — Node `http` bootstrap; only place that touches the network.
- `src/app.ts` — exports the Yoga instance without listening, so tests can call `yoga.fetch()` in-memory (see `test/app.test.ts`) with no real HTTP.
- `src/schema.ts` — SDL + resolvers. The GraphQL `MessageStatus` enum uses UPPERCASE names mapped to the store's lowercase internal values via the `MessageStatus` resolver map. `sendMessage` simulates a provider with `setTimeout`s that advance status queued → sent → delivered.
- `src/services.ts` — messaging-provider seam (Twilio stand-in); delegates persistence to the store.
- `src/store.ts` — in-memory state. `Conversation` is the aggregate root and owns its messages (there is no standalone messages map); all reads/writes go through the conversation. Seeded with `conversation-1`.
- `src/types.ts` — domain types.

Key invariants:

- `Message` is a discriminated union on `status`: `delivered` requires `deliveredAt`, `failed` requires `error`. Status changes go through `updateStatus` with a `StatusPatch` union — never mutate `status` directly, or the union guarantees break. Switches over these unions end with a `never` exhaustiveness check.
- Real-time updates use Yoga's `createPubSub` with topic `message-{conversationId}`; both `addMessage` and `updateStatus` publish, and the `onMessageUpdate` subscription resolves the payload as-is.
- Resolver errors on nullable fields (e.g. `Query.conversation`) surface as `data.conversation: null` plus an `errors` entry — tests assert on the field, not on `data` itself.

## Tests

Vitest. `test/app.test.ts` exercises the full GraphQL layer through `yoga.fetch()`; `store.test.ts` and `services.test.ts` unit-test the layers directly. No network or mocks of the store needed.

## Notes

- The GraphQL `MessageStatus` enum resolver map in `src/schema.ts` is the `MESSAGE_STATUS` constant from `src/types.ts` — keep it as the single source of truth for status values.
