import { createYoga } from 'graphql-yoga'
import { schema } from './schema.js'
import { buildAuthContext } from './auth/context.js'

const LOCAL_VITE_ORIGIN = /^http:\/\/localhost:\d+$/

export const yoga = createYoga({
  schema,
  context: ({ request }) => buildAuthContext(request),
  // Vite falls back to the next free port when 5173 is taken; accept any
  // localhost origin so the frontend keeps working in that case.
  cors: (request) => {
    const origin = request.headers.get('origin')
    return {
      origin:
        origin && LOCAL_VITE_ORIGIN.test(origin)
          ? origin
          : 'http://localhost:5173',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }
  },
})
