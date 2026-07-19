// Shared Redis connection for BullMQ Queue/Worker instances.
// maxRetriesPerRequest: null is a BullMQ requirement for blocking connections.

import { Redis } from "ioredis";

export const connection = new Redis(
	process.env.REDIS_URL ?? "redis://localhost:6379",
	{ maxRetriesPerRequest: null },
);

// ioredis emits 'error' on connection failures; an unhandled listener
// crashes the process, so log instead and let ioredis's own reconnect
// logic handle recovery.
connection.on("error", (error) => {
	console.error("Redis connection error:", error);
});
