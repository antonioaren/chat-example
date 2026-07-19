# Infrastructure

How the queue + DB infra fits together, and how to run it in each mode. For the
message-processing design (table schema, job flow), see
[`plans/dynamodb-bullmq-queue.md`](./plans/dynamodb-bullmq-queue.md).

## Components

| Component | What it is | Runs where |
|---|---|---|
| `dynamodb-local` | `amazon/dynamodb-local` image — DynamoDB API, no AWS account/cost | Docker (both modes) |
| `redis` | `redis:7` image — backs the BullMQ queues | Docker (both modes) |
| `backend` (server) | GraphQL Yoga API (`backend/src/server.ts`) | Host process (dev) or container (`docker:up`) |
| `worker` | Queue consumer (`backend/src/worker.ts`) | Host process (dev) or container (`docker:up`) |
| `frontend` | React/Vite chat UI | Host process (dev) or nginx container (`docker:up`) |

The server and worker are **separate processes** on purpose — a producer/consumer
split, not an accident. The server enqueues jobs and returns immediately; the
worker is the only thing that talks to DynamoDB for writes and advances message
status. Killing/restarting one doesn't take down the other.

## Two Docker Compose files

### `docker-compose.dev.yml` — infra only

```bash
pnpm docker:dev        # starts dynamodb-local + redis
pnpm docker:dev:down
```

Starts *only* the two stateful services. `backend`, `worker`, and `frontend`
keep running on your machine via `pnpm dev:backend` / `pnpm dev:worker` /
`pnpm dev:frontend` — `tsx watch` and Vite's HMR are faster than rebuilding a
Docker image on every change, so this is the default day-to-day setup.

```
┌─────────────────────────┐        ┌──────────────────────────────────┐
│   your machine (host)    │        │              Docker                │
│                          │        │                                    │
│  pnpm dev:frontend ──┐   │        │  ┌────────────────┐               │
│  (Vite :5173)         │  │        │  │ dynamodb-local  │  :8000        │
│                       │  │        │  └────────────────┘               │
│  pnpm dev:backend ────┼──┼───────►│         ▲                          │
│  (server.ts :4000)    │  │        │         │                          │
│                       │  │        │  ┌────────────────┐               │
│  pnpm dev:worker ─────┴──┼───────►│  │     redis       │  :6379        │
│  (worker.ts)             │        │  └────────────────┘               │
└──────────────────────────┘        └──────────────────────────────────┘
```

### `docker-compose.yml` — full stack

```bash
pnpm docker:up          # builds images, starts everything
pnpm docker:down
```

Builds and runs **everything** in containers — the closest local simulation of
a production deployment. All five services share one Docker network and talk
to each other by service name (`dynamodb-local`, `redis`, `backend`), not
`localhost`.

```
┌───────────────────────────────────────────────────────────────────────┐
│                              Docker network                              │
│                                                                          │
│  ┌──────────┐        ┌──────────┐                                       │
│  │ frontend  │  :8080 │ dynamodb- │  :8000                              │
│  │ (nginx)   │        │  local    │◄──────────┐                        │
│  └────┬─────┘        └──────────┘            │                        │
│       │ VITE_GRAPHQL_URL (baked in at build)  │                        │
│       ▼                                        │                        │
│  ┌──────────┐        ┌──────────┐             │                        │
│  │ backend   │  :4000 │  redis    │  :6379     │                        │
│  │ (server)  │───────►└────┬─────┘             │                        │
│  └──────────┘              │                    │                        │
│                             ▼                    │                        │
│                        ┌──────────┐              │                        │
│                        │  worker   │──────────────┘                        │
│                        └──────────┘                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Reachable from the host at `http://localhost:8080` (frontend) and
`http://localhost:4000/graphql` (backend GraphiQL). `backend` and `worker`
build from the same `backend/Dockerfile` — only the container `command`
differs (`node dist/server.js` vs `node dist/worker.js`).

### Choosing between them

| | `docker:dev` | `docker:up` |
|---|---|---|
| DynamoDB Local + Redis | ✅ container | ✅ container |
| backend / worker / frontend | host process, hot reload | container, rebuild to pick up changes |
| Startup speed | fast | slow (image build) |
| Use for | day-to-day development | verifying the whole stack behaves like it will in production |

## Dockerfiles

Both `backend/Dockerfile` and `frontend/Dockerfile` are multi-stage builds run
from the **repo root** as build context (`context: .` in `docker-compose.yml`)
— required because this is a pnpm workspace and the build needs
`pnpm-lock.yaml` / `pnpm-workspace.yaml` from the root alongside the package's
own `package.json`.

**`backend/Dockerfile`**: `node:20-slim` build stage installs only the
backend's dependency subtree (`pnpm install --filter @chat-example/backend...`),
runs `tsc` to `dist/`, then a second `node:20-slim` runtime stage copies just
`node_modules` + `dist` + `package.json` — no TypeScript source or dev
dependencies ship in the final image. Same image serves both `backend` and
`worker` in `docker-compose.yml`; only the `command:` differs.

**`frontend/Dockerfile`**: build stage runs `vite build` (Vite inlines
`VITE_GRAPHQL_URL` into the JS bundle at build time via an `ARG`/`ENV` pair —
it is **not** re-readable at container runtime), then `nginx:alpine` serves
the static `dist/` output on port 80.

`.dockerignore` (repo root) excludes `node_modules`, `dist`, `.git`, and env
files from the build context — without it, the build would copy the host's
`node_modules` (often built for a different OS/arch) into the context and
either bloat or break the image.

## Environment variables

`backend/.env.example` documents the local-dev defaults (copy to
`backend/.env`, read via `tsx watch --env-file=.env`):

```
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
DYNAMODB_TABLE_NAME=chat-messages
DYNAMODB_AUTO_CREATE_TABLE=true
REDIS_URL=redis://localhost:6379
```

Inside `docker-compose.yml`, the same variables are set directly in the
`environment:` block per service, pointing at the **Docker service names**
instead of `localhost` (`http://dynamodb-local:8000`, `redis://redis:6379`) —
containers on the same Compose network resolve each other by service name.

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are dummy placeholders. DynamoDB
Local ignores their value entirely — the AWS SDK just requires *something*
present in the fields, it never calls out to real AWS. No AWS account, no
token, no cost, in either mode.

`DYNAMODB_AUTO_CREATE_TABLE=true` makes `backend/src/db/bootstrap.ts`
idempotently create the table and seed `conversation-1` on startup — this
flag would be `false`/unset against a real AWS account, where the table is
provisioned out-of-band (Terraform/CDK/console), not by the app itself.

## Data flow across the boundary

For the full producer → queue → worker → DB → subscription design, see
[`plans/dynamodb-bullmq-queue.md`](./plans/dynamodb-bullmq-queue.md). At the
infra level, the relevant boundary is:

1. `backend` (server) only ever talks to **Redis** — it enqueues a `send-message`
   job and returns; it never writes to DynamoDB directly.
2. `worker` is the only service that writes to **DynamoDB** and re-enqueues
   delayed status jobs back onto Redis.
3. `worker` publishes status updates through Yoga's in-process `pubsub`
   (`backend/src/store.ts`) — that pubsub lives inside whichever process
   handles the GraphQL subscription request, not in Redis. In `docker:up`
   mode this means `backend` (the server container) is the one holding open
   SSE connections and resolving `onMessageUpdate`; `worker` reaches it only
   indirectly, through the DB write + a job on the `message-status` queue
   that the *server's own* subscription resolver was never told about
   directly — the current single-container-per-role setup works because
   there is exactly one `backend` replica. Scaling `backend` to multiple
   replicas would require moving pubsub to Redis (BullMQ already depends on
   Redis, so `graphql-yoga`'s Redis pubsub adapter would be the natural
   next step) so every replica sees every publish — not implemented here,
   flagged as a scaling limitation.

## Known limitations

- **No healthchecks / startup ordering.** `depends_on` in `docker-compose.yml`
  only waits for the dynamodb-local/redis *containers* to start, not for them
  to actually accept connections. `backend`/`worker` may fail their first
  connection attempt on a cold `docker:up`. Retry-on-startup or a proper
  `healthcheck:` + `condition: service_healthy` would close this gap — not
  implemented yet.
- **Single replica assumption.** See the pubsub note above — this setup does
  not support horizontally scaling the `backend` service as-is.
- **`docker-compose.yml` frontend build bakes in `localhost:4000`.** Fine for
  local "prod simulation" on one machine; a real deployment would need the
  `VITE_GRAPHQL_URL` build arg pointed at wherever the backend is actually
  reachable from the browser, not `localhost`.
