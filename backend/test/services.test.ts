import { describe, it, expect, beforeEach } from 'vitest'
import { sendMessage } from '../src/services.js'
import { conversations } from '../src/store.js'

// ---------------------------------------------------------------------------
// services.sendMessage — aggregate-root invariant
//
// These tests are written against the CURRENT (broken) implementation and
// are expected to be RED until a coder fixes services.ts to:
//   1. reject when the conversation is missing
//   2. persist the message inside conversation.messages
// ---------------------------------------------------------------------------

describe('services — sendMessage aggregate invariant', () => {
  beforeEach(() => {
    conversations.clear()
  })

  it('should reject with "Conversation not found" when conversationId does not exist', async () => {
    // Current implementation never checks the store → resolves instead of rejects → RED
    await expect(sendMessage('no-such-conv', 'hello')).rejects.toThrow(
      /conversation not found/i,
    )
  })

  it('should persist the returned message inside conversation.messages', async () => {
    conversations.set('conv-1', { id: 'conv-1', messages: [] })

    const msg = await sendMessage('conv-1', 'persisted body')

    // Current implementation never touches the store → conv.messages stays [] → RED
    const conv = conversations.get('conv-1')!
    expect(conv.messages).toHaveLength(1)
    expect(conv.messages[0]).toMatchObject({
      id: msg.id,
      body: 'persisted body',
      status: 'queued',
    })
  })
})
