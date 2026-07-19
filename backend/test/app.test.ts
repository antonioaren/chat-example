import { describe, it, expect, beforeEach, vi } from 'vitest'

const conversationExists = vi.fn()
const getConversationMessages = vi.fn()
const messageQueueAdd = vi.fn()
const createUser = vi.fn()
const findUserByEmail = vi.fn()
const findUserById = vi.fn()

vi.mock('../src/db/messagesRepo.js', () => ({
  conversationExists: (...args: unknown[]) => conversationExists(...args),
  getConversationMessages: (...args: unknown[]) =>
    getConversationMessages(...args),
}))

vi.mock('../src/queue/messageQueue.js', () => ({
  messageQueue: { add: (...args: unknown[]) => messageQueueAdd(...args) },
}))

const createConversation = vi.fn()
const addParticipantToConversation = vi.fn()
const listUserConversations = vi.fn()
const getParticipants = vi.fn()
const isParticipant = vi.fn()

vi.mock('../src/db/membershipsRepo.js', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  addParticipantToConversation: (...args: unknown[]) =>
    addParticipantToConversation(...args),
  listUserConversations: (...args: unknown[]) => listUserConversations(...args),
  getParticipants: (...args: unknown[]) => getParticipants(...args),
  isParticipant: (...args: unknown[]) => isParticipant(...args),
}))

vi.mock('../src/db/usersRepo.js', async (importOriginal) => {
  // Keep the real error classes so instanceof checks in resolvers still work.
  const actual = await importOriginal<typeof import('../src/db/usersRepo.js')>()
  return {
    DuplicateEmailError: actual.DuplicateEmailError,
    DuplicateAliasError: actual.DuplicateAliasError,
    createUser: (...args: unknown[]) => createUser(...args),
    findUserByEmail: (...args: unknown[]) => findUserByEmail(...args),
    findUserById: (...args: unknown[]) => findUserById(...args),
  }
})

import { yoga } from '../src/app.js'
import { signToken } from '../src/auth/tokens.js'
import { hashPassword } from '../src/auth/passwords.js'
import { DuplicateEmailError } from '../src/db/usersRepo.js'
import type { User } from '../src/types.js'

const post = (
  body: string,
  contentType = 'application/json',
  headers: Record<string, string> = {},
) =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': contentType, ...headers },
      body,
    }),
  )

const gql = (body: unknown, headers: Record<string, string> = {}) =>
  post(JSON.stringify(body), 'application/json', headers)

const testUser: User = {
  id: 'user-1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  phone: '+1000000',
  alias: 'alice',
  passwordHash: 'unset',
  createdAt: new Date(),
}

describe('GraphQL Yoga — schema validation', () => {
  beforeEach(() => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    messageQueueAdd.mockReset()
    messageQueueAdd.mockResolvedValue(undefined)
    findUserById.mockReset()
    findUserById.mockResolvedValue(testUser)
    isParticipant.mockReset()
    isParticipant.mockResolvedValue(true)
  })

  it('should return the conversation when it exists', async () => {
    conversationExists.mockResolvedValueOnce(true)
    getConversationMessages.mockResolvedValueOnce([])

    const response = await gql(
      { query: '{ conversation(id: "conv-app") { id messages { id } } }' },
      { Authorization: `Bearer ${await signToken('user-1')}` },
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversation).toMatchObject({ id: 'conv-app', messages: [] })
  })

  it('should return errors array when querying a non-existent field', async () => {
    const response = await post(JSON.stringify({ query: '{ nonExistent }' }))

    const json = await response.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.errors.length).toBeGreaterThan(0)
    expect(json.data).toBeUndefined()
  })

  it('should return 4xx when the request body is malformed JSON', async () => {
    const response = await post('not valid json')

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })
})

describe('GraphQL — sendMessage mutation', () => {
  let authHeaders: Record<string, string>

  beforeEach(async () => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    messageQueueAdd.mockReset()
    messageQueueAdd.mockResolvedValue(undefined)
    findUserById.mockReset()
    findUserById.mockResolvedValue(testUser)
    isParticipant.mockReset()
    isParticipant.mockResolvedValue(true)
    authHeaders = { Authorization: `Bearer ${await signToken('user-1')}` }
  })

  it('should return a GraphQL error when conversationId does not exist', async () => {
    conversationExists.mockResolvedValueOnce(false)

    const res = await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "missing-conv", body: "hi") {
            id body status
          }
        }`,
      },
      authHeaders,
    )

    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.data).toBeNull()
  })

  it('should return Message { id, body, status } when conversation exists', async () => {
    conversationExists.mockResolvedValueOnce(true)

    const res = await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "conv-1", body: "hello") {
            id body senderId senderName createdAt status
          }
        }`,
      },
      authHeaders,
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.sendMessage).toMatchObject({
      id: expect.any(String),
      body: 'hello',
      senderId: 'user-1',
      senderName: 'alice',
      createdAt: expect.any(String),
      status: 'QUEUED',
    })
  })

  it('should enqueue the message via messageQueue when conversation exists', async () => {
    conversationExists.mockResolvedValueOnce(true)

    await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "conv-1", body: "persisted") {
            id body status
          }
        }`,
      },
      authHeaders,
    )

    expect(messageQueueAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ conversationId: 'conv-1', body: 'persisted' }),
      expect.objectContaining({ attempts: expect.any(Number) }),
    )
  })
})

describe('GraphQL — auth', () => {
  beforeEach(() => {
    createUser.mockReset()
    findUserByEmail.mockReset()
    findUserById.mockReset()
  })

  const registerMutation = `mutation {
    register(input: {
      firstName: "Alice", lastName: "Smith", email: "Alice@Example.com",
      phone: "+1000000", alias: "alice", password: "s3cret!!"
    }) {
      token
      user { id firstName lastName email phone alias }
    }
  }`

  it('should register a user and return token plus user', async () => {
    createUser.mockImplementationOnce(async (input: unknown) => ({
      ...testUser,
      ...(input as object),
      email: 'alice@example.com',
    }))

    const res = await gql({ query: registerMutation })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.register.token).toEqual(expect.any(String))
    expect(json.data.register.user).toMatchObject({
      firstName: 'Alice',
      email: 'alice@example.com',
      alias: 'alice',
    })
  })

  it('should hash the password before storing it', async () => {
    createUser.mockImplementationOnce(async (input: unknown) => ({
      ...testUser,
      ...(input as object),
    }))

    await gql({ query: registerMutation })

    const input = createUser.mock.calls[0][0] as { passwordHash: string }
    expect(input.passwordHash).toBeDefined()
    expect(input.passwordHash).not.toBe('s3cret!!')
    expect(input.passwordHash).toMatch(/^\$2/)
  })

  it('should surface duplicate email as "email already registered"', async () => {
    createUser.mockRejectedValueOnce(new DuplicateEmailError('alice@example.com'))

    const res = await gql({ query: registerMutation })

    const json = await res.json()
    expect(json.errors[0].message).toBe('email already registered')
  })

  it('should login with valid credentials and return token plus user', async () => {
    findUserByEmail.mockResolvedValueOnce({
      ...testUser,
      passwordHash: await hashPassword('s3cret!'),
    })

    const res = await gql({
      query: `mutation {
        login(email: "alice@example.com", password: "s3cret!") {
          token
          user { id email alias }
        }
      }`,
    })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.login.token).toEqual(expect.any(String))
    expect(json.data.login.user).toMatchObject({ id: 'user-1', alias: 'alice' })
  })

  it('should reject login with unknown email using a constant message', async () => {
    findUserByEmail.mockResolvedValueOnce(null)

    const res = await gql({
      query: `mutation { login(email: "ghost@example.com", password: "x") { token } }`,
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Invalid email or password')
  })

  it('should reject login with wrong password using the same constant message', async () => {
    findUserByEmail.mockResolvedValueOnce({
      ...testUser,
      passwordHash: await hashPassword('right-password'),
    })

    const res = await gql({
      query: `mutation { login(email: "alice@example.com", password: "wrong") { token } }`,
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Invalid email or password')
  })

  it('should resolve me for a valid Bearer token', async () => {
    findUserById.mockResolvedValueOnce(testUser)
    const token = await signToken('user-1')

    const res = await gql(
      { query: '{ me { id email alias } }' },
      { Authorization: `Bearer ${token}` },
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.me).toMatchObject({ id: 'user-1', alias: 'alice' })
    expect(findUserById).toHaveBeenCalledWith('user-1')
  })

  it('should resolve me as null without an Authorization header', async () => {
    const res = await gql({ query: '{ me { id } }' })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.me).toBeNull()
  })
})

describe('GraphQL — sendMessage auth context', () => {
  beforeEach(() => {
    conversationExists.mockReset()
    messageQueueAdd.mockReset()
    messageQueueAdd.mockResolvedValue(undefined)
    findUserById.mockReset()
    isParticipant.mockReset()
    // Membership is covered separately; authenticated sends here assume membership.
    isParticipant.mockResolvedValue(true)
  })

  it('should derive sender from the authenticated user', async () => {
    conversationExists.mockResolvedValueOnce(true)
    findUserById.mockResolvedValueOnce(testUser)
    const token = await signToken('user-1')

    const res = await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "conv-1", body: "hi") {
            senderId senderName
          }
        }`,
      },
      { Authorization: `Bearer ${token}` },
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.sendMessage).toMatchObject({
      senderId: 'user-1',
      senderName: 'alice',
    })
  })

  it('should reject sendMessage without auth', async () => {
    conversationExists.mockResolvedValueOnce(true)

    const res = await gql({
      query: `mutation {
        sendMessage(conversationId: "conv-1", body: "hi") { id }
      }`,
    })

    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
  })
})

describe('GraphQL — conversations and memberships', () => {
  beforeEach(() => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    findUserById.mockReset()
    findUserByEmail.mockReset()
    createConversation.mockReset()
    addParticipantToConversation.mockReset()
    listUserConversations.mockReset()
    getParticipants.mockReset()
    isParticipant.mockReset()
  })

  const authHeader = async () => ({
    Authorization: `Bearer ${await signToken('user-1')}`,
  })

  it('should reject Query.conversations without auth', async () => {
    const res = await gql({ query: '{ conversations { id } }' })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Authentication required')
  })

  it('should list the conversations of the authenticated user', async () => {
    findUserById.mockResolvedValue(testUser)
    listUserConversations.mockResolvedValueOnce(['conv-1', 'conv-2'])
    getConversationMessages.mockResolvedValue([])

    const res = await gql(
      { query: '{ conversations { id messages { id } } }' },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversations).toEqual([
      { id: 'conv-1', messages: [] },
      { id: 'conv-2', messages: [] },
    ])
    expect(listUserConversations).toHaveBeenCalledWith('user-1')
  })

  it('should resolve Conversation.participants from the memberships repo', async () => {
    findUserById.mockResolvedValue(testUser)
    listUserConversations.mockResolvedValueOnce(['conv-1'])
    getConversationMessages.mockResolvedValue([])
    getParticipants.mockResolvedValueOnce([
      { userId: 'user-1', alias: 'alice', joinedAt: '2026-01-01T00:00:00.000Z' },
      { userId: 'user-2', alias: 'bob', joinedAt: '2026-01-02T00:00:00.000Z' },
    ])

    const res = await gql(
      { query: '{ conversations { id participants { id alias } } }' },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversations[0].participants).toEqual([
      { id: 'user-1', alias: 'alice' },
      { id: 'user-2', alias: 'bob' },
    ])
  })

  it('should reject createConversation without auth', async () => {
    const res = await gql({
      query: 'mutation { createConversation(title: "x") { id } }',
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Authentication required')
  })

  it('should create a conversation with the creator auto-joined', async () => {
    findUserById.mockResolvedValue(testUser)
    createConversation.mockResolvedValueOnce({
      id: 'conv-new',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    getConversationMessages.mockResolvedValue([])
    getParticipants.mockResolvedValueOnce([
      { userId: 'user-1', alias: 'alice', joinedAt: '2026-01-01T00:00:00.000Z' },
    ])

    const res = await gql(
      {
        query: `mutation {
          createConversation(title: "Team chat") { id participants { id alias } }
        }`,
      },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.createConversation.id).toBe('conv-new')
    expect(json.data.createConversation.participants).toEqual([
      { id: 'user-1', alias: 'alice' },
    ])
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'Team chat',
    )
  })

  it('should reject addParticipant without auth', async () => {
    const res = await gql({
      query:
        'mutation { addParticipant(conversationId: "conv-1", email: "bob@example.com") { id } }',
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Authentication required')
  })

  it('should surface unknown email as "No user with that email"', async () => {
    findUserById.mockResolvedValue(testUser)
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(true)
    findUserByEmail.mockResolvedValueOnce(null)

    const res = await gql(
      {
        query:
          'mutation { addParticipant(conversationId: "conv-1", email: "ghost@example.com") { id } }',
      },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors[0].message).toBe('No user with that email')
  })

  it('should add an existing user as participant by email', async () => {
    const bob: User = {
      ...testUser,
      id: 'user-2',
      email: 'bob@example.com',
      alias: 'bob',
    }
    findUserById.mockResolvedValue(testUser)
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(true)
    findUserByEmail.mockResolvedValueOnce(bob)
    addParticipantToConversation.mockResolvedValueOnce(undefined)
    getConversationMessages.mockResolvedValue([])

    const res = await gql(
      {
        query:
          'mutation { addParticipant(conversationId: "conv-1", email: "bob@example.com") { id } }',
      },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.addParticipant.id).toBe('conv-1')
    expect(addParticipantToConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ id: 'user-2' }),
    )
  })

  it('should reject sendMessage from an authenticated non-participant', async () => {
    findUserById.mockResolvedValue(testUser)
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(false)

    const res = await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "conv-1", body: "hi") { id }
        }`,
      },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors[0].message).toBe('Not a participant in this conversation')
  })

  it('should allow sendMessage from an authenticated participant', async () => {
    findUserById.mockResolvedValue(testUser)
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(true)

    const res = await gql(
      {
        query: `mutation {
          sendMessage(conversationId: "conv-1", body: "hi") { senderId senderName }
        }`,
      },
      await authHeader(),
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.sendMessage).toMatchObject({
      senderId: 'user-1',
      senderName: 'alice',
    })
  })
})

describe('GraphQL — conversation query', () => {
  let authHeaders: Record<string, string>

  beforeEach(async () => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    findUserById.mockReset()
    findUserById.mockResolvedValue(testUser)
    isParticipant.mockReset()
    isParticipant.mockResolvedValue(true)
    authHeaders = { Authorization: `Bearer ${await signToken('user-1')}` }
  })

  it('should hide queued messages from conversation query', async () => {
    conversationExists.mockResolvedValueOnce(true)
    getConversationMessages.mockResolvedValueOnce([
      {
        id: 'msg-1',
        body: 'hi',
        senderId: 'user-1',
        senderName: 'Alice',
        createdAt: new Date().toISOString(),
        status: 'queued',
      },
    ])

    const res = await gql(
      { query: `{ conversation(id: "conv-q") { id messages { id body status } } }` },
      authHeaders,
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversation.id).toBe('conv-q')
    expect(json.data.conversation.messages).toHaveLength(0)
  })

  it('should include messages once status is sent', async () => {
    conversationExists.mockResolvedValueOnce(true)
    getConversationMessages.mockResolvedValueOnce([
      {
        id: 'msg-1',
        body: 'hi',
        senderId: 'user-1',
        senderName: 'Alice',
        createdAt: new Date().toISOString(),
        status: 'sent',
      },
    ])

    const res = await gql(
      { query: `{ conversation(id: "conv-q") { id messages { id body status } } }` },
      authHeaders,
    )

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversation.messages).toHaveLength(1)
    expect(json.data.conversation.messages[0]).toMatchObject({
      body: 'hi',
      status: 'SENT',
    })
  })

  it('should return a GraphQL error when conversation does not exist', async () => {
    conversationExists.mockResolvedValueOnce(false)

    const res = await gql({ query: `{ conversation(id: "ghost") { id } }` }, authHeaders)

    // conversation field is nullable, so GraphQL nulls the field and surfaces the error
    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.data.conversation).toBeNull()
  })

  it('should reject Query.conversation without auth', async () => {
    conversationExists.mockResolvedValueOnce(true)

    const res = await gql({ query: `{ conversation(id: "conv-q") { id } }` })

    const json = await res.json()
    expect(json.errors[0].message).toBe('Authentication required')
    expect(json.data.conversation).toBeNull()
  })

  it('should reject Query.conversation for an authenticated non-participant', async () => {
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(false)

    const res = await gql({ query: `{ conversation(id: "conv-q") { id } }` }, authHeaders)

    const json = await res.json()
    expect(json.errors[0].message).toBe('Not a participant in this conversation')
    expect(json.data.conversation).toBeNull()
  })
})

describe('GraphQL — authorization guards', () => {
  let authHeaders: Record<string, string>

  beforeEach(async () => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    findUserById.mockReset()
    findUserById.mockResolvedValue(testUser)
    findUserByEmail.mockReset()
    isParticipant.mockReset()
    addParticipantToConversation.mockReset()
    authHeaders = { Authorization: `Bearer ${await signToken('user-1')}` }
  })

  it('should reject addParticipant when the caller is not a participant', async () => {
    conversationExists.mockResolvedValueOnce(true)
    isParticipant.mockResolvedValueOnce(false)

    const res = await gql(
      {
        query:
          'mutation { addParticipant(conversationId: "conv-1", email: "bob@example.com") { id } }',
      },
      authHeaders,
    )

    const json = await res.json()
    expect(json.errors[0].message).toBe('Not a participant in this conversation')
    expect(addParticipantToConversation).not.toHaveBeenCalled()
  })

  it('should reject subscription without auth', async () => {
    const res = await post(
      JSON.stringify({
        query:
          'subscription { onMessageUpdate(conversationId: "conv-1") { id } }',
      }),
      'application/json',
      { Accept: 'text/event-stream' },
    )

    const text = await res.text()
    expect(text).toContain('Authentication required')
  })

  it('should reject subscription from an authenticated non-participant', async () => {
    isParticipant.mockResolvedValueOnce(false)

    const res = await post(
      JSON.stringify({
        query:
          'subscription { onMessageUpdate(conversationId: "conv-1") { id } }',
      }),
      'application/json',
      { Accept: 'text/event-stream', ...authHeaders },
    )

    const text = await res.text()
    expect(text).toContain('Not a participant in this conversation')
  })
})

describe('GraphQL — register input hygiene', () => {
  beforeEach(() => {
    createUser.mockReset()
  })

  it('should trim all profile fields before creating the user', async () => {
    createUser.mockImplementationOnce(async (input: unknown) => ({
      ...testUser,
      ...(input as object),
    }))

    const res = await gql({
      query: `mutation {
        register(input: {
          firstName: " Alice ", lastName: " Smith ", email: " Alice@Example.com ",
          phone: " +1000000 ", alias: " alice ", password: "s3cret!!"
        }) { user { email alias firstName } }
      }`,
    })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    const input = createUser.mock.calls[0][0] as Record<string, string>
    expect(input.email).toBe('Alice@Example.com')
    expect(input.alias).toBe('alice')
    expect(input.firstName).toBe('Alice')
    expect(input.lastName).toBe('Smith')
    expect(input.phone).toBe('+1000000')
  })

  it('should reject a password shorter than 8 characters', async () => {
    const res = await gql({
      query: `mutation {
        register(input: {
          firstName: "Alice", lastName: "Smith", email: "alice@example.com",
          phone: "+1000000", alias: "alice", password: "short"
        }) { token }
      }`,
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe(
      'Password must be at least 8 characters',
    )
    expect(createUser).not.toHaveBeenCalled()
  })

  it('should reject a blank alias', async () => {
    const res = await gql({
      query: `mutation {
        register(input: {
          firstName: "Alice", lastName: "Smith", email: "alice@example.com",
          phone: "+1000000", alias: "   ", password: "s3cret!!"
        }) { token }
      }`,
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('alias is required')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('should reject a blank email', async () => {
    const res = await gql({
      query: `mutation {
        register(input: {
          firstName: "Alice", lastName: "Smith", email: "  ",
          phone: "+1000000", alias: "alice", password: "s3cret!!"
        }) { token }
      }`,
    })

    const json = await res.json()
    expect(json.errors[0].message).toBe('email is required')
    expect(createUser).not.toHaveBeenCalled()
  })
})
