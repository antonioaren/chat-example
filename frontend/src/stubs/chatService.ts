import type { Conversation, Message, Participant } from '@/types/chat'
import { loadConversation, saveConversation } from '@/stubs/messages'
import { gqlFetch, sseClient } from '@/services/graphqlClient'

// Messages go through the GraphQL backend; participants stay local
// (join-by-name has no backend counterpart yet).

export class CapacityError extends Error {
  constructor() {
    super('This conversation is already full (2/2).')
    this.name = 'CapacityError'
  }
}

interface GraphQLMessage {
  id: string
  body: string
  senderId: string
  senderName: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED'
  createdAt: string
}

const STATUS_MAP: Record<GraphQLMessage['status'], Message['status']> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
}

const MESSAGE_FIELDS = 'id body senderId senderName status createdAt'

function toClientMessage(message: GraphQLMessage): Message {
  return {
    id: message.id,
    body: message.body,
    senderId: message.senderId,
    status: STATUS_MAP[message.status],
    createdAt: message.createdAt,
  }
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation> {
  const data = await gqlFetch<{
    conversation: { id: string; messages: GraphQLMessage[] }
  }>(
    `query ($id: ID!) {
      conversation(id: $id) { id messages { ${MESSAGE_FIELDS} } }
    }`,
    { id: conversationId },
  )

  // Participants are stored locally; the backend only knows about messages.
  const local = loadConversation(conversationId)

  return {
    id: data.conversation.id,
    participants: local.participants,
    messages: data.conversation.messages.map(toClientMessage),
  }
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const conversation = await getConversation(conversationId)
  return conversation.messages
}

export async function addParticipant(
  conversationId: string,
  userId: string,
  name: string,
): Promise<Participant> {
  const conversation = loadConversation(conversationId)
  const existing = conversation.participants.find(
    (participant) => participant.id === userId,
  )

  if (existing) {
    return existing
  }

  if (conversation.participants.length >= 2) {
    throw new CapacityError()
  }

  const participant: Participant = { id: userId, name }
  saveConversation(conversationId, {
    ...conversation,
    participants: [...conversation.participants, participant],
  })

  return participant
}

export async function sendMessage(
  conversationId: string,
  body: string,
  senderId: string,
  senderName: string,
): Promise<Message> {
  const data = await gqlFetch<{ sendMessage: GraphQLMessage }>(
    `mutation ($conversationId: ID!, $body: String!, $senderId: ID!, $senderName: String!) {
      sendMessage(
        conversationId: $conversationId
        body: $body
        senderId: $senderId
        senderName: $senderName
      ) { ${MESSAGE_FIELDS} }
    }`,
    { conversationId, body, senderId, senderName },
  )

  return toClientMessage(data.sendMessage)
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: Message) => void,
  onError?: (error: unknown) => void,
): () => void {
  return sseClient.subscribe<{ onMessageUpdate: GraphQLMessage }>(
    {
      query: `subscription ($id: ID!) {
        onMessageUpdate(conversationId: $id) { ${MESSAGE_FIELDS} }
      }`,
      variables: { id: conversationId },
    },
    {
      next: (result) => {
        if (result.data?.onMessageUpdate) {
          onMessage(toClientMessage(result.data.onMessageUpdate))
        }
      },
      error: (error) => {
        onError?.(error)
      },
      complete: () => {},
    },
  )
}
