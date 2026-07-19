// Conversations + memberships in the same single-table design as
// messagesRepo. Two item shapes bridge SQL users to DynamoDB conversations:
//   membership:  PK=USER#<userId>          SK=CONVERSATION#<conversationId>
//   participant: PK=CONVERSATION#<convId>  SK=PARTICIPANT#<userId>
// The membership partition answers "which conversations does this user have"
// and the participant range answers "who is in this conversation", both
// without a GSI.

import {
	GetCommand,
	QueryCommand,
	TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "./client.js";
import type { User } from "../types.js";

export type ConversationMetadata = {
	id: string;
	title?: string;
	createdBy: string;
	createdAt: string;
};

export type ParticipantRecord = {
	userId: string;
	alias: string;
	joinedAt: string;
};

function membershipItems(conversationId: string, user: User, joinedAt: string) {
	return [
		{
			Put: {
				TableName: TABLE_NAME,
				Item: {
					PK: `USER#${user.id}`,
					SK: `CONVERSATION#${conversationId}`,
					userId: user.id,
					conversationId,
					joinedAt,
				},
			},
		},
		{
			Put: {
				TableName: TABLE_NAME,
				Item: {
					PK: `CONVERSATION#${conversationId}`,
					SK: `PARTICIPANT#${user.id}`,
					userId: user.id,
					alias: user.alias,
					joinedAt,
				},
			},
		},
	];
}

export async function createConversation(
	creator: User,
	title?: string,
): Promise<ConversationMetadata> {
	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const metadata: ConversationMetadata = {
		id,
		...(title !== undefined ? { title } : {}),
		createdBy: creator.id,
		createdAt,
	};

	await docClient.send(
		new TransactWriteCommand({
			TransactItems: [
				{
					Put: {
						TableName: TABLE_NAME,
						Item: {
							PK: `CONVERSATION#${id}`,
							SK: "METADATA",
							...metadata,
						},
					},
				},
				...membershipItems(id, creator, createdAt),
			],
		}),
	);

	return metadata;
}

export async function addParticipantToConversation(
	conversationId: string,
	user: User,
): Promise<void> {
	if (await isParticipant(conversationId, user.id)) {
		return;
	}

	await docClient.send(
		new TransactWriteCommand({
			TransactItems: membershipItems(
				conversationId,
				user,
				new Date().toISOString(),
			),
		}),
	);
}

export async function listUserConversations(
	userId: string,
): Promise<string[]> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `USER#${userId}`,
				":skPrefix": "CONVERSATION#",
			},
		}),
	);

	return (result.Items ?? []).map((item) => item.conversationId as string);
}

export async function getParticipants(
	conversationId: string,
): Promise<ParticipantRecord[]> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
			ExpressionAttributeValues: {
				":pk": `CONVERSATION#${conversationId}`,
				":skPrefix": "PARTICIPANT#",
			},
		}),
	);

	return (result.Items ?? []).map((item) => ({
		userId: item.userId as string,
		alias: item.alias as string,
		joinedAt: item.joinedAt as string,
	}));
}

export async function isParticipant(
	conversationId: string,
	userId: string,
): Promise<boolean> {
	const result = await docClient.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: {
				PK: `CONVERSATION#${conversationId}`,
				SK: `PARTICIPANT#${userId}`,
			},
		}),
	);
	return result.Item !== undefined;
}
