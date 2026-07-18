// In-memory store where each conversation owns its messages.

import { createPubSub } from "graphql-yoga";
import { Conversation, Message, StatusPatch } from "./types.js";

export const pubsub = createPubSub();

export const conversations = new Map<string, Conversation>([
	[
		"conversation-1",
		{
			id: "conversation-1",
			messages: [],
		},
	],
]);

export const addMessage = async (
	conversationId: string,
	body: string,
	senderId: string,
	senderName: string,
): Promise<Message> => {
	const conversation = conversations.get(conversationId);
	if (!conversation) {
		throw new Error("Conversation not found");
	}

	const message: Message = {
		id: crypto.randomUUID(),
		body,
		senderId,
		senderName,
		createdAt: new Date().toISOString(),
		status: "queued" as const,
	};
	conversation.messages.push(message);
	// Visibility starts at `sent`: do not publish on create (queued).
	// Subscribers learn about the message via updateStatus → publish.

	return message;
};

function _applyPatch(message: Message, patch: StatusPatch): Message {
	switch (patch.status) {
		case "sent":
			return {
				id: message.id,
				body: message.body,
				senderId: message.senderId,
				senderName: message.senderName,
				createdAt: message.createdAt,
				status: "sent",
			};
		case "delivered":
			return {
				id: message.id,
				body: message.body,
				senderId: message.senderId,
				senderName: message.senderName,
				createdAt: message.createdAt,
				status: "delivered",
				deliveredAt: patch.deliveredAt,
			};
		case "failed":
			return {
				id: message.id,
				body: message.body,
				senderId: message.senderId,
				senderName: message.senderName,
				createdAt: message.createdAt,
				status: "failed",
				error: patch.error,
			};
		default:
			const _exhaustiveCheck: never = patch;
			return _exhaustiveCheck;
	}
}

export function updateStatus(
	conversationId: string,
	messageId: string,
	patch: StatusPatch,
): Message | undefined {
	const conversation = conversations.get(conversationId);
	if (!conversation) {
		return undefined;
	}

	const messageIndex = conversation.messages.findIndex(
		(message) => message.id === messageId,
	);

	if (messageIndex === -1) {
		return undefined;
	}

	const updatedMessage = _applyPatch(
		conversation.messages[messageIndex],
		patch,
	);

	conversation.messages[messageIndex] = updatedMessage;
	pubsub.publish(`message-${conversationId}`, updatedMessage);

	return updatedMessage;
}

