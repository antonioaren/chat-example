import { createYoga } from 'graphql-yoga'
import { schema } from './schema.js'

export const yoga = createYoga({
  schema,
  cors: {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS'],
  },
})
