# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (HMR)
- `npm run build` — type-check (`tsc -b`) then Vite production build
- `npm run lint` — Oxlint (config in `.oxlintrc.json`)
- `npm run preview` — serve production build

No test runner is configured.

## Project Purpose

Practice sandbox: a single-screen React chat app built against in-memory stubs. The stub layer (`src/stubs/`) is intentionally swappable for real API calls later — keep that boundary intact.

## Stack

Vite 8 + React 19 + TypeScript 6 (strict-ish: `noUnusedLocals`, `verbatimModuleSyntax`, `noEmit`). Path alias `@/*` → `src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`).

## Architecture

Data flows in one direction: `stubs/chatService.ts` → `hooks/useChat.ts` → `pages/ChatPage.tsx` → `components/chat/*`.

- `src/types/chat.ts` — `Message` (direction: inbound/outbound; status: queued → sent → delivered, or failed) and `conversation`.
- `src/stubs/chatService.ts` — fake async API over the `stubMessages` Map (`src/stubs/messages.ts`). `sendMessage` simulates latency (1s), a 30% random failure rate, and delayed status transitions (sent at 800ms, delivered at 2s).
- `src/hooks/useChat.ts` — all chat state lives here. Handles: initial fetch keyed by `corporationId`, optimistic sends (temporary `optimistic-<uuid>` id replaced by the server message), failure marking + `retry`, and a 300ms polling interval that reconciles status for pending outbound messages. Components stay presentational; state logic belongs in this hook.
- `src/components/chat/` — presentational pieces (ChatWindow, MessageList, MessageBubble, MessageInput) composed by `src/pages/ChatPage.tsx`.
