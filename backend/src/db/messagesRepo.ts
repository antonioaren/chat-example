// Persistence layer, replacing the in-memory conversations Map. Single-table
// design: PK=CONVERSATION#<conversationId>, SK=METADATA for the conversation
// item, SK=MESSAGE#<createdAtISO>#<messageId> for messages (ISO timestamps
// sort lexicographically, so a begins_with("MESSAGE#") query returns
// chronological order with no GSI needed).

import {
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "./client.js";
import type { Message, StatusPatch } from "../types.js";

function messageSortKey(createdAt: string, messageId: string): string {
	return `MESSAGE#${createdAt}#${messageId}`;
}

export async function conversationExists(
	conversationId: string,
): Promise<boolean> {
	const result = await docClient.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: {
				PK: `CONVERSATION#${conversationId}`,
				SK: "METADATA",
			},
		}),
	);
	return result.Item !== undefined;
}

export async function putMessage(
	conversationId: string,
	message: Message,
): Promise<void> {
	await docClient.send(
		new PutCommand({
			TableName: TABLE_NAME,
			Item: {
				PK: `CONVERSATION#${conversationId}`,
				SK: messageSortKey(message.createdAt, message.id),
				...message,
			},
		}),
	);
}

export async function updateMessageStatus(
	conversationId: string,
	createdAt: string,
	messageId: string,
	patch: StatusPatch,
): Promise<Message> {
	const updateFields: Record<string, unknown> = { status: patch.status };
	if (patch.status === "delivered") {
		updateFields.deliveredAt = patch.deliveredAt;
	}
	if (patch.status === "failed") {
		updateFields.error = patch.error;
	}

	const expressionAttributeNames: Record<string, string> = {};
	const expressionAttributeValues: Record<string, unknown> = {};
	const setClauses: string[] = [];

	for (const [key, value] of Object.entries(updateFields)) {
		const nameToken = `#${key}`;
		const valueToken = `:${key}`;
		expressionAttributeNames[nameToken] = key;
		expressionAttributeValues[valueToken] = value;
		setClauses.push(`${nameToken} = ${valueToken}`);
	}

	const result = await docClient.send(
		new UpdateCommand({
			TableName: TABLE_NAME,
			Key: {
				PK: `CONVERSATION#${conversationId}`,
				SK: messageSortKey(createdAt, messageId),
			},
			UpdateExpression: `SET ${setClauses.join(", ")}`,
			ExpressionAttributeNames: expressionAttributeNames,
			ExpressionAttributeValues: expressionAttributeValues,
			ReturnValues: "ALL_NEW",
		}),
	);

	return result.Attributes as Message;
}

export async function getConversationMessages(
	conversationId: string,
): Promise<Message[]> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `CONVERSATION#${conversationId}`,
				":skPrefix": "MESSAGE#",
			},
			ScanIndexForward: true,
		}),
	);

	return (result.Items ?? []) as Message[];
}
