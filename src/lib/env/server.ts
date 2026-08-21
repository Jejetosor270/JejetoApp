import "server-only";

import { z } from "zod";

const postgresUrl = z
  .string()
  .min(1, "A PostgreSQL connection URL is required.")
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "Use a postgresql:// or postgres:// connection URL.",
  );

const serverEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let parsedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  parsedEnvironment ??= serverEnvironmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });

  return parsedEnvironment;
}
