import { describe, it, expect, vi, beforeEach } from 'vitest'

const putMessage = vi.fn()
const statusQueueAdd = vi.fn()

vi.mock('../../src/db/messagesRepo.js', () => ({
  putMessage: (...args: unknown[]) => putMessage(...args),
}))

vi.mock('../../src/queue/statusQueue.js', () => ({
  statusQueue: { add: (...args: unknown[]) => statusQueueAdd(...args) },
}))

vi.mock('../../src/queue/connection.js', () => ({
  connection: {},
}))

import {
  processSendMessage,
  SENT_DELAY_MS,
  DELIVERED_DELAY_MS,
} from '../../src/queue/messageWorker.js'
import type { SendMessageJob } from '../../src/queue/messageQueue.js'
import type { Job } from 'bullmq'

function makeJob(data: SendMessageJob): Job<SendMessageJob> {
  return { data } as Job<SendMessageJob>
}

describe('messageWorker — processSendMessage', () => {
  beforeEach(() => {
    putMessage.mockReset()
    statusQueueAdd.mockReset()
    putMessage.mockResolvedValue(undefined)
    statusQueueAdd.mockResolvedValue(undefined)
  })

  it('should persist the message with status queued', async () => {
    const job = makeJob({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await processSendMessage(job)

    expect(putMessage).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        id: 'msg-1',
        body: 'hello',
        senderId: 'user-1',
        senderName: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'queued',
      }),
    )
  })

  it('should enqueue a sent status job with SENT_DELAY_MS delay', async () => {
    const job = makeJob({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await processSendMessage(job)

    expect(statusQueueAdd).toHaveBeenCalledWith(
      'status-update',
      expect.objectContaining({
        conversationId: 'conv-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        messageId: 'msg-1',
        patch: { status: 'sent' },
      }),
      expect.objectContaining({ delay: SENT_DELAY_MS }),
    )
  })

  it('should enqueue a delivered status job with DELIVERED_DELAY_MS delay', async () => {
    const job = makeJob({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await processSendMessage(job)

    expect(statusQueueAdd).toHaveBeenCalledWith(
      'status-update',
      expect.objectContaining({
        conversationId: 'conv-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        messageId: 'msg-1',
        patch: { status: 'delivered' },
      }),
      expect.objectContaining({ delay: DELIVERED_DELAY_MS }),
    )
  })

  it('should call putMessage before enqueueing status jobs', async () => {
    const callOrder: string[] = []
    putMessage.mockImplementation(async () => {
      callOrder.push('putMessage')
    })
    statusQueueAdd.mockImplementation(async () => {
      callOrder.push('statusQueue.add')
    })

    const job = makeJob({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await processSendMessage(job)

    expect(callOrder[0]).toBe('putMessage')
  })
})
