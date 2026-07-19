// Table lifecycle for local dev. Gated by DYNAMODB_AUTO_CREATE_TABLE so this
// is a no-op against real AWS, where tables are provisioned out-of-band.

import {
	CreateTableCommand,
	DescribeTableCommand,
	ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
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

/**
 * Creates the table if missing. Idempotent — safe to call on every
 * server/worker boot. No-op unless DYNAMODB_AUTO_CREATE_TABLE=true.
 * Conversations are created by users via the createConversation mutation.
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
}
