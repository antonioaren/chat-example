import type { Conversation, Message, Participant } from '@/types/chat'

export const DEMO_CONVERSATION_ID = 'demo-1'

const STORAGE_PREFIX = 'simple-react-chat:conversation:'

export function storageKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`
}

export function defaultConversation(conversationId: string): Conversation {
  return {
    id: conversationId,
    participants: [],
    messages: [],
  }
}

function isParticipant(value: unknown): value is Participant {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Participant).id === 'string' &&
    typeof (value as Participant).name === 'string'
  )
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Message).id === 'string' &&
    typeof (value as Message).body === 'string' &&
    typeof (value as Message).senderId === 'string' &&
    typeof (value as Message).status === 'string' &&
    typeof (value as Message).createdAt === 'string'
  )
}

export function parseConversation(
  raw: string | null,
  conversationId: string,
): Conversation {
  if (!raw) return defaultConversation(conversationId)

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Conversation).participants) ||
      !Array.isArray((parsed as Conversation).messages)
    ) {
      return defaultConversation(conversationId)
    }

    const conversation = parsed as Conversation
    const participants = conversation.participants.filter(isParticipant)
    const messages = conversation.messages.filter(isMessage)

    return {
      id: typeof conversation.id === 'string' ? conversation.id : conversationId,
      participants,
      messages,
    }
  } catch {
    return defaultConversation(conversationId)
  }
}

export function loadConversation(conversationId: string): Conversation {
  if (typeof window === 'undefined') {
    return defaultConversation(conversationId)
  }

  const raw = window.localStorage.getItem(storageKey(conversationId))
  return parseConversation(raw, conversationId)
}

export function saveConversation(
  conversationId: string,
  conversation: Conversation,
): void {
  window.localStorage.setItem(
    storageKey(conversationId),
    JSON.stringify(conversation),
  )
}

export function subscribeToConversation(
  conversationId: string,
  onChange: () => void,
): () => void {
  const key = storageKey(conversationId)

  function handleStorage(event: StorageEvent): void {
    if (event.key === key) {
      onChange()
    }
  }

  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener('storage', handleStorage)
  }
}
