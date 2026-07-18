import { describe, it, expect, vi, beforeEach } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('../../src/db/client.js', () => ({
  docClient: { send },
  TABLE_NAME: 'chat-messages',
}))

import {
  conversationExists,
  putMessage,
  updateMessageStatus,
  getConversationMessages,
} from '../../src/db/messagesRepo.js'
import type { Message } from '../../src/types.js'

describe('messagesRepo — conversationExists', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should query the METADATA item and return true when found', async () => {
    send.mockResolvedValueOnce({ Item: { PK: 'CONVERSATION#conv-1', SK: 'METADATA' } })

    const result = await conversationExists('conv-1')

    expect(result).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      Key: { PK: 'CONVERSATION#conv-1', SK: 'METADATA' },
    })
  })

  it('should return false when no item is found', async () => {
    send.mockResolvedValueOnce({ Item: undefined })

    const result = await conversationExists('missing-conv')

    expect(result).toBe(false)
  })
})

describe('messagesRepo — putMessage', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({})
  })

  it('should PutCommand with a deterministic SK from createdAt and id', async () => {
    const message: Message = {
      id: 'msg-1',
      body: 'hello',
      senderId: 'user-1',
      senderName: 'Alice',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'queued',
    }

    await putMessage('conv-1', message)

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      Item: {
        PK: 'CONVERSATION#conv-1',
        SK: 'MESSAGE#2026-01-01T00:00:00.000Z#msg-1',
        id: 'msg-1',
        body: 'hello',
        status: 'queued',
      },
    })
  })
})

describe('messagesRepo — updateMessageStatus', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should UpdateCommand keyed by the deterministic SK and set status', async () => {
    send.mockResolvedValueOnce({
      Attributes: {
        id: 'msg-1',
        body: 'hello',
        senderId: 'user-1',
        senderName: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'sent',
      },
    })

    const result = await updateMessageStatus(
      'conv-1',
      '2026-01-01T00:00:00.000Z',
      'msg-1',
      { status: 'sent' },
    )

    expect(result.status).toBe('sent')
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      Key: {
        PK: 'CONVERSATION#conv-1',
        SK: 'MESSAGE#2026-01-01T00:00:00.000Z#msg-1',
      },
    })
    expect(command.input.ExpressionAttributeValues[':status']).toBe('sent')
  })

  it('should include deliveredAt in the update when patch is delivered', async () => {
    send.mockResolvedValueOnce({
      Attributes: {
        id: 'msg-1',
        status: 'delivered',
        deliveredAt: '2026-01-01T00:00:06.000Z',
      },
    })

    await updateMessageStatus('conv-1', '2026-01-01T00:00:00.000Z', 'msg-1', {
      status: 'delivered',
      deliveredAt: '2026-01-01T00:00:06.000Z',
    })

    const command = send.mock.calls[0][0]
    expect(command.input.ExpressionAttributeValues[':deliveredAt']).toBe(
      '2026-01-01T00:00:06.000Z',
    )
  })

  it('should include error in the update when patch is failed', async () => {
    send.mockResolvedValueOnce({
      Attributes: { id: 'msg-1', status: 'failed', error: 'boom' },
    })

    await updateMessageStatus('conv-1', '2026-01-01T00:00:00.000Z', 'msg-1', {
      status: 'failed',
      error: 'boom',
    })

    const command = send.mock.calls[0][0]
    expect(command.input.ExpressionAttributeValues[':error']).toBe('boom')
  })
})

describe('messagesRepo — getConversationMessages', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should query with begins_with(SK, MESSAGE#) in ascending order', async () => {
    send.mockResolvedValueOnce({
      Items: [
        { id: 'msg-1', status: 'sent' },
        { id: 'msg-2', status: 'delivered' },
      ],
    })

    const result = await getConversationMessages('conv-1')

    expect(result).toHaveLength(2)
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': 'CONVERSATION#conv-1',
        ':skPrefix': 'MESSAGE#',
      },
      ScanIndexForward: true,
    })
  })

  it('should return an empty array when no items are found', async () => {
    send.mockResolvedValueOnce({ Items: undefined })

    const result = await getConversationMessages('conv-empty')

    expect(result).toEqual([])
  })
})
