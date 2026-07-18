import { createSchema } from "graphql-yoga";
import { sendMessage } from "./services.js";
import { conversations, pubsub } from "./store.js";
import { MESSAGE_STATUS, statusLabel } from "./types.js";
import type { Conversation, Message } from "./types.js";

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
			messages: (conversation: Conversation) =>
				conversation.messages.filter(
					(message) => message.status !== "queued",
				),
		},
		Query: {
			conversation: (_parent, args: { id: string }) => {
				const conversation = conversations.get(args.id);
				if (!conversation) {
					throw new Error("Conversation not found");
				}
				return conversation;
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
				const conversation = conversations.get(conversationId);
				if (!conversation) {
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
