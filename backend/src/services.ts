// Simulate a messaging provider while preserving conversation ownership.

import { addMessage } from "./store.js";

export const sendMessage = (
	conversationId: string,
	body: string,
	senderId: string,
	senderName: string,
) => addMessage(conversationId, body, senderId, senderName);