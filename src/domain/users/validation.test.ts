import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "@/domain/users/passwords";
import {
  createEmployeeInputSchema,
  loginInputSchema,
  minimumPasswordLength,
  normalizeEmail,
} from "@/domain/users/validation";

describe("employee authentication inputs", () => {
  it("normalizes email addresses consistently", () => {
    expect(normalizeEmail("  HELLO@MB-INTERIORS.EXAMPLE  ")).toBe(
      "hello@mb-interiors.example",
    );

    const result = createEmployeeInputSchema.parse({
      email: "  HELLO@MB-INTERIORS.EXAMPLE  ",
      name: "Marie Bernard",
      password: "a-safe-initial-password",
      role: UserRole.USER,
    });

    expect(result.email).toBe("hello@mb-interiors.example");
  });

  it("requires a practical password length for logins and new accounts", () => {
    expect(
      loginInputSchema.safeParse({
        email: "employee@mb-interiors.example",
        password: "short",
      }).success,
    ).toBe(false);
    expect(minimumPasswordLength).toBe(12);
  });
});

describe("password hashing", () => {
  it("hashes and verifies passwords without retaining plaintext", async () => {
    const password = "a-safe-initial-password";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(
      verifyPassword("incorrect-password", passwordHash),
    ).resolves.toBe(false);
  });
});
