# chat-example

A small chat application sandbox: a React frontend and a GraphQL backend, organized as a pnpm workspace.

- **`frontend/`** — single-screen React chat UI built against an in-memory stub service (swappable for real API calls).
- **`backend/`** — minimal GraphQL chat API (queries, mutations, and real-time subscriptions) with an in-memory store.

> Note: on `main` the frontend talks to its own stub layer (`frontend/src/stubs/`), not the backend. Wiring them together via GraphQL + SSE is in progress ([PR #3](https://github.com/antonioaren/chat-example/pull/3)).

## Requirements

- Node.js >= 20
- pnpm >= 11

## Getting started

```bash
pnpm install

# Run both apps in parallel
pnpm dev

# Or individually
pnpm dev:frontend   # Vite dev server (HMR)
pnpm dev:backend    # http://localhost:4000/graphql (GraphiQL enabled)
```

Other root scripts:

```bash
pnpm build   # build all packages
pnpm test    # backend tests (Vitest)
pnpm lint    # frontend lint (Oxlint)
```

The backend port defaults to `4000`; override with the `PORT` env var.

## Project structure

```
chat-example/
├── frontend/          # Vite 8 + React 19 + TypeScript
│   └── src/
│       ├── components/   # presentational pieces (ChatWindow, MessageList, ...)
│       ├── hooks/        # useChat (all chat state), useCurrentUser
│       ├── pages/        # ChatPage
│       ├── stubs/        # fake async chat API (latency, failures, status transitions)
│       └── types/        # Message, conversation types
└── backend/           # GraphQL Yoga + Node http
    ├── src/
    │   ├── server.ts     # HTTP bootstrap
    │   ├── app.ts        # Yoga instance (network-free, testable via yoga.fetch())
    │   ├── schema.ts     # SDL + resolvers
    │   ├── services.ts   # messaging-provider seam (Twilio stand-in)
    │   ├── store.ts      # in-memory state, pubsub
    │   └── types.ts      # domain types
    └── test/             # Vitest suites
```

## How it works

**Message lifecycle.** A message moves through `queued → sent → delivered`, or ends in `failed`. The backend simulates a messaging provider with delayed status transitions; the frontend stub does the same (1s latency, 30% random failure, retry support).

**Backend API.** GraphQL schema exposes:

- `Query.conversation(id)` — fetch a conversation and its messages
- `Mutation.sendMessage(conversationId, body)` — send a message
- `Subscription.onMessageUpdate(conversationId)` — real-time status updates via pub/sub

Open GraphiQL at `http://localhost:4000/graphql` to explore interactively. The store is seeded with `conversation-1`.

**Frontend state.** All chat state lives in `useChat`: initial fetch, optimistic sends (temporary id replaced by the server message), failure marking with retry, and polling that reconciles pending message statuses.

## Testing

```bash
pnpm test                           # all backend tests
cd backend && npx vitest run test/store.test.ts   # single file
cd backend && npm run test:watch    # watch mode
```

`test/app.test.ts` exercises the full GraphQL layer in-memory through `yoga.fetch()` — no real HTTP. The frontend has no test runner configured.
