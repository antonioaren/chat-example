# AGENTS.md

Guidance for AI coding agents working in this repository.

## Repository layout

pnpm workspace with two packages:

- `frontend/` — Vite 8 + React 19 + TypeScript 6 chat UI
- `backend/` — GraphQL Yoga + Node 20 chat API, TypeScript ESM

Each package has its own `CLAUDE.md` with deeper detail; read the one for the package you are changing.

## Commands

Run from the repo root:

```bash
pnpm install         # install all workspace deps
pnpm dev             # both apps in parallel
pnpm dev:frontend    # Vite dev server
pnpm dev:backend     # http://localhost:4000/graphql (GraphiQL)
pnpm build           # build all packages
pnpm test            # backend tests (Vitest)
pnpm lint            # frontend lint (Oxlint)
```

Backend-only (run in `backend/`):

```bash
npm run typecheck                    # tsc --noEmit, includes test/
npm run test:watch                   # Vitest watch mode
npx vitest run test/store.test.ts    # single test file
```

## Backend rules

- TypeScript ESM with NodeNext resolution — internal imports **must use `.js` extensions**.
- Strict mode + `noEmitOnError`: type errors fail the build. Run `npm run typecheck` after changes (it covers `test/`, unlike `build`).
- Layering (each file imports only from the layer below): `server.ts` → `app.ts` → `schema.ts` → `services.ts` → `store.ts` → `types.ts`. `server.ts` is the only place that touches the network; tests go through `yoga.fetch()` in-memory.
- `Message` is a discriminated union on `status`: `delivered` requires `deliveredAt`, `failed` requires `error`. Never mutate `status` directly — go through `updateStatus` with a `StatusPatch`. Keep `never` exhaustiveness checks in switches over these unions.
- `MESSAGE_STATUS` in `src/types.ts` is the single source of truth for status values; the GraphQL `MessageStatus` enum resolver map uses it (UPPERCASE GraphQL names → lowercase internal values).
- `Conversation` is the aggregate root and owns its messages — all reads/writes go through the conversation. Store is seeded with `conversation-1`.
- Real-time updates: Yoga `createPubSub`, topic `message-{conversationId}`. Both `addMessage` and `updateStatus` publish.

## Frontend rules

- Path alias `@/*` → `src/*` (in `tsconfig.app.json` and `vite.config.ts`).
- One-way data flow: `stubs/chatService.ts` → `hooks/useChat.ts` → `pages/ChatPage.tsx` → `components/chat/*`.
- All chat state lives in `hooks/useChat.ts` (fetch, optimistic sends, retry, status polling). Components stay presentational — do not move state logic into components.
- The stub layer (`src/stubs/`) is an intentional boundary, designed to be swapped for real API calls. Keep that boundary intact.
- No test runner is configured for the frontend.

## Testing expectations

- Backend changes need tests: `test/app.test.ts` covers the GraphQL layer end-to-end via `yoga.fetch()` (no real HTTP, no store mocks); `store.test.ts` and `services.test.ts` unit-test their layers directly.
- Run `pnpm test` and `npm run typecheck` (in `backend/`) before considering a backend change done.
- Run `pnpm lint` before considering a frontend change done.

## Conventions

- Conventional commit messages (`feat:`, `fix:`, `chore:`, ...). No AI attribution or Co-Authored-By trailers.
- Do not commit or push unless explicitly asked.
- Stage specific files — never `git add -A` or `git add .`.
- Keep diffs minimal: change only what the task requires, no drive-by refactors.
