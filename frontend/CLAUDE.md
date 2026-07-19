# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (HMR)
- `npm run build` — type-check (`tsc -b`) then Vite production build
- `npm run lint` — Oxlint (config in `.oxlintrc.json`)
- `npm run preview` — serve production build

No test runner is configured.

## Project Purpose

Practice sandbox: a React chat app talking to the GraphQL backend (auth, conversations, messages). The service layer (`src/stubs/chatService.ts`) is the single API boundary — keep all GraphQL operations there.

## Stack

Vite 8 + React 19 + TypeScript 6 (strict-ish: `noUnusedLocals`, `verbatimModuleSyntax`, `noEmit`). Path alias `@/*` → `src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`).

## Architecture

Data flows in one direction: `stubs/chatService.ts` → hooks (`useAuth`, `useChat`) → pages → components.

- Routing (react-router): `/login`, `/register` (public), `/conversations/:conversationId` (protected), `/` (redirect to first conversation or empty state). Identity travels in the JWT only — never in the URL.
- `src/types/chat.ts` + `src/types/user.ts` — `Message` (status: queued → sent → delivered, or failed), `Conversation`, `User`, `AuthPayload`.
- `src/stubs/chatService.ts` — all GraphQL operations (register/login/me, conversations CRUD, addParticipant by email, sendMessage, SSE subscription via `graphql-sse`).
- `src/services/graphqlClient.ts` — `gqlFetch` + SSE client; attaches `Authorization: Bearer` lazily from `src/services/authStorage.ts` (localStorage key `simple-react-chat:auth`).
- `src/hooks/useAuth.tsx` — auth context provider (user, token, register, login, logout). `src/hooks/useChat.ts` — chat state: initial fetch, optimistic sends (temporary `optimistic-<uuid>` id replaced by the server message), failure marking + `retry`, SSE-driven status updates.
- `src/pages/ChatPage.tsx` — sidebar (`ConversationsSidebar`) + header (signed-in state, logout, `AddParticipantForm`) + `src/components/chat/*` presentational pieces.

E2E: Playwright specs in `e2e/` (`npm run test:e2e`); requires Docker infra (`pnpm docker:dev`).
