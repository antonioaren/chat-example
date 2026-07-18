// Real-time delivery seam. Persistence now lives in db/messagesRepo.ts;
// this module keeps only the pubsub used by onMessageUpdate.

import { createPubSub } from "graphql-yoga";

export const pubsub = createPubSub();
