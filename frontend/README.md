# Simple React Chat

A single-screen React chat application. It renders a conversation, sends messages with optimistic UI, polls for delivery status, and lets the user retry failed sends — all backed by an in-memory stub service that can later be swapped for a real API.

## Stack

- [Vite 8](https://vite.dev/) + [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react)
- React 19
- TypeScript 6 (`noEmit`, type-checked via `tsc -b` on build)
- [Oxlint](https://oxc.rs/) for linting

## Getting Started

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

## Scripts

| Command           | Description                                    |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Start the dev server with HMR                  |
| `npm run build`   | Type-check (`tsc -b`) and build for production |
| `npm run lint`    | Run Oxlint                                     |
| `npm run preview` | Serve the production build locally             |

## How It Works

```
src/stubs/chatService.ts  →  src/hooks/useChat.ts  →  src/pages/ChatPage.tsx  →  src/components/chat/*
        (fake API)              (all chat state)          (composition)            (presentational)
```

### Message lifecycle

An outbound message moves through these statuses:

```
queued → sent → delivered
   └──────────→ failed  (retryable)
```

1. **Optimistic send** — `useChat.sendMessage` immediately appends a message with a temporary `optimistic-<uuid>` id and `queued` status, then calls the service. On success the optimistic message is replaced by the server message; on failure it is marked `failed`.
2. **Status polling** — while any outbound message is not yet `delivered` or `failed`, a 300 ms interval polls the service and reconciles status changes into state.
3. **Retry** — `useChat.retry(messageId)` resets a `failed` message to `queued` and resubmits its body.

### Stub service

`src/stubs/chatService.ts` simulates a real backend over the in-memory `stubMessages` Map (`src/stubs/messages.ts`, seeded with one conversation, `corp-1`):

- `sendMessage` resolves after 1 s and fails randomly 30% of the time — this is intentional, so the failure/retry path is exercisable.
- Sent messages transition to `sent` after 800 ms and `delivered` after 2 s.

Swap these functions for real API calls without touching the hook or components.

## Project Structure

```
src/
├── components/chat/   # Presentational components: ChatWindow, MessageList, MessageBubble, MessageInput
├── hooks/useChat.ts   # Chat state: fetch, optimistic send, retry, status polling
├── pages/ChatPage.tsx # Screen composition
├── stubs/             # In-memory fake API (swappable)
└── types/chat.ts      # Message and conversation types
```

Internal imports use the `@/*` alias (mapped to `src/*` in `tsconfig.app.json` and `vite.config.ts`).
