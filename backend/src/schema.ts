import { createSchema } from "graphql-yoga";
import { sendMessage } from "./services.js";
import { pubsub } from "./store.js";
import * as messagesRepo from "./db/messagesRepo.js";
import { MESSAGE_STATUS, statusLabel } from "./types.js";
import type { Message } from "./types.js";

type ConversationResult = {
	id: string;
	messages: Message[];
};

export const schema = createSchema({
	typeDefs: /* GraphQL */ `
		enum MessageStatus {
			QUEUED
			SENT
			DELIVERED
			FAILED
		}

		type Message {
			id: ID!
			body: String!
			senderId: ID!
			senderName: String!
			createdAt: String!
			status: MessageStatus!
			statusLabel: String!
			deliveredAt: String
			error: String
		}

		type Conversation {
			id: ID!
			messages: [Message!]!
		}

		type Query {
			conversation(id: ID!): Conversation
		}

		type Mutation {
			sendMessage(
				conversationId: ID!
				body: String!
				senderId: ID!
				senderName: String!
			): Message!
		}

		type Subscription {
			onMessageUpdate(conversationId: ID!): Message!
		}
	`,
	resolvers: {
		MessageStatus: MESSAGE_STATUS,
		Message: {
			statusLabel: (message: Message) => statusLabel(message),
		},
		Conversation: {
			// Backend owns visibility: queued messages are not exposed via query.
			// The sender still gets QUEUED from the mutation response + optimistic UI.
			messages: (conversation: ConversationResult) =>
				conversation.messages.filter(
					(message) => message.status !== "queued",
				),
		},
		Query: {
			conversation: async (_parent, args: { id: string }) => {
				const exists = await messagesRepo.conversationExists(args.id);
				if (!exists) {
					throw new Error("Conversation not found");
				}
				const messages = await messagesRepo.getConversationMessages(
					args.id,
				);
				return { id: args.id, messages };
			},
		},
		Mutation: {
			sendMessage: async (
				_parent,
				{
					conversationId,
					body,
					senderId,
					senderName,
				}: {
					conversationId: string;
					body: string;
					senderId: string;
					senderName: string;
				},
			) => {
				const exists =
					await messagesRepo.conversationExists(conversationId);
				if (!exists) {
					throw new Error("Conversation not found");
				}
				return sendMessage(
					conversationId,
					body,
					senderId,
					senderName,
				);
			},
		},
		Subscription: {
			onMessageUpdate: {
				subscribe: (
					_parent,
					{ conversationId }: { conversationId: string },
				) => pubsub.subscribe(`message-${conversationId}`),
				resolve: (message: Message) => message,
			},
		},
	},
});
