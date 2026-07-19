// Consumer for the `send-message` queue: persists the queued message, then
// schedules the two status-progression delayed jobs. No pubsub publish here
// — preserves the "queued invisible to peers" invariant; visibility starts
// at `sent`, published by statusWorker.

import { Worker, type Job } from "bullmq";
import { connection } from "./connection.js";
import { statusQueue } from "./statusQueue.js";
import * as messagesRepo from "../db/messagesRepo.js";
import type { Message } from "../types.js";
import type { SendMessageJob } from "./messageQueue.js";

/** Delay before the provider accepts the message (`queued` → `sent`). */
export const SENT_DELAY_MS = 3000;

/** Delay before the provider confirms delivery (`sent` → `delivered`). */
export const DELIVERED_DELAY_MS = 6000;

export async function processSendMessage(
	job: Job<SendMessageJob>,
): Promise<void> {
	const { conversationId, messageId, body, senderId, senderName, createdAt } =
		job.data;

	const message: Message = {
		id: messageId,
		body,
		senderId,
		senderName,
		createdAt,
		status: "queued",
	};

	await messagesRepo.putMessage(conversationId, message);

	const retryOptions = {
		attempts: 3,
		backoff: { type: "exponential", delay: 1000 } as const,
	};

	await statusQueue.add(
		"status-update",
		{
			conversationId,
			createdAt,
			messageId,
			patch: { status: "sent" },
		},
		{ delay: SENT_DELAY_MS, ...retryOptions },
	);

	await statusQueue.add(
		"status-update",
		{
			conversationId,
			createdAt,
			messageId,
			patch: { status: "delivered" },
		},
		{ delay: DELIVERED_DELAY_MS, ...retryOptions },
	);
}

export function createMessageWorker(): Worker<SendMessageJob> {
	return new Worker<SendMessageJob>("send-message", processSendMessage, {
		connection,
	});
}
