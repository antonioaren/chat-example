import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AddParticipantForm } from '@/components/AddParticipantForm'
import { ConversationsSidebar } from '@/components/ConversationsSidebar'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import * as chatService from '@/stubs/chatService'
import type { Conversation } from '@/types/chat'

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    chatService
      .fetchConversations()
      .then(async (fetched) => {
        if (cancelled) return
        // Deep links can point at a conversation the list query does not
        // include yet (e.g. just added in another tab); fetch it directly so
        // the participants header is not silently empty.
        if (
          conversationId &&
          !fetched.some((conversation) => conversation.id === conversationId)
        ) {
          try {
            const active = await chatService.getConversation(conversationId)
            if (!cancelled) setConversations([...fetched, active])
            return
          } catch {
            // Not readable (unknown id or not a participant); the chat area
            // surfaces its own fetch error.
          }
        }
        if (!cancelled) setConversations(fetched)
      })
      .catch(() => {
        // Sidebar staleness is non-fatal; the active chat still loads.
      })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  const handleCreate = useCallback(async (): Promise<void> => {
    setIsCreating(true)
    setCreateError(null)
    try {
      const conversation = await chatService.createConversation()
      setConversations((prev) => [...prev, conversation])
      navigate(`/conversations/${conversation.id}`)
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : 'Failed to create conversation',
      )
    } finally {
      setIsCreating(false)
    }
  }, [navigate])

  const handleAddParticipant = useCallback(
    async (email: string): Promise<void> => {
      if (!conversationId) return
      const updated = await chatService.addParticipant(conversationId, email)
      setConversations((prev) =>
        prev.some((conversation) => conversation.id === updated.id)
          ? prev.map((conversation) =>
              conversation.id === updated.id ? updated : conversation,
            )
          : [...prev, updated],
      )
    },
    [conversationId],
  )

  const { messages, isLoading, fetchError, sendMessage, retry } = useChat(
    conversationId ?? '',
    user?.id ?? '',
  )

  const activeConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  )
  const participants = activeConversation?.participants ?? []

  function handleLogout(): void {
    logout()
    navigate('/login')
  }

  return (
    <main className="chat-page chat-page--split">
      <ConversationsSidebar
        conversations={conversations}
        onCreate={handleCreate}
        isCreating={isCreating}
        createError={createError}
      />

      <section className="chat-page__main">
        <header className="chat-page__header">
          <h1>Chat</h1>
          <div className="chat-page__session">
            <p className="chat-page__identity">
              Signed in as <strong>{user?.alias}</strong>
            </p>
            <button
              className="chat-page__logout"
              type="button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>

        {conversationId ? (
          <>
            {participants.length > 0 ? (
              <ul className="chat-page__participants" aria-label="Participants">
                {participants.map((participant) => (
                  <li key={participant.id}>{participant.name}</li>
                ))}
              </ul>
            ) : null}

            <AddParticipantForm onSubmit={handleAddParticipant} />

            {isLoading && messages.length === 0 ? (
              <p>Loading messages…</p>
            ) : null}
            {fetchError ? <p role="alert">{fetchError}</p> : null}

            <ChatWindow
              messages={messages}
              currentUserId={user?.id ?? ''}
              isLoading={isLoading}
              onSend={sendMessage}
              onRetry={retry}
            />
          </>
        ) : (
          <p className="chat-page__empty">
            No conversation selected. Create one to start chatting.
          </p>
        )}
      </section>
    </main>
  )
}
