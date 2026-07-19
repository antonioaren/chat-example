// Singleton Prisma client for the users database (PostgreSQL / Aurora).
// Prisma 7 requires a driver adapter for direct connections; the pg adapter
// reads the connection string from DATABASE_URL.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
	process.env.DATABASE_URL ?? "postgresql://chat:chat@localhost:5432/chat";

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
