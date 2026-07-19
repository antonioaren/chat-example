// DynamoDB client seam: local dev talks to DynamoDB Local, real AWS ignores
// the endpoint override and dummy credentials.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const dynamoDbClient = new DynamoDBClient({
	endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
	region: process.env.AWS_REGION ?? "us-east-1",
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
	},
});

export const docClient = DynamoDBDocumentClient.from(dynamoDbClient, {
	marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? "chat-messages";
