// Delayed-job queue: status progression (queued -> sent -> delivered) is
// scheduled here rather than via in-worker setTimeout/sleep.

import { Queue } from "bullmq";
import { connection } from "./connection.js";
import type { StatusPatch } from "../types.js";

// `deliveredAt` is stamped by the worker at execution time (not enqueue
// time), since a delayed job can run later than its nominal delay under
// backpressure — omit it here and let the "delivered" patch carry only
// what the producer actually knows in advance.
export type StatusUpdatePatch =
	| { status: "sent" }
	| { status: "delivered" }
	| { status: "failed"; error: string };

export type StatusUpdateJob = {
	conversationId: string;
	createdAt: string;
	messageId: string;
	patch: StatusUpdatePatch;
};

export const statusQueue = new Queue<StatusUpdateJob>("message-status", {
	connection,
});
