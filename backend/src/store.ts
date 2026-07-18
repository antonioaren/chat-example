// Real-time delivery seam. Persistence lives in db/messagesRepo.ts; this
// module keeps only the pubsub used by onMessageUpdate.
//
// The pubsub is Redis-backed, not in-memory: the queue worker runs in a
// separate process, so an in-memory pubsub would publish into the worker's
// process where no SSE subscriber exists. Redis carries the event across
// processes to the server, which holds the SSE connections.

import { createRedisEventTarget } from "@graphql-yoga/redis-event-target";
import { createPubSub } from "graphql-yoga";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// A subscribed ioredis connection cannot issue regular commands, so the
// event target requires two dedicated connections (publish + subscribe).
const publishClient = new Redis(redisUrl);
const subscribeClient = new Redis(redisUrl);

for (const client of [publishClient, subscribeClient]) {
	client.on("error", (error) => {
		console.error("Redis pubsub connection error:", error);
	});
}

export const pubsub = createPubSub({
	eventTarget: createRedisEventTarget({ publishClient, subscribeClient }),
});
