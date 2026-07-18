// Messaging-provider seam (Twilio stand-in). id/createdAt are generated here
// (the producer) so the SK is deterministic for the worker downstream.

import { messageQueue } from "./queue/messageQueue.js";
import type { Message } from "./types.js";

/**
 * Enqueue a message for async processing and return it immediately with
 * `status: "queued"` — the mutation stays synchronous-feeling; the worker
 * persists it and schedules status progression.
 */
export const sendMessage = async (
	conversationId: string,
	body: string,
	senderId: string,
	senderName: string,
): Promise<Message> => {
	const message: Message = {
		id: crypto.randomUUID(),
		body,
		senderId,
		senderName,
		createdAt: new Date().toISOString(),
		status: "queued",
	};

	await messageQueue.add(
		"send-message",
		{
			conversationId,
			messageId: message.id,
			body: message.body,
			senderId: message.senderId,
			senderName: message.senderName,
			createdAt: message.createdAt,
		},
		// Retry on transient failure (e.g. Redis/DynamoDB blip mid-job) —
		// the whole job re-runs; putMessage + statusQueue.add are safe to
		// repeat (overwrite/duplicate delayed jobs), so this recovers a
		// message that would otherwise be stuck invisible at `queued`.
		{ attempts: 3, backoff: { type: "exponential", delay: 1000 } },
	);

	return message;
};
