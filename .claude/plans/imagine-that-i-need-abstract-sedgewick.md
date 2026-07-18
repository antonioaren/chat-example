# Retry Message — `retryMessage` mutation with max 3 retries

## Context

The chat API simulates a messaging provider (Twilio stand-in). Today `sendMessage` always succeeds: inline `setTimeout`s in `src/schema.ts` advance status queued → sent → delivered. There is no failure path and no way to recover a failed message. The goal: the provider can fail (no connection, send error), the message ends in `FAILED`, and the client can call a new `retryMessage` mutation to re-attempt delivery — capped at **3 retries total**, after which the server rejects further retries.

## Design decisions

- **Retry shape (user-confirmed):** explicit `retryMessage(conversationId, messageId)` mutation. Send failure → message goes `FAILED` immediately; client retries manually. No automatic server-side retry loop.
- **Retry cap:** `retries` counter on the message, starts at 0, incremented per retry. `MAX_RETRIES = 3`. `retryMessage` throws `"Retry limit reached"` when `retries >= 3`.
- **Deterministic failure simulation** (testable, no randomness):
  - body includes `"always-fail"` → provider fails on every attempt (demos retry exhaustion).
  - body includes `"fail"` → provider fails only on the initial send (`retries === 0`); a retry succeeds (demos the happy retry path).
  - anything else → succeeds as today.
- **Delivery simulation moves to `src/services.ts`** (the provider seam) — schema resolvers stop owning `setTimeout`s. Both `sendMessage` and `retryMessage` call the same service function.

## Changes

### 1. `src/types.ts`
- Add `retries: number` to **each** variant of the `Message` discriminated union.
- Add a `{ status: "queued" }` variant to `StatusPatch` (re-queue on retry).
- `statusLabel`: add `case "queued"` is already there — no change needed beyond the union edit.

### 2. `src/store.ts`
- `addMessage`: initialize `retries: 0`.
- `_applyPatch`: preserve `message.retries` in every branch; add the `"queued"` case (re-queue keeps body/id, carries retries).
- New exported `MAX_RETRIES = 3` (single source of truth) and a store function `requeueForRetry(conversationId, messageId)`:
  - message must exist and have `status === "failed"`, else return a typed error/throw.
  - `retries >= MAX_RETRIES` → throw `"Retry limit reached"`.
  - set status back to `queued`, increment `retries`, publish on `message-{conversationId}` (reuse `updateStatus`/`_applyPatch` path so the pubsub invariant holds).

### 3. `src/services.ts`
- New `simulateDelivery(conversationId: string, message: Message): void` — owns the provider simulation:
  - failure rule above → after a short `setTimeout`, `updateStatus(..., { status: "failed", error: "Provider connection error" })`.
  - success → existing two-step `setTimeout`s: `sent` then `delivered` (same durations as today, 3000/6000).
- Keep existing `sendMessage` delegating to `addMessage`, then call `simulateDelivery`.

### 4. `src/schema.ts`
- SDL: add `retries: Int!` to `type Message`; add `retryMessage(conversationId: ID!, messageId: ID!): Message!` to `Mutation`.
- `Mutation.sendMessage`: remove inline `setTimeout`s; call `services.sendMessage` (which now schedules delivery).
- `Mutation.retryMessage`: call `requeueForRetry`, then `simulateDelivery` with the re-queued message; return it. Errors (not found / not failed / limit reached) surface as GraphQL errors.

### 5. Tests (Vitest, existing files)
- `test/store.test.ts`: `requeueForRetry` — happy re-queue increments `retries` + publishes; rejects non-failed message; rejects at `MAX_RETRIES`.
- `test/services.test.ts` (fake timers): `"fail"` body → FAILED after initial send; retry then succeeds → DELIVERED; `"always-fail"` → FAILED every attempt.
- `test/app.test.ts` (through `yoga.fetch()`): `retryMessage` on a failed message returns QUEUED with `retries: 1`; 4th retry returns error `"Retry limit reached"`; retry on a non-failed message errors.

## Invariants preserved

- Status changes still go only through `updateStatus`/`_applyPatch`; discriminated-union exhaustiveness checks extended, never bypassed.
- `MESSAGE_STATUS` in `src/types.ts` stays the single source for the GraphQL enum (no new statuses needed — retry reuses `queued`).
- Both mutation paths publish on `message-{conversationId}` so `onMessageUpdate` subscribers see the full lifecycle.

## Verification

1. `npm run typecheck` and `npm test` — all green.
2. `npm run dev`, GraphiQL at `http://localhost:4000/graphql`:
   - subscribe `onMessageUpdate(conversationId: "conversation-1")`.
   - `sendMessage(body: "fail")` → watch QUEUED → FAILED.
   - `retryMessage(...)` → QUEUED (retries 1) → SENT → DELIVERED.
   - `sendMessage(body: "always-fail")` → retry 3 times → each FAILED; 4th retry → `"Retry limit reached"` error.
