import type { Conversation, Message, Participant } from '@/types/chat'
import type { AuthPayload, RegisterInput, User } from '@/types/user'
import { gqlFetch, handleAuthError, sseClient } from '@/services/graphqlClient'

interface GraphQLMessage {
  id: string
  body: string
  senderId: string
  senderName: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED'
  createdAt: string
}

interface GraphQLParticipant {
  id: string
  alias: string
}

interface GraphQLConversation {
  id: string
  participants: GraphQLParticipant[]
  messages: GraphQLMessage[]
}

const STATUS_MAP: Record<GraphQLMessage['status'], Message['status']> = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
}

const MESSAGE_FIELDS = 'id body senderId senderName status createdAt'
const USER_FIELDS = 'id firstName lastName email phone alias'
const CONVERSATION_FIELDS = `id participants { id alias } messages { ${MESSAGE_FIELDS} }`

function toClientMessage(message: GraphQLMessage): Message {
  return {
    id: message.id,
    body: message.body,
    senderId: message.senderId,
    status: STATUS_MAP[message.status],
    createdAt: message.createdAt,
  }
}

function toClientParticipant(participant: GraphQLParticipant): Participant {
  return { id: participant.id, name: participant.alias }
}

function toClientConversation(conversation: GraphQLConversation): Conversation {
  return {
    id: conversation.id,
    participants: conversation.participants.map(toClientParticipant),
    messages: conversation.messages.map(toClientMessage),
  }
}

export async function register(input: RegisterInput): Promise<AuthPayload> {
  const data = await gqlFetch<{ register: AuthPayload }>(
    `mutation ($input: RegisterInput!) {
      register(input: $input) { token user { ${USER_FIELDS} } }
    }`,
    { input },
  )
  return data.register
}

export async function login(
  email: string,
  password: string,
): Promise<AuthPayload> {
  const data = await gqlFetch<{ login: AuthPayload }>(
    `mutation ($email: String!, $password: String!) {
      login(email: $email, password: $password) { token user { ${USER_FIELDS} } }
    }`,
    { email, password },
  )
  return data.login
}

export async function me(): Promise<User | null> {
  const data = await gqlFetch<{ me: User | null }>(
    `query { me { ${USER_FIELDS} } }`,
  )
  return data.me
}

export async function fetchConversations(): Promise<Conversation[]> {
  const data = await gqlFetch<{ conversations: GraphQLConversation[] }>(
    `query { conversations { ${CONVERSATION_FIELDS} } }`,
  )
  return data.conversations.map(toClientConversation)
}

export async function createConversation(title?: string): Promise<Conversation> {
  const data = await gqlFetch<{ createConversation: GraphQLConversation }>(
    `mutation ($title: String) {
      createConversation(title: $title) { ${CONVERSATION_FIELDS} }
    }`,
    { title },
  )
  return toClientConversation(data.createConversation)
}

export async function addParticipant(
  conversationId: string,
  email: string,
): Promise<Conversation> {
  const data = await gqlFetch<{ addParticipant: GraphQLConversation }>(
    `mutation ($conversationId: ID!, $email: String!) {
      addParticipant(conversationId: $conversationId, email: $email) {
        ${CONVERSATION_FIELDS}
      }
    }`,
    { conversationId, email },
  )
  return toClientConversation(data.addParticipant)
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation> {
  const data = await gqlFetch<{ conversation: GraphQLConversation }>(
    `query ($id: ID!) {
      conversation(id: $id) { ${CONVERSATION_FIELDS} }
    }`,
    { id: conversationId },
  )
  return toClientConversation(data.conversation)
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const conversation = await getConversation(conversationId)
  return conversation.messages
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<Message> {
  const data = await gqlFetch<{ sendMessage: GraphQLMessage }>(
    `mutation ($conversationId: ID!, $body: String!) {
      sendMessage(conversationId: $conversationId, body: $body) { ${MESSAGE_FIELDS} }
    }`,
    { conversationId, body },
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
        if (error instanceof Error) {
          handleAuthError(error.message)
        }
        onError?.(error)
      },
      complete: () => {},
    },
  )
}
