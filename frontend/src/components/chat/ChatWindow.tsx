import type { Message } from '@/types/chat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'

interface ChatWindowProps {
  messages: Message[]
  currentUserId: string
  isLoading: boolean
  onSend: (text: string) => void
  onRetry?: (messageId: string) => void
}

export function ChatWindow({
  messages,
  currentUserId,
  isLoading,
  onSend,
  onRetry,
}: ChatWindowProps) {
  return (
    <div className="chat-window">
      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        isLoading={isLoading}
        onRetry={onRetry}
      />
      <MessageInput onSend={onSend} />
    </div>
  )
}
