import "server-only";

import { z } from "zod";

const authenticationEnvironmentSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters long."),
});

export type AuthenticationEnvironment = z.infer<
  typeof authenticationEnvironmentSchema
>;

let parsedAuthenticationEnvironment: AuthenticationEnvironment | undefined;

export function getAuthenticationEnvironment(): AuthenticationEnvironment {
  parsedAuthenticationEnvironment ??= authenticationEnvironmentSchema.parse({
    AUTH_SECRET: process.env.AUTH_SECRET,
  });

  return parsedAuthenticationEnvironment;
}
