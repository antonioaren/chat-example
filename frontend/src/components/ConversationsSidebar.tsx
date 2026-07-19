import { NavLink } from 'react-router-dom'

import type { Conversation } from '@/types/chat'

interface ConversationsSidebarProps {
  conversations: Conversation[]
  onCreate: () => void
  isCreating: boolean
  createError?: string | null
}

function conversationLabel(conversation: Conversation): string {
  return `Chat ${conversation.id.slice(0, 8)}`
}

export function ConversationsSidebar({
  conversations,
  onCreate,
  isCreating,
  createError,
}: ConversationsSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Conversations">
      <button
        className="sidebar__new join-form__submit"
        type="button"
        disabled={isCreating}
        onClick={onCreate}
      >
        {isCreating ? 'Creating…' : 'New conversation'}
      </button>
      {createError ? (
        <p className="sidebar__error" role="alert">
          {createError}
        </p>
      ) : null}

      {conversations.length === 0 ? (
        <p className="sidebar__empty">No conversations yet.</p>
      ) : (
        <nav className="sidebar__list">
          {conversations.map((conversation) => (
            <NavLink
              key={conversation.id}
              to={`/conversations/${conversation.id}`}
              className={({ isActive }) =>
                isActive
                  ? 'sidebar__item sidebar__item--active'
                  : 'sidebar__item'
              }
            >
              {conversationLabel(conversation)}
            </NavLink>
          ))}
        </nav>
      )}
    </aside>
  )
}
