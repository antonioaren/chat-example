export const MESSAGE_STATUS = {
	QUEUED: "queued",
	SENT: "sent",
	DELIVERED: "delivered",
	FAILED: "failed",
} as const;

export type MessageStatus =
	(typeof MESSAGE_STATUS)[keyof typeof MESSAGE_STATUS];

export type Message =
	| { id: string; body: string; status: "queued" | "sent" }
	| { id: string; body: string; status: "delivered"; deliveredAt: string }
	| { id: string; body: string; status: "failed"; error: string };

export type Conversation = {
	id: string;
	messages: Message[];
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