# Connect React Frontend to GraphQL Yoga Backend

## Context

The chat-example monorepo (pnpm workspace) has a GraphQL Yoga backend (`backend/`, port 4000) and a React 19 + Vite frontend (`frontend/`, port 5173) that are not connected: the frontend runs entirely on localStorage stubs (`frontend/src/stubs/chatService.ts` — the designed swap seam). Goal: one shared conversation id (`conversation-1`, already seeded in the backend), initial message load from the backend, and real-time delivery via the existing `onMessageUpdate` subscription so every connected user sees new messages.

**Decisions (confirmed with user):**
- Client: plain `fetch` for query/mutation + `graphql-sse` for the subscription (Yoga serves SSE natively on `/graphql` — no server plugin needed). No Apollo/urql.
- User model: join-by-name stays frontend-local (localStorage). Backend Message gains only `senderId`, `senderName` (+ `createdAt`, required by the frontend `Message` type and better generated server-side).
- CORS on the backend (one-line Yoga option) instead of a Vite proxy — keeps `VITE_GRAPHQL_URL` meaningful and avoids proxying long-lived SSE streams.

**Key findings from exploration:**
- `backend/src/store.ts` `_applyPatch` rebuilds messages field-by-field — must carry the new fields through or they get dropped on status updates.
- `frontend/src/hooks/useCurrentUser.ts` reads participants via `chatService.getConversation` — participants must keep a local (localStorage) read path; backend has no participant concept.
- Backend tests call `addMessage(convId, body)` / mutation with 2 args — all need updates.
- `subscribeToConversation` (storage events) is used by both `useChat` (replace with SSE) and `useCurrentUser` (keep, for same-browser participant sync).

## Phase 1 — Backend (senderId, senderName, createdAt, CORS)

1. `backend/src/types.ts` — extract `MessageBase { id, body, senderId, senderName, createdAt }` and intersect with the existing status discriminated union (keeps union intact, no triplication).
2. `backend/src/store.ts` — `addMessage(conversationId, body, senderId, senderName)` sets `createdAt: new Date().toISOString()`; `_applyPatch` copies the new fields explicitly in every case (no spread — keeps narrowing honest).
3. `backend/src/services.ts` — thread new params through `sendMessage`.
4. `backend/src/schema.ts` — SDL: Message gains `senderId: ID!`, `senderName: String!`, `createdAt: String!`; `sendMessage(conversationId: ID!, body: String!, senderId: ID!, senderName: String!)`. Mutation resolver passes new args. Subscription resolver unchanged.
5. `backend/src/app.ts` — add:
   ```ts
   cors: { origin: ['http://localhost:5173'], methods: ['GET', 'POST', 'OPTIONS'] }
   ```
6. `backend/test/{store,services,app}.test.ts` — update all `addMessage`/`sendMessage` calls and assertions (`createdAt: expect.any(String)`).

## Phase 2 — Frontend GraphQL client

7. `pnpm --filter @chat-example/frontend add graphql-sse` (only new dependency).
8. New `frontend/src/services/graphqlClient.ts`:
   - `GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'`
   - `gqlFetch<T>(query, variables)` — POST JSON, throw on HTTP error or `errors[]`.
   - `sseClient = createClient({ url: GRAPHQL_URL })` from `graphql-sse` (distinct-connections mode, wire-compatible with Yoga SSE).
   - `frontend/.env` documenting `VITE_GRAPHQL_URL` (in-code default keeps zero-config dev).
9. `frontend/src/stubs/messages.ts` — `DEMO_CONVERSATION_ID: 'demo-1'` → `'conversation-1'` (only reference).

## Phase 3 — Rewrite seam `frontend/src/stubs/chatService.ts`

10. Keep module path/exports:
    - Status mapper GraphQL enum UPPERCASE → frontend lowercase + `toClientMessage()`.
    - `getConversation`/`fetchMessages` → real query `conversation(id) { messages { id body senderId senderName status createdAt } }`; `getConversation` merges backend messages with locally stored participants so `useCurrentUser` works unchanged.
    - `sendMessage(conversationId, body, senderId, senderName)` → real mutation; delete simulated failure/latency + localStorage write path.
    - `addParticipant` + `CapacityError`: unchanged (local). Cross-browser participant visibility: out of scope (messages still cross browsers).
    - Delete `getMessage` (only used by the removed polling loop).
    - New `subscribeToMessages(conversationId, onMessage, onError): () => void` wrapping `sseClient.subscribe` on `onMessageUpdate`.

## Phase 4 — Hook rework

11. `frontend/src/hooks/useChat.ts` signature → `useChat(conversationId, currentUserId, currentUserName)`; `frontend/src/pages/ChatPage.tsx` passes `name` (already available).
12. Inside `useChat`:
    - Initial load: same shape, real `fetchMessages`.
    - Replace storage-event effect + 300ms polling with one `subscribeToMessages` effect using `upsertById` (existing id → replace for status reconciliation; new id → append).
    - Self-echo race: on mutation resolve, `upsertById(prev.filter(m => m.id !== optimisticId), serverMessage)` — handles echo-before-resolve and resolve-before-echo without duplicates.
    - Keep optimistic send + `failed`/`retry` UX (now only real errors fail).
    - Remove `getMessage` usage, `isPendingOwnMessage`, `TERMINAL_STATUSES`, storage subscription.
13. `frontend/src/hooks/useCurrentUser.ts` — no changes.

## Verification

- `pnpm --filter @chat-example/backend test` + `typecheck` green.
- `pnpm --filter @chat-example/frontend build` (tsc) green.
- Manual: `pnpm dev` (both). Two tabs, join with two names:
  - Existing messages load on refresh.
  - Message from tab A appears in tab B without reload.
  - Status queued → sent (~3s) → delivered (~6s) in both tabs.
  - Network tab: one persistent `text/event-stream` per tab, no polling.
  - Backend down → send marks failed; retry after restart succeeds.
  - Optional: second browser/incognito — messages cross browsers (participant lists don't, documented out of scope).
