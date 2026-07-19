import { SignJWT, jwtVerify } from "jose";

const DEFAULT_SECRET = "dev-secret-change-me";
const DEFAULT_TTL = "7d";

function secretKey(secret?: string): Uint8Array {
	return new TextEncoder().encode(
		secret ?? process.env.JWT_SECRET ?? DEFAULT_SECRET,
	);
}

export type SignTokenOptions = {
	ttl?: string;
	secret?: string;
};

export async function signToken(
	userId: string,
	options: SignTokenOptions = {},
): Promise<string> {
	const ttl = options.ttl ?? process.env.JWT_TTL ?? DEFAULT_TTL;
	return new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(userId)
		.setIssuedAt()
		.setExpirationTime(ttl)
		.sign(secretKey(options.secret));
}

export async function verifyToken(
	token: string,
): Promise<{ sub: string } | null> {
	try {
		const { payload } = await jwtVerify(token, secretKey(), {
			algorithms: ["HS256"],
		});
		return payload.sub ? { sub: payload.sub } : null;
	} catch {
		return null;
	}
}
