import { useCallback, useEffect, useRef, useState } from 'react'

import * as chatService from '@/stubs/chatService'
import type { Message } from '@/types/chat'

interface UseChatResult {
  messages: Message[]
  isLoading: boolean
  fetchError: string | null
  sendMessage: (text: string) => Promise<void>
  retry: (messageId: string) => Promise<void>
}

function upsertById(messages: Message[], incoming: Message): Message[] {
  const exists = messages.some((message) => message.id === incoming.id)
  if (exists) {
    return messages.map((message) =>
      message.id === incoming.id ? incoming : message,
    )
  }
  return [...messages, incoming]
}

export function useChat(
  conversationId: string,
  currentUserId: string,
  currentUserName: string,
): UseChatResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const messagesRef = useRef<Message[]>(messages)
  messagesRef.current = messages

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setFetchError(null)

    chatService
      .fetchMessages(conversationId)
      .then((fetched) => {
        if (!cancelled) {
          setMessages(fetched)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFetchError(
            error instanceof Error
              ? error.message
              : 'Failed to load messages',
          )
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    return chatService.subscribeToMessages(conversationId, (incoming) => {
      setMessages((prev) => upsertById(prev, incoming))
    })
  }, [conversationId])

  const submitOutbound = useCallback(
    async (optimisticId: string, body: string): Promise<void> => {
      try {
        const serverMessage = await chatService.sendMessage(
          conversationId,
          body,
          currentUserId,
          currentUserName,
        )
        // Replace the optimistic row with the server message (status queued).
        // Peers do not see this yet — backend publishes only from `sent` onward
        // via onMessageUpdate, which also advances this client's status.
        setMessages((prev) =>
          upsertById(
            prev.filter((message) => message.id !== optimisticId),
            serverMessage,
          ),
        )
      } catch {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === optimisticId
              ? { ...message, status: 'failed' }
              : message,
          ),
        )
      }
    },
    [conversationId, currentUserId, currentUserName],
  )

  const sendMessage = useCallback(
    async (text: Message['body']): Promise<void> => {
      const optimisticId = `optimistic-${crypto.randomUUID()}`
      const optimisticMessage: Message = {
        id: optimisticId,
        body: text,
        senderId: currentUserId,
        status: 'queued',
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, optimisticMessage])
      await submitOutbound(optimisticId, text)
    },
    [currentUserId, submitOutbound],
  )

  const retry = useCallback(
    async (messageId: Message['id']): Promise<void> => {
      const failedMessage = messagesRef.current.find(
        (message) =>
          message.id === messageId && message.status === 'failed',
      )
      if (!failedMessage) return

      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, status: 'queued' }
            : message,
        ),
      )
      await submitOutbound(messageId, failedMessage.body)
    },
    [submitOutbound],
  )

  return { messages, isLoading, fetchError, sendMessage, retry }
}
