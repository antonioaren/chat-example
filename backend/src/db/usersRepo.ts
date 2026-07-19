// Users live in PostgreSQL (Aurora-compatible) via Prisma, unlike
// conversations/messages which stay in DynamoDB. This repo is the only
// module that touches the Prisma client, mirroring messagesRepo.ts.

import { Prisma } from "@prisma/client";
import { prisma } from "./prismaClient.js";
import type { User } from "../types.js";

export class DuplicateEmailError extends Error {
	constructor(email: string) {
		super(`Email already registered: ${email}`);
		this.name = "DuplicateEmailError";
	}
}

export class DuplicateAliasError extends Error {
	constructor(alias: string) {
		super(`Alias already taken: ${alias}`);
		this.name = "DuplicateAliasError";
	}
}

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	alias: string;
	passwordHash: string;
};

function isUniqueViolation(
	error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

// With driver adapters (Prisma 7 + @prisma/adapter-pg) the violated columns
// arrive under meta.driverAdapterError.cause.constraint.fields instead of
// the classic meta.target; support both shapes.
function violatedFields(error: Prisma.PrismaClientKnownRequestError): string[] {
	const meta = error.meta as
		| {
				target?: string[] | string;
				driverAdapterError?: {
					cause?: { constraint?: { fields?: string[] } };
				};
		  }
		| undefined;

	const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
	if (adapterFields) {
		return adapterFields;
	}
	const target = meta?.target ?? [];
	return typeof target === "string" ? [target] : target;
}

export async function createUser(input: CreateUserInput): Promise<User> {
	try {
		return await prisma.user.create({
			data: {
				id: crypto.randomUUID(),
				firstName: input.firstName,
				lastName: input.lastName,
				email: input.email.trim().toLowerCase(),
				phone: input.phone,
				alias: input.alias,
				passwordHash: input.passwordHash,
			},
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			if (violatedFields(error).includes("alias")) {
				throw new DuplicateAliasError(input.alias);
			}
			throw new DuplicateEmailError(input.email);
		}
		throw error;
	}
}

export async function findUserByEmail(email: string): Promise<User | null> {
	return prisma.user.findUnique({
		where: { email: email.trim().toLowerCase() },
	});
}

export async function findUserById(id: string): Promise<User | null> {
	return prisma.user.findUnique({ where: { id } });
}
