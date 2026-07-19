// Consumer for the `message-status` delayed queue: applies the status patch
// in the DB, then publishes so `onMessageUpdate` fires exactly as before.

import { Worker, type Job } from "bullmq";
import { connection } from "./connection.js";
import * as messagesRepo from "../db/messagesRepo.js";
import { pubsub } from "../store.js";
import type { StatusPatch } from "../types.js";
import type { StatusUpdateJob } from "./statusQueue.js";

export async function processStatusUpdate(
	job: Job<StatusUpdateJob>,
): Promise<void> {
	const { conversationId, createdAt, messageId, patch } = job.data;

	// `deliveredAt` is stamped here, at actual execution time, rather than
	// at enqueue time — a delayed job can run later than its nominal delay.
	const resolvedPatch: StatusPatch =
		patch.status === "delivered"
			? { status: "delivered", deliveredAt: new Date().toISOString() }
			: patch;

	const updatedMessage = await messagesRepo.updateMessageStatus(
		conversationId,
		createdAt,
		messageId,
		resolvedPatch,
	);

	pubsub.publish(`message-${conversationId}`, updatedMessage);
}

export function createStatusWorker(): Worker<StatusUpdateJob> {
	return new Worker<StatusUpdateJob>("message-status", processStatusUpdate, {
		connection,
	});
}
