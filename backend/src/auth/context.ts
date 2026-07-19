import { verifyToken } from "./tokens.js";
import { findUserById } from "../db/usersRepo.js";
import type { User } from "../types.js";

export type AuthContext = {
	currentUser: User | null;
};

export async function buildAuthContext(request: Request): Promise<AuthContext> {
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) {
		return { currentUser: null };
	}

	const payload = await verifyToken(header.slice("Bearer ".length));
	if (!payload) {
		return { currentUser: null };
	}

	return { currentUser: await findUserById(payload.sub) };
}
