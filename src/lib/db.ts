import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env/server";

const globalDatabase = globalThis as unknown as {
  prisma?: PrismaClient;
};

let database = globalDatabase.prisma;

function createDatabaseClient(): PrismaClient {
  const { DATABASE_URL } = getServerEnvironment();
  const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: 5,
  });

  return new PrismaClient({ adapter });
}

/** Lazily creates the server-only client so static builds never require a database. */
export function getDatabase(): PrismaClient {
  database ??= createDatabaseClient();

  if (process.env.NODE_ENV !== "production") {
    globalDatabase.prisma = database;
  }

  return database;
}
