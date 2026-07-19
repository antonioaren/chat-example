import { describe, it, expect, vi, beforeEach } from 'vitest'

const add = vi.fn()

vi.mock('../src/queue/messageQueue.js', () => ({
  messageQueue: { add: (...args: unknown[]) => add(...args) },
}))

import { sendMessage } from '../src/services.js'

describe('services — sendMessage', () => {
  beforeEach(() => {
    add.mockReset()
    add.mockResolvedValue(undefined)
  })

  it('should return a message with status queued immediately', async () => {
    const message = await sendMessage('conv-1', 'hello', 'user-1', 'Alice')

    expect(message).toMatchObject({
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      status: 'queued',
    })
    expect(message.id).toEqual(expect.any(String))
    expect(message.createdAt).toEqual(expect.any(String))
  })

  it('should enqueue a send-message job with the generated id/createdAt', async () => {
    const message = await sendMessage('conv-1', 'hello', 'user-1', 'Alice')

    expect(add).toHaveBeenCalledWith(
      'send-message',
      {
        conversationId: 'conv-1',
        messageId: message.id,
        body: 'hello',
        senderId: 'user-1',
        senderName: 'Alice',
        createdAt: message.createdAt,
      },
      expect.objectContaining({ attempts: expect.any(Number) }),
    )
  })

  it('should reject when the queue add call fails', async () => {
    add.mockRejectedValueOnce(new Error('redis unavailable'))

    await expect(
      sendMessage('conv-1', 'hello', 'user-1', 'Alice'),
    ).rejects.toThrow('redis unavailable')
  })
})
