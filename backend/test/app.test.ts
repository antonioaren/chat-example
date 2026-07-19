import { describe, it, expect, beforeEach, vi } from 'vitest'

const conversationExists = vi.fn()
const getConversationMessages = vi.fn()
const messageQueueAdd = vi.fn()

vi.mock('../src/db/messagesRepo.js', () => ({
  conversationExists: (...args: unknown[]) => conversationExists(...args),
  getConversationMessages: (...args: unknown[]) =>
    getConversationMessages(...args),
}))

vi.mock('../src/queue/messageQueue.js', () => ({
  messageQueue: { add: (...args: unknown[]) => messageQueueAdd(...args) },
}))

import { yoga } from '../src/app.js'

const post = (body: string, contentType = 'application/json') =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    }),
  )

const gql = (body: unknown) => post(JSON.stringify(body))

describe('GraphQL Yoga — schema validation', () => {
  beforeEach(() => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    messageQueueAdd.mockReset()
    messageQueueAdd.mockResolvedValue(undefined)
  })

  it('should return the conversation when it exists', async () => {
    conversationExists.mockResolvedValueOnce(true)
    getConversationMessages.mockResolvedValueOnce([])

    const response = await post(
      JSON.stringify({ query: '{ conversation(id: "conv-app") { id messages { id } } }' }),
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
  beforeEach(() => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
    messageQueueAdd.mockReset()
    messageQueueAdd.mockResolvedValue(undefined)
  })

  it('should return a GraphQL error when conversationId does not exist', async () => {
    conversationExists.mockResolvedValueOnce(false)

    const res = await gql({
      query: `mutation {
        sendMessage(conversationId: "missing-conv", body: "hi", senderId: "user-1", senderName: "Alice") {
          id body status
        }
      }`,
    })

    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.data).toBeNull()
  })

  it('should return Message { id, body, status } when conversation exists', async () => {
    conversationExists.mockResolvedValueOnce(true)

    const res = await gql({
      query: `mutation {
        sendMessage(conversationId: "conv-1", body: "hello", senderId: "user-1", senderName: "Alice") {
          id body senderId senderName createdAt status
        }
      }`,
    })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.sendMessage).toMatchObject({
      id: expect.any(String),
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: expect.any(String),
      status: 'QUEUED',
    })
  })

  it('should enqueue the message via messageQueue when conversation exists', async () => {
    conversationExists.mockResolvedValueOnce(true)

    await gql({
      query: `mutation {
        sendMessage(conversationId: "conv-1", body: "persisted", senderId: "user-1", senderName: "Alice") {
          id body status
        }
      }`,
    })

    expect(messageQueueAdd).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ conversationId: 'conv-1', body: 'persisted' }),
      expect.objectContaining({ attempts: expect.any(Number) }),
    )
  })
})

describe('GraphQL — conversation query', () => {
  beforeEach(() => {
    conversationExists.mockReset()
    getConversationMessages.mockReset()
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

    const res = await gql({
      query: `{ conversation(id: "conv-q") { id messages { id body status } } }`,
    })

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

    const res = await gql({
      query: `{ conversation(id: "conv-q") { id messages { id body status } } }`,
    })

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

    const res = await gql({
      query: `{ conversation(id: "ghost") { id } }`,
    })

    // conversation field is nullable, so GraphQL nulls the field and surfaces the error
    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.data.conversation).toBeNull()
  })
})
