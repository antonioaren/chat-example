import { createSchema, createGraphQLError } from "graphql-yoga";
import { sendMessage } from "./services.js";
import { pubsub } from "./store.js";
import * as messagesRepo from "./db/messagesRepo.js";
import * as membershipsRepo from "./db/membershipsRepo.js";
import * as usersRepo from "./db/usersRepo.js";
import { hashPassword, verifyPassword } from "./auth/passwords.js";
import { signToken } from "./auth/tokens.js";
import type { AuthContext } from "./auth/context.js";
import { MESSAGE_STATUS, statusLabel } from "./types.js";
import type { Message, User } from "./types.js";

type ConversationResult = {
	id: string;
	messages: Message[];
};

type AuthPayload = {
	token: string;
	user: User;
};

async function buildAuthPayload(user: User): Promise<AuthPayload> {
	return { token: await signToken(user.id), user };
}

function requireUser(context: AuthContext): User {
	if (!context.currentUser) {
		throw createGraphQLError("Authentication required");
	}
	return context.currentUser;
}

async function requireParticipant(
	context: AuthContext,
	conversationId: string,
): Promise<User> {
	const user = requireUser(context);
	const member = await membershipsRepo.isParticipant(conversationId, user.id);
	if (!member) {
		throw createGraphQLError("Not a participant in this conversation");
	}
	return user;
}

async function loadConversation(
	conversationId: string,
): Promise<ConversationResult> {
	const messages = await messagesRepo.getConversationMessages(conversationId);
	return { id: conversationId, messages };
}

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
			participants: [Participant!]!
		}

		type Participant {
			id: ID!
			alias: String!
		}

		type User {
			id: ID!
			firstName: String!
			lastName: String!
			email: String!
			phone: String!
			alias: String!
		}

		type AuthPayload {
			token: String!
			user: User!
		}

		input RegisterInput {
			firstName: String!
			lastName: String!
			email: String!
			phone: String!
			alias: String!
			password: String!
		}

		type Query {
			conversation(id: ID!): Conversation
			conversations: [Conversation!]!
			me: User
		}

		type Mutation {
			register(input: RegisterInput!): AuthPayload!
			login(email: String!, password: String!): AuthPayload!
			createConversation(title: String): Conversation!
			addParticipant(conversationId: ID!, email: String!): Conversation!
			sendMessage(conversationId: ID!, body: String!): Message!
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
			participants: async (conversation: ConversationResult) => {
				const participants = await membershipsRepo.getParticipants(
					conversation.id,
				);
				return participants.map((participant) => ({
					id: participant.userId,
					alias: participant.alias,
				}));
			},
		},
		Query: {
			me: (_parent: unknown, _args: unknown, context: AuthContext) =>
				context.currentUser,
			conversation: async (
				_parent: unknown,
				args: { id: string },
				context: AuthContext,
			) => {
				requireUser(context);
				const exists = await messagesRepo.conversationExists(args.id);
				if (!exists) {
					throw new Error("Conversation not found");
				}
				await requireParticipant(context, args.id);
				return loadConversation(args.id);
			},
			conversations: async (
				_parent: unknown,
				_args: unknown,
				context: AuthContext,
			) => {
				const user = requireUser(context);
				const conversationIds = await membershipsRepo.listUserConversations(
					user.id,
				);
				return Promise.all(conversationIds.map(loadConversation));
			},
		},
		Mutation: {
			register: async (
				_parent: unknown,
				{
					input,
				}: {
					input: {
						firstName: string;
						lastName: string;
						email: string;
						phone: string;
						alias: string;
						password: string;
					};
				},
			) => {
				const { password } = input;
				const profile = {
					firstName: input.firstName.trim(),
					lastName: input.lastName.trim(),
					email: input.email.trim(),
					phone: input.phone.trim(),
					alias: input.alias.trim(),
				};
				for (const [field, value] of Object.entries(profile)) {
					if (value.length === 0) {
						throw createGraphQLError(`${field} is required`);
					}
				}
				if (password.length < 8) {
					throw createGraphQLError(
						"Password must be at least 8 characters",
					);
				}
				try {
					const user = await usersRepo.createUser({
						...profile,
						passwordHash: await hashPassword(password),
					});
					return buildAuthPayload(user);
				} catch (error) {
					if (error instanceof usersRepo.DuplicateEmailError) {
						throw createGraphQLError("email already registered");
					}
					if (error instanceof usersRepo.DuplicateAliasError) {
						throw createGraphQLError("alias taken");
					}
					throw error;
				}
			},
			login: async (
				_parent: unknown,
				{ email, password }: { email: string; password: string },
			) => {
				// Constant message for both unknown email and bad password so
				// responses do not reveal which accounts exist.
				const user = await usersRepo.findUserByEmail(email);
				if (!user || !(await verifyPassword(password, user.passwordHash))) {
					throw createGraphQLError("Invalid email or password");
				}
				return buildAuthPayload(user);
			},
			createConversation: async (
				_parent: unknown,
				{ title }: { title?: string | null },
				context: AuthContext,
			) => {
				const user = requireUser(context);
				const metadata = await membershipsRepo.createConversation(
					user,
					title ?? undefined,
				);
				return { id: metadata.id, messages: [] };
			},
			addParticipant: async (
				_parent: unknown,
				{
					conversationId,
					email,
				}: { conversationId: string; email: string },
				context: AuthContext,
			) => {
				requireUser(context);
				const exists =
					await messagesRepo.conversationExists(conversationId);
				if (!exists) {
					throw new Error("Conversation not found");
				}
				await requireParticipant(context, conversationId);
				const invitee = await usersRepo.findUserByEmail(email);
				if (!invitee) {
					throw createGraphQLError("No user with that email");
				}
				await membershipsRepo.addParticipantToConversation(
					conversationId,
					invitee,
				);
				return loadConversation(conversationId);
			},
			sendMessage: async (
				_parent,
				{
					conversationId,
					body,
				}: {
					conversationId: string;
					body: string;
				},
				context: AuthContext,
			) => {
				requireUser(context);
				const exists =
					await messagesRepo.conversationExists(conversationId);
				if (!exists) {
					throw new Error("Conversation not found");
				}
				const user = await requireParticipant(context, conversationId);
				return sendMessage(conversationId, body, user.id, user.alias);
			},
		},
		Subscription: {
			onMessageUpdate: {
				subscribe: async (
					_parent: unknown,
					{ conversationId }: { conversationId: string },
					context: AuthContext,
				) => {
					await requireParticipant(context, conversationId);
					return pubsub.subscribe(`message-${conversationId}`);
				},
				resolve: (message: Message) => message,
			},
		},
	},
});
