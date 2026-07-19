FROM node:20-slim AS build
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json

RUN corepack enable && pnpm install --frozen-lockfile --filter @chat-example/frontend...

COPY frontend frontend

ARG VITE_GRAPHQL_URL=http://localhost:4000/graphql
ENV VITE_GRAPHQL_URL=$VITE_GRAPHQL_URL

RUN pnpm --filter @chat-example/frontend run build

FROM nginx:alpine AS runtime
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
