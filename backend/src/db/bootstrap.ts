// Table lifecycle for local dev. Gated by DYNAMODB_AUTO_CREATE_TABLE so this
// is a no-op against real AWS, where tables are provisioned out-of-band.

import {
	CreateTableCommand,
	DescribeTableCommand,
	ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "./client.js";

async function createTable(): Promise<void> {
	await docClient.send(
		new CreateTableCommand({
			TableName: TABLE_NAME,
			BillingMode: "PAY_PER_REQUEST",
			AttributeDefinitions: [
				{ AttributeName: "PK", AttributeType: "S" },
				{ AttributeName: "SK", AttributeType: "S" },
			],
			KeySchema: [
				{ AttributeName: "PK", KeyType: "HASH" },
				{ AttributeName: "SK", KeyType: "RANGE" },
			],
		}),
	);
}

async function ensureConversationSeeded(conversationId: string): Promise<void> {
	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					PK: `CONVERSATION#${conversationId}`,
					SK: "METADATA",
					id: conversationId,
					createdAt: new Date().toISOString(),
				},
				ConditionExpression: "attribute_not_exists(PK)",
			}),
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.name === "ConditionalCheckFailedException"
		) {
			return;
		}
		throw error;
	}
}

/**
 * Creates the table if missing and seeds `conversation-1`. Idempotent — safe
 * to call on every server/worker boot. No-op unless
 * DYNAMODB_AUTO_CREATE_TABLE=true.
 */
export async function ensureTableExists(): Promise<void> {
	if (process.env.DYNAMODB_AUTO_CREATE_TABLE !== "true") {
		return;
	}

	try {
		await docClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
	} catch (error) {
		if (error instanceof ResourceNotFoundException) {
			await createTable();
		} else {
			throw error;
		}
	}

	await ensureConversationSeeded("conversation-1");
}
