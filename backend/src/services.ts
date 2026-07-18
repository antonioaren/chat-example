// Simulate a messaging provider while preserving conversation ownership.

import { addMessage } from "./store.js";

export const sendMessage = (conversationId: string, body: string) =>
	addMessage(conversationId, body);