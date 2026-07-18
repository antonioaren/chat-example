import type { Message } from '@/types/chat'
import { MessageBubble } from '@/components/chat/MessageBubble'

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  isLoading: boolean
  onRetry?: (messageId: string) => void
}

export function MessageList({
  messages,
  currentUserId,
  isLoading,
  onRetry,
}: MessageListProps) {
  if (!isLoading && messages.length === 0) {
    return <p className="chat-empty">No messages yet</p>
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          currentUserId={currentUserId}
          onRetry={onRetry}
        />
      ))}
    </div>
  )
}
