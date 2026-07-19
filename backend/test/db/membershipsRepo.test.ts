import { describe, it, expect, vi, beforeEach } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('../../src/db/client.js', () => ({
  docClient: { send },
  TABLE_NAME: 'chat-messages',
}))

import {
  createConversation,
  addParticipantToConversation,
  listUserConversations,
  getParticipants,
  isParticipant,
} from '../../src/db/membershipsRepo.js'
import type { User } from '../../src/types.js'

const user: User = {
  id: 'user-1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  phone: '+1000000',
  alias: 'alice',
  passwordHash: 'hash',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('membershipsRepo — createConversation', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({})
  })

  it('should write metadata, membership and participant items in one transaction', async () => {
    const conversation = await createConversation(user, 'Team chat')

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    const items = command.input.TransactItems.map(
      (item: { Put: { Item: Record<string, unknown> } }) => item.Put.Item,
    )
    expect(items).toHaveLength(3)

    const metadata = items.find(
      (item: Record<string, unknown>) => item.SK === 'METADATA',
    )
    expect(metadata).toMatchObject({
      PK: `CONVERSATION#${conversation.id}`,
      SK: 'METADATA',
      id: conversation.id,
      title: 'Team chat',
      createdBy: 'user-1',
      createdAt: expect.any(String),
    })

    const membership = items.find((item: Record<string, unknown>) =>
      String(item.PK).startsWith('USER#'),
    )
    expect(membership).toMatchObject({
      PK: 'USER#user-1',
      SK: `CONVERSATION#${conversation.id}`,
      userId: 'user-1',
      conversationId: conversation.id,
      joinedAt: expect.any(String),
    })

    const participant = items.find((item: Record<string, unknown>) =>
      String(item.SK).startsWith('PARTICIPANT#'),
    )
    expect(participant).toMatchObject({
      PK: `CONVERSATION#${conversation.id}`,
      SK: 'PARTICIPANT#user-1',
      userId: 'user-1',
      alias: 'alice',
      joinedAt: expect.any(String),
    })
  })

  it('should generate a uuid conversation id and omit title when not given', async () => {
    const conversation = await createConversation(user)

    expect(conversation.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    const command = send.mock.calls[0][0]
    const metadata = command.input.TransactItems.map(
      (item: { Put: { Item: Record<string, unknown> } }) => item.Put.Item,
    ).find((item: Record<string, unknown>) => item.SK === 'METADATA')
    expect(metadata).not.toHaveProperty('title')
  })
})

describe('membershipsRepo — addParticipantToConversation', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should write membership and participant items when user is not yet a participant', async () => {
    // isParticipant lookup misses, then the transaction succeeds.
    send.mockResolvedValueOnce({ Item: undefined })
    send.mockResolvedValueOnce({})

    await addParticipantToConversation('conv-1', user)

    expect(send).toHaveBeenCalledTimes(2)
    const command = send.mock.calls[1][0]
    const items = command.input.TransactItems.map(
      (item: { Put: { Item: Record<string, unknown> } }) => item.Put.Item,
    )
    expect(items).toHaveLength(2)
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          PK: 'USER#user-1',
          SK: 'CONVERSATION#conv-1',
        }),
        expect.objectContaining({
          PK: 'CONVERSATION#conv-1',
          SK: 'PARTICIPANT#user-1',
          alias: 'alice',
        }),
      ]),
    )
  })

  it('should be an idempotent no-op when the user is already a participant', async () => {
    send.mockResolvedValueOnce({
      Item: { PK: 'CONVERSATION#conv-1', SK: 'PARTICIPANT#user-1' },
    })

    await addParticipantToConversation('conv-1', user)

    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('membershipsRepo — listUserConversations', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should query memberships by USER# partition and return conversation ids', async () => {
    send.mockResolvedValueOnce({
      Items: [
        { PK: 'USER#user-1', SK: 'CONVERSATION#conv-1', conversationId: 'conv-1' },
        { PK: 'USER#user-1', SK: 'CONVERSATION#conv-2', conversationId: 'conv-2' },
      ],
    })

    const result = await listUserConversations('user-1')

    expect(result).toEqual(['conv-1', 'conv-2'])
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': 'USER#user-1',
        ':skPrefix': 'CONVERSATION#',
      },
    })
  })

  it('should return an empty array when the user has no conversations', async () => {
    send.mockResolvedValueOnce({ Items: undefined })

    await expect(listUserConversations('user-none')).resolves.toEqual([])
  })
})

describe('membershipsRepo — getParticipants', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should query PARTICIPANT# items and map to participant records', async () => {
    send.mockResolvedValueOnce({
      Items: [
        {
          PK: 'CONVERSATION#conv-1',
          SK: 'PARTICIPANT#user-1',
          userId: 'user-1',
          alias: 'alice',
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const result = await getParticipants('conv-1')

    expect(result).toEqual([
      { userId: 'user-1', alias: 'alice', joinedAt: '2026-01-01T00:00:00.000Z' },
    ])
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      ExpressionAttributeValues: {
        ':pk': 'CONVERSATION#conv-1',
        ':skPrefix': 'PARTICIPANT#',
      },
    })
  })
})

describe('membershipsRepo — isParticipant', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('should get the participant item and return true when present', async () => {
    send.mockResolvedValueOnce({
      Item: { PK: 'CONVERSATION#conv-1', SK: 'PARTICIPANT#user-1' },
    })

    await expect(isParticipant('conv-1', 'user-1')).resolves.toBe(true)
    const command = send.mock.calls[0][0]
    expect(command.input).toMatchObject({
      TableName: 'chat-messages',
      Key: { PK: 'CONVERSATION#conv-1', SK: 'PARTICIPANT#user-1' },
    })
  })

  it('should return false when the participant item is missing', async () => {
    send.mockResolvedValueOnce({ Item: undefined })

    await expect(isParticipant('conv-1', 'ghost')).resolves.toBe(false)
  })
})
