export const MESSAGE_STATUS = {
	QUEUED: "queued",
	SENT: "sent",
	DELIVERED: "delivered",
	FAILED: "failed",
} as const;

export type MessageStatus =
	(typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

type MessageBase = {
	id: string;
	body: string;
	senderId: string;
	senderName: string;
	createdAt: string;
};

export type Message = MessageBase &
	(
		| { status: "queued" | "sent" }
		| { status: "delivered"; deliveredAt: string }
		| { status: "failed"; error: string }
	);

export type Conversation = {
	id: string;
	messages: Message[];
};

// Users live in PostgreSQL (via Prisma), not DynamoDB. passwordHash never
// leaves the backend; the GraphQL User type omits it.
export type User = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	alias: string;
	passwordHash: string;
	createdAt: Date;
};

// Human-readable status label; narrowing the discriminated union gives
// safe access to per-status fields, and the `never` check keeps the
// switch exhaustive if a new status is added.
export function statusLabel(message: Message): string {
	switch (message.status) {
		case "queued":
			return "Sending...";
		case "sent":
			return "Sent";
		case "delivered":
			return "Delivered";
		case "failed":
			return `Failed: ${message.error}`;
		default:
			const _exhaustiveCheck: never = message;
			return _exhaustiveCheck;
	}
}

export type StatusPatch =
	| {
			status: "sent";
	  }
	| {
			status: "delivered";
			deliveredAt: string;
	  }
	| {
			status: "failed";
			error: string;
	  };