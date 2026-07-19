FROM node:20-slim AS build
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN corepack enable && pnpm install --frozen-lockfile --filter @chat-example/backend...

COPY backend backend

RUN pnpm --filter @chat-example/backend run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json

WORKDIR /app/backend

# CMD overridden per service in docker-compose.yml (server vs worker)
CMD ["node", "dist/server.js"]
