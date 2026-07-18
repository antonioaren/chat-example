# graph-chat

Minimal chat messaging API built with GraphQL Yoga, Node.js, and TypeScript. Messages move through a delivery lifecycle (`QUEUED → SENT → DELIVERED`, or `FAILED`) with real-time updates over GraphQL subscriptions.

## Requirements

- Node.js 20+
- npm

## Getting Started

```bash
npm install
npm run dev
```

The server runs at [http://localhost:4000/graphql](http://localhost:4000/graphql), where GraphQL Yoga serves GraphiQL for interactive queries.

Change the port with:

```bash
PORT=3000 npm run dev
```

## API

The store is seeded with one conversation: `conversation-1`.

### Send a message

```graphql
mutation {
  sendMessage(conversationId: "conversation-1", body: "Hello!") {
    id
    body
    status
  }
}
```

The message starts as `QUEUED`. A simulated provider marks it `SENT` after ~1s and `DELIVERED` after ~2s.

### Query a conversation

```graphql
query {
  conversation(id: "conversation-1") {
    id
    messages {
      id
      body
      status
      statusLabel
      deliveredAt
      error
    }
  }
}
```

### Subscribe to message updates

```graphql
subscription {
  onMessageUpdate(conversationId: "conversation-1") {
    id
    status
    deliveredAt
  }
}
```

Run this in a GraphiQL tab, then send a message from another tab to watch the status transitions arrive in real time.

## Scripts

- `npm run dev` — start the dev server with file watching (tsx).
- `npm run build` — compile TypeScript to `dist/`.
- `npm start` — run the compiled build.
- `npm test` — run all tests once (Vitest).
- `npm run test:watch` — run tests in watch mode.
- `npm run typecheck` — type-check `src/` and `test/` without emitting.

## Project Structure

```text
src/
├── server.ts    # HTTP bootstrap (only file that listens on the network)
├── app.ts       # Importable Yoga instance — tests call yoga.fetch() in-memory
├── schema.ts    # SDL + resolvers
├── services.ts  # Messaging-provider seam (Twilio stand-in)
├── store.ts     # In-memory store; Conversation owns its messages
└── types.ts     # Domain types (Message discriminated union, StatusPatch)
test/
├── app.test.ts       # Integration tests through the GraphQL layer
├── services.test.ts  # Service layer unit tests
└── store.test.ts     # Store unit tests
```
