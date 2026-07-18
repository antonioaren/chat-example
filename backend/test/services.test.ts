import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  sendMessage,
  SENT_DELAY_MS,
  DELIVERED_DELAY_MS,
} from '../src/services.js'
import { conversations, pubsub } from '../src/store.js'
import type { Message } from '../src/types.js'

describe('services — sendMessage aggregate invariant', () => {
  beforeEach(() => {
    conversations.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should reject with "Conversation not found" when conversationId does not exist', async () => {
    await expect(
      sendMessage('no-such-conv', 'hello', 'user-1', 'Alice'),
    ).rejects.toThrow(
      /conversation not found/i,
    )
  })

  it('should persist the returned message inside conversation.messages', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const msg = await sendMessage('conv-1', 'persisted body', 'user-1', 'Alice')

    const conv = conversations.get('conv-1')!
    expect(conv.messages).toHaveLength(1)
    expect(conv.messages[0]).toMatchObject({
      id: msg.id,
      body: 'persisted body',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: expect.any(String),
      status: 'queued',
    })
  })

  it('should return queued immediately and advance status via provider timers', async () => {
    vi.useFakeTimers()
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const msg = await sendMessage('conv-1', 'lifecycle', 'user-1', 'Alice')
    expect(msg.status).toBe('queued')

    await vi.advanceTimersByTimeAsync(SENT_DELAY_MS)
    expect(conversations.get('conv-1')!.messages[0].status).toBe('sent')

    await vi.advanceTimersByTimeAsync(
      DELIVERED_DELAY_MS - SENT_DELAY_MS,
    )
    const delivered = conversations.get('conv-1')!.messages[0]
    expect(delivered.status).toBe('delivered')
    if (delivered.status === 'delivered') {
      expect(delivered.deliveredAt).toEqual(expect.any(String))
    }
  })

  it('should publish to subscribers only starting at sent', async () => {
    vi.useFakeTimers()
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const events: Message[] = []
    const iterator = pubsub.subscribe('message-conv-1')[Symbol.asyncIterator]()
    const pump = (async () => {
      for await (const payload of {
        [Symbol.asyncIterator]: () => iterator,
      }) {
        events.push(payload as Message)
      }
    })()
    void pump
    await Promise.resolve()

    await sendMessage('conv-1', 'peer visibility', 'user-1', 'Alice')
    await Promise.resolve()
    expect(events).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(SENT_DELAY_MS)
    expect(events).toHaveLength(1)
    expect(events[0]?.status).toBe('sent')

    await vi.advanceTimersByTimeAsync(
      DELIVERED_DELAY_MS - SENT_DELAY_MS,
    )
    expect(events).toHaveLength(2)
    expect(events[1]?.status).toBe('delivered')

    await iterator.return?.()
  })
})
