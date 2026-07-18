// Simulate a messaging provider while preserving conversation ownership.

import { addMessage, updateStatus } from "./store.js";
import type { Message } from "./types.js";

/** Delay before the provider accepts the message (`queued` → `sent`). */
export const SENT_DELAY_MS = 3000;

/** Delay before the provider confirms delivery (`sent` → `delivered`). */
export const DELIVERED_DELAY_MS = 6000;

/**
 * Persist a queued message and schedule provider status progression.
 * Subscribers are notified only when status advances (first event at `sent`).
 */
export const sendMessage = async (
	conversationId: string,
	body: string,
	senderId: string,
	senderName: string,
): Promise<Message> => {
	const message = await addMessage(
		conversationId,
		body,
		senderId,
		senderName,
	);

	// Simulate Twilio accepting then delivering the message
	setTimeout(() => {
		updateStatus(conversationId, message.id, {
			status: "sent",
		});
	}, SENT_DELAY_MS);

	setTimeout(() => {
		updateStatus(conversationId, message.id, {
			status: "delivered",
			deliveredAt: new Date().toISOString(),
		});
	}, DELIVERED_DELAY_MS);

	return message;
};
