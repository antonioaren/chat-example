import { memo } from 'react'

import { isOwnMessage, type Message } from '@/types/chat'

interface MessageBubbleProps {
  message: Message
  currentUserId: string
  onRetry?: (messageId: string) => void
}

export const MessageBubble = memo(function MessageBubble({
  message,
  currentUserId,
  onRetry,
}: MessageBubbleProps) {
  const isOwn = isOwnMessage(message, currentUserId)

  return (
    <div
      className={`message-bubble ${isOwn ? 'message-bubble--own' : 'message-bubble--peer'}`}
    >
      <p className="message-bubble__body">{message.body}</p>
      {isOwn ? (
        <span className="message-bubble__status" aria-label="Message status">
          {message.status}
        </span>
      ) : null}
      {isOwn && message.status === 'failed' && message.error ? (
        <span className="message-bubble__error" role="alert">
          {message.error}
        </span>
      ) : null}
      {isOwn && message.status === 'failed' ? (
        <button
          className="message-bubble__retry"
          type="button"
          onClick={() => onRetry?.(message.id)}
        >
          Retry
        </button>
      ) : null}
    </div>
  )
})
