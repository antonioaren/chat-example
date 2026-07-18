import type { Conversation, Message, Participant } from '@/types/chat'
import {
  loadConversation,
  saveConversation,
} from '@/stubs/messages'

// Stub service — swap these implementations for real API calls later.

const SIMULATE_SEND_FAILURE = true
const SEND_FAILURE_RATE = 0.3

export class CapacityError extends Error {
  constructor() {
    super('This conversation is already full (2/2).')
    this.name = 'CapacityError'
  }
}

function updateMessageStatus(
  conversationId: string,
  messageId: string,
  status: Message['status'],
): void {
  const conversation = loadConversation(conversationId)
  saveConversation(conversationId, {
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, status } : message,
    ),
  })
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation> {
  return loadConversation(conversationId)
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  return loadConversation(conversationId).messages
}

export async function getMessage(
  conversationId: string,
  messageId: string,
): Promise<Message | undefined> {
  const conversation = loadConversation(conversationId)
  return conversation.messages.find((message) => message.id === messageId)
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

export function sendMessage(
  conversationId: string,
  body: string,
  senderId: string,
): Promise<Message> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (
        SIMULATE_SEND_FAILURE &&
        Math.random() < SEND_FAILURE_RATE
      ) {
        reject(new Error('Failed to send message'))
        return
      }

      const conversation = loadConversation(conversationId)
      const message: Message = {
        id: crypto.randomUUID(),
        body,
        senderId,
        status: 'queued',
        createdAt: new Date().toISOString(),
      }

      saveConversation(conversationId, {
        ...conversation,
        messages: [...conversation.messages, message],
      })

      setTimeout(
        () => updateMessageStatus(conversationId, message.id, 'sent'),
        800,
      )
      setTimeout(
        () => updateMessageStatus(conversationId, message.id, 'delivered'),
        2000,
      )

      resolve(message)
    }, 1000)
  })
}
