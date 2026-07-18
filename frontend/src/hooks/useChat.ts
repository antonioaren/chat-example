import { useCallback, useEffect, useRef, useState } from 'react'

import * as chatService from '@/stubs/chatService'
import { subscribeToConversation } from '@/stubs/messages'
import { isOwnMessage, type Message } from '@/types/chat'

interface UseChatResult {
  messages: Message[]
  isLoading: boolean
  fetchError: string | null
  sendMessage: (text: string) => Promise<void>
  retry: (messageId: string) => Promise<void>
}

const TERMINAL_STATUSES = new Set<Message['status']>(['delivered', 'failed'])

function isPendingOwnMessage(
  message: Message,
  currentUserId: string,
): boolean {
  return (
    isOwnMessage(message, currentUserId) &&
    !TERMINAL_STATUSES.has(message.status)
  )
}

export function useChat(
  conversationId: string,
  currentUserId: string,
): UseChatResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const messagesRef = useRef<Message[]>(messages)
  messagesRef.current = messages

  const loadMessages = useCallback(async () => {
    const fetched = await chatService.fetchMessages(conversationId)
    setMessages(fetched)
  }, [conversationId])

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
    return subscribeToConversation(conversationId, () => {
      void loadMessages()
    })
  }, [conversationId, loadMessages])

  useEffect(() => {
    const pendingMessages = messages.filter((message) =>
      isPendingOwnMessage(message, currentUserId),
    )
    if (pendingMessages.length === 0) return

    const intervalId = window.setInterval(async () => {
      const updates = await Promise.all(
        pendingMessages.map(async (message) => ({
          message,
          latest: await chatService.getMessage(conversationId, message.id),
        })),
      )

      setMessages((current) => {
        let next = current

        for (const { message, latest } of updates) {
          if (!latest || latest.status === message.status) continue

          next = next.map((item) =>
            item.id === message.id ? latest : item,
          )
        }

        return next
      })
    }, 300)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [conversationId, currentUserId, messages])

  const submitOutbound = useCallback(
    async (optimisticId: string, body: string): Promise<void> => {
      try {
        const serverMessage = await chatService.sendMessage(
          conversationId,
          body,
          currentUserId,
        )
        setMessages((prev) =>
          prev.map((message) =>
            message.id === optimisticId ? serverMessage : message,
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
    [conversationId, currentUserId],
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
