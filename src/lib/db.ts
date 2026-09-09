import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env/server";
import { visibleQuery } from "@/lib/trash/visibility";

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

  return new PrismaClient({ adapter }).$extends({
    name: "active-business-records",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(visibleQuery(model, operation, args) as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** Lazily creates the server-only client so static builds never require a database. */
export function getDatabase(): PrismaClient {
  database ??= createDatabaseClient();

  if (process.env.NODE_ENV !== "production") {
    globalDatabase.prisma = database;
  }

  return database;
}
