// Opt-in integration tier: exercises conversations + memberships against the
// real DynamoDB Local and PostgreSQL from docker-compose.dev.yml. Run
// `pnpm docker:dev` first, then `pnpm test:integration`. Not part of the
// default `pnpm test` run.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { yoga } from '../../src/app.js'
import { ensureTableExists } from '../../src/db/bootstrap.js'
import { prisma } from '../../src/db/prismaClient.js'

const gql = (body: unknown, headers: Record<string, string> = {}) =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )

const suffix = `${Date.now()}`

function registerInput(name: string) {
  return `{
    firstName: "${name}", lastName: "Tester",
    email: "member-${name}-${suffix}@example.com",
    phone: "+34600000001", alias: "member-${name}-${suffix}",
    password: "s3cret!!"
  }`
}

async function register(name: string): Promise<{ token: string; id: string }> {
  const res = await gql({
    query: `mutation {
      register(input: ${registerInput(name)}) { token user { id } }
    }`,
  })
  const json = await res.json()
  expect(json.errors).toBeUndefined()
  return { token: json.data.register.token, id: json.data.register.user.id }
}

describe('integration — conversations and memberships end-to-end', () => {
  beforeAll(async () => {
    await ensureTableExists()
  }, 30000)

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'member-' } },
    })
    await prisma.$disconnect()
  })

  it('should create a conversation with the creator as participant and list it', async () => {
    const alice = await register('alice')
    const auth = { Authorization: `Bearer ${alice.token}` }

    const createRes = await gql(
      {
        query: `mutation {
          createConversation(title: "Integration chat") {
            id
            participants { id alias }
          }
        }`,
      },
      auth,
    )
    const createJson = await createRes.json()
    expect(createJson.errors).toBeUndefined()
    const conversationId = createJson.data.createConversation.id
    expect(createJson.data.createConversation.participants).toEqual([
      expect.objectContaining({ id: alice.id }),
    ])

    const listRes = await gql({ query: '{ conversations { id } }' }, auth)
    const listJson = await listRes.json()
    expect(listJson.errors).toBeUndefined()
    expect(listJson.data.conversations).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: conversationId })]),
    )
  })

  it('should add a participant by email, idempotently, and let them see the conversation', async () => {
    const alice = await register('owner')
    const bob = await register('guest')
    const aliceAuth = { Authorization: `Bearer ${alice.token}` }
    const bobAuth = { Authorization: `Bearer ${bob.token}` }

    const createRes = await gql(
      { query: 'mutation { createConversation { id } }' },
      aliceAuth,
    )
    const conversationId = (await createRes.json()).data.createConversation.id

    const addMutation = `mutation {
      addParticipant(
        conversationId: "${conversationId}",
        email: "member-guest-${suffix}@example.com"
      ) {
        id
        participants { id }
      }
    }`

    const addJson = await (await gql({ query: addMutation }, aliceAuth)).json()
    expect(addJson.errors).toBeUndefined()
    expect(addJson.data.addParticipant.participants).toHaveLength(2)

    // Re-adding the same user must not duplicate the participant.
    const readdJson = await (await gql({ query: addMutation }, aliceAuth)).json()
    expect(readdJson.errors).toBeUndefined()
    expect(readdJson.data.addParticipant.participants).toHaveLength(2)

    const bobList = await (
      await gql({ query: '{ conversations { id } }' }, bobAuth)
    ).json()
    expect(bobList.data.conversations).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: conversationId })]),
    )
  })

  it('should reject sendMessage from an authenticated non-participant', async () => {
    const alice = await register('sender')
    const mallory = await register('outsider')

    const createRes = await gql(
      { query: 'mutation { createConversation { id } }' },
      { Authorization: `Bearer ${alice.token}` },
    )
    const conversationId = (await createRes.json()).data.createConversation.id

    const sendJson = await (
      await gql(
        {
          query: `mutation {
            sendMessage(conversationId: "${conversationId}", body: "intruder") { id }
          }`,
        },
        { Authorization: `Bearer ${mallory.token}` },
      )
    ).json()

    expect(sendJson.errors[0].message).toBe(
      'Not a participant in this conversation',
    )
  })

  it('should surface unknown email on addParticipant', async () => {
    const alice = await register('lonely')
    const auth = { Authorization: `Bearer ${alice.token}` }

    const createRes = await gql(
      { query: 'mutation { createConversation { id } }' },
      auth,
    )
    const conversationId = (await createRes.json()).data.createConversation.id

    const json = await (
      await gql(
        {
          query: `mutation {
            addParticipant(conversationId: "${conversationId}", email: "nobody-${suffix}@example.com") { id }
          }`,
        },
        auth,
      )
    ).json()

    expect(json.errors[0].message).toBe('No user with that email')
  })
})
