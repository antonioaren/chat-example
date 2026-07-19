import { defineConfig, env } from 'prisma/config'

// Prisma 7 keeps connection URLs out of schema.prisma; Migrate reads it here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
