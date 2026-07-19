// Opt-in integration tier: exercises the real pipeline end-to-end against
// Docker services (DynamoDB Local + Redis + PostgreSQL). Run `pnpm docker:dev`
// first, then `pnpm test:integration`. Not part of the default `pnpm test` run.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { yoga } from '../../src/app.js'
import { ensureTableExists } from '../../src/db/bootstrap.js'
import { getConversationMessages } from '../../src/db/messagesRepo.js'
import { startWorkers } from '../../src/queue/index.js'
import { pubsub } from '../../src/store.js'
import type { Worker } from 'bullmq'
import type { Message } from '../../src/types.js'

const gql = (body: unknown, token?: string) =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )

async function registerUser(label: string): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const res = await gql({
    query: `mutation {
      register(input: {
        firstName: "${label}"
        lastName: "Lifecycle"
        email: "lifecycle-${stamp}@example.com"
        phone: "+34600000000"
        alias: "lifecycle-${label.toLowerCase()}-${stamp}"
        password: "integration-pass"
      }) { token }
    }`,
  })
  const json = await res.json()
  expect(json.errors).toBeUndefined()
  return json.data.register.token as string
}

async function pollUntilDelivered(
  conversationId: string,
  messageId: string,
  timeoutMs = 10000,
): Promise<Message> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const messages = await getConversationMessages(conversationId)
    const found = messages.find((message) => message.id === messageId)
    if (found?.status === 'delivered') {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Message ${messageId} did not reach delivered in time`)
}

describe('integration — send-message pipeline end-to-end', () => {
  let workers: Worker[]

  beforeAll(async () => {
    await ensureTableExists()
    workers = startWorkers()
  }, 30000)

  afterAll(async () => {
    await Promise.all(workers.map((worker) => worker.close()))
  })

  it(
    'should progress a message from queued to delivered via the real queue and DB',
    async () => {
      const token = await registerUser('Sender')

      const createRes = await gql(
        { query: `mutation { createConversation { id } }` },
        token,
      )
      const createJson = await createRes.json()
      expect(createJson.errors).toBeUndefined()
      const conversationId = createJson.data.createConversation.id as string

      const events: Message[] = []
      const iterator = pubsub.subscribe(`message-${conversationId}`)[
        Symbol.asyncIterator
      ]()
      const pump = (async () => {
        for await (const payload of {
          [Symbol.asyncIterator]: () => iterator,
        }) {
          events.push(payload as Message)
        }
      })()
      void pump

      const res = await gql(
        {
          query: `mutation {
            sendMessage(conversationId: "${conversationId}", body: "integration test") {
              id status
            }
          }`,
        },
        token,
      )
      const json = await res.json()
      expect(json.errors).toBeUndefined()
      expect(json.data.sendMessage.status).toBe('QUEUED')

      const messageId = json.data.sendMessage.id as string
      const delivered = await pollUntilDelivered(conversationId, messageId)

      expect(delivered.status).toBe('delivered')
      if (delivered.status === 'delivered') {
        expect(delivered.deliveredAt).toEqual(expect.any(String))
      }

      await iterator.return?.()
    },
    15000,
  )
})
