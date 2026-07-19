export type Participant = {
  id: string;
  name: string;
};

export type Conversation = {
  id: string;
  participants: Participant[];
  messages: Message[];
};

export type Message = {
  id: string;
  body: string;
  senderId: string;
  status: "queued" | "sent" | "delivered" | "failed";
  createdAt: string;
  /** Populated on failed sends so the UI can explain why. */
  error?: string;
};

export function isOwnMessage(
  message: Message,
  currentUserId: string,
): boolean {
  return message.senderId === currentUserId;
}
