# React Chat Boilerplate — Structure Only

## Context

Existing Vite + React 19 + TS project at `/Users/antonioaren/Downloads/personal/live-coding-training`. User wants a **structure-only** boilerplate for a single chat screen (send/receive messages): hooks, components, types, pages, plus a `stubs/` layer to simulate incoming data. No real logic/content — empty shells and signatures only.

`src/hooks/`, `src/stubs/`, `src/types/` already exist (empty). `src/components/` and `src/pages/` must be created.

## Files to create

```
src/
├── types/
│   └── chat.ts            # Message, MessageAuthor ('user' | 'other'), ChatState — type/interface declarations only
├── stubs/
│   ├── messages.ts        # exported empty/placeholder array: stubMessages: Message[]
│   └── chatService.ts     # stub async fns: fetchMessages(), sendMessage(text) — return stub data / echo, ready to swap for real API
├── hooks/
│   └── useChat.ts         # hook shell: returns { messages, sendMessage, isLoading } — wired to stubs, minimal body
├── components/
│   └── chat/
│       ├── ChatWindow.tsx     # container: renders MessageList + MessageInput
│       ├── MessageList.tsx    # props: messages — maps to MessageBubble (empty markup)
│       ├── MessageBubble.tsx  # props: message — skeleton markup
│       └── MessageInput.tsx   # props: onSend — input + button skeleton
└── pages/
    └── ChatPage.tsx       # renders ChatWindow, uses useChat
```

## Files to modify

- `src/App.tsx` — render `<ChatPage />` (replace default Vite content).

## Rules

- All artifacts in English. Explicit types on function signatures. No filler logic — TODO comments where implementation goes.
- No new dependencies. No router (single screen).
- Prettier style per global rules: single quotes, no semicolons, 2-space indent.

## Verification

- `npm run build` (tsc + vite) passes.
- `npm run dev` → chat page renders empty skeleton without console errors.
