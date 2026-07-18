import { describe, it, expect, beforeEach } from 'vitest'
import { conversations, addMessage, updateStatus } from '../src/store.js'
import { yoga } from '../src/app.js'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const gql = (body: unknown) =>
  yoga.fetch(
    new Request('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

// ---------------------------------------------------------------------------
// Store — Conversation as sole aggregate root
// ---------------------------------------------------------------------------

describe('store — addMessage', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should throw when conversationId does not exist', async () => {
    await expect(
      addMessage('unknown-conv', 'hello', 'user-1', 'Alice'),
    ).rejects.toThrow(
      /conversation not found/i,
    )
  })

  it('should append the new message to conversation.messages', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const msg = await addMessage('conv-1', 'hello world', 'user-1', 'Alice')

    const conv = conversations.get('conv-1')!
    expect(conv.messages).toHaveLength(1)
    expect(conv.messages[0]).toMatchObject({
      id: msg.id,
      body: 'hello world',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: expect.any(String),
      status: 'queued',
    })
  })

  it('should not leave the message only in a standalone Map outside the conversation', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    await addMessage('conv-1', 'check nesting', 'user-1', 'Alice')

    // The message must be reachable through the conversation, not just a side-channel Map
    const conv = conversations.get('conv-1')!
    expect(conv.messages.some((m) => m.body === 'check nesting')).toBe(true)
  })

  it('should append multiple messages in insertion order', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    await addMessage('conv-1', 'first', 'user-1', 'Alice')
    await addMessage('conv-1', 'second', 'user-1', 'Alice')
    await addMessage('conv-1', 'third', 'user-1', 'Alice')

    const conv = conversations.get('conv-1')!
    expect(conv.messages).toHaveLength(3)
    expect(conv.messages.map((m) => m.body)).toEqual(['first', 'second', 'third'])
  })
})

describe('store — updateStatus', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should update the nested message inside conversation.messages', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })
    const msg = await addMessage('conv-1', 'update me', 'user-1', 'Alice')

    updateStatus('conv-1', msg.id, { status: 'sent' })

    const conv = conversations.get('conv-1')!
    const updated = conv.messages.find((m) => m.id === msg.id)
    expect(updated).toBeDefined()
    expect(updated?.status).toBe('sent')
  })

  it('should update deliveredAt on a delivered status patch', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })
    const msg = await addMessage('conv-1', 'deliver me', 'user-1', 'Alice')
    const deliveredAt = new Date().toISOString()

    updateStatus('conv-1', msg.id, { status: 'delivered', deliveredAt })

    const conv = conversations.get('conv-1')!
    const updated = conv.messages.find((m) => m.id === msg.id) as {
      status: string
      deliveredAt: string
    }
    expect(updated?.status).toBe('delivered')
    expect(updated?.deliveredAt).toBe(deliveredAt)
  })

  it('should return undefined when conversationId does not exist', () => {
    const result = updateStatus('no-such-conv', 'any-id', { status: 'sent' })

    expect(result).toBeUndefined()
  })

  it('should return undefined when messageId is not found in a valid conversation', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const result = updateStatus('conv-1', 'no-such-msg', { status: 'sent' })

    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// GraphQL — sendMessage mutation
// ---------------------------------------------------------------------------

describe('GraphQL — sendMessage mutation', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should return a GraphQL error when conversationId does not exist', async () => {
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
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

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

  it('should persist message inside conversation.messages after sendMessage', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    await gql({
      query: `mutation {
        sendMessage(conversationId: "conv-1", body: "persisted", senderId: "user-1", senderName: "Alice") {
          id body status
        }
      }`,
    })

    const conv = conversations.get('conv-1')!
    expect(conv.messages).toHaveLength(1)
    expect(conv.messages[0].body).toBe('persisted')
  })
})

// ---------------------------------------------------------------------------
// GraphQL — conversation query
// ---------------------------------------------------------------------------

describe('GraphQL — conversation query', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should return conversation with messages when it exists', async () => {
    conversations.set('conv-q', { id: 'conv-q', messages: [] })
    await gql({
      query: `mutation { sendMessage(conversationId: "conv-q", body: "hi", senderId: "user-1", senderName: "Alice") { id } }`,
    })

    const res = await gql({
      query: `{ conversation(id: "conv-q") { id messages { id body status } } }`,
    })

    const json = await res.json()
    expect(json.errors).toBeUndefined()
    expect(json.data.conversation.id).toBe('conv-q')
    expect(json.data.conversation.messages).toHaveLength(1)
    expect(json.data.conversation.messages[0]).toMatchObject({
      body: 'hi',
      status: 'QUEUED',
    })
  })

  it('should return a GraphQL error when conversation does not exist', async () => {
    const res = await gql({
      query: `{ conversation(id: "ghost") { id } }`,
    })

    // conversation field is nullable, so GraphQL nulls the field and surfaces the error
    const json = await res.json()
    expect(Array.isArray(json.errors)).toBe(true)
    expect(json.data.conversation).toBeNull()
  })
})
