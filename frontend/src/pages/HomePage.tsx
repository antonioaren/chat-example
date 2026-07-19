import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { ChatPage } from '@/pages/ChatPage'
import * as chatService from '@/stubs/chatService'
import type { Conversation } from '@/types/chat'

// Landing route: jump straight into the first conversation, or show the
// empty state (ChatPage without an id) so the user can create one.
export function HomePage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false

    chatService
      .fetchConversations()
      .then((fetched) => {
        if (!cancelled) setConversations(fetched)
      })
      .catch(() => {
        if (!cancelled) setConversations([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (conversations === null) {
    return <p className="chat-page__loading">Loading…</p>
  }

  if (conversations.length > 0) {
    return <Navigate to={`/conversations/${conversations[0].id}`} replace />
  }

  return <ChatPage />
}
