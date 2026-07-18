import { AddUserForm } from '@/components/AddUserForm'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useChat } from '@/hooks/useChat'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { DEMO_CONVERSATION_ID } from '@/stubs/messages'

export function ChatPage() {
  const {
    userId,
    name,
    participants,
    isJoined,
    isFull,
    joinError,
    join,
  } = useCurrentUser(DEMO_CONVERSATION_ID)

  const { messages, isLoading, fetchError, sendMessage, retry } = useChat(
    DEMO_CONVERSATION_ID,
    userId ?? '',
    name ?? '',
  )

  return (
    <main className="chat-page">
      <h1>Chat</h1>

      {isJoined && name ? (
        <p className="chat-page__identity">
          Signed in as <strong>{name}</strong>
        </p>
      ) : null}

      {participants.length > 0 ? (
        <ul className="chat-page__participants" aria-label="Participants">
          {participants.map((participant) => (
            <li key={participant.id}>{participant.name}</li>
          ))}
        </ul>
      ) : null}

      {!isJoined ? (
        <AddUserForm isFull={isFull} error={joinError} onSubmit={join} />
      ) : (
        <>
          {isLoading && messages.length === 0 ? (
            <p>Loading messages…</p>
          ) : null}
          {fetchError ? <p role="alert">{fetchError}</p> : null}

          <ChatWindow
            messages={messages}
            currentUserId={userId!}
            isLoading={isLoading}
            onSend={sendMessage}
            onRetry={retry}
          />
        </>
      )}
    </main>
  )
}
