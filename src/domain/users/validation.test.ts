import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { bootstrapAdminInputSchema } from "@/domain/users/bootstrap-validation";
import { hashPassword, verifyPassword } from "@/domain/users/passwords";
import {
  createEmployeeInputSchema,
  loginInputSchema,
  minimumPasswordLength,
  normalizeEmail,
  resetEmployeePasswordInputSchema,
  updateEmployeeInputSchema,
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

  it("uses a six-character minimum for login and account passwords", () => {
    expect(
      loginInputSchema.safeParse({
        email: "employee@mb-interiors.example",
        password: "12345",
      }).success,
    ).toBe(false);
    expect(
      createEmployeeInputSchema.safeParse({
        email: "employee@mb-interiors.example",
        name: "Marie Bernard",
        password: "123456",
        role: UserRole.USER,
      }).success,
    ).toBe(true);
    expect(minimumPasswordLength).toBe(6);
  });

  it("validates persisted employee edits and normalizes a replacement email", () => {
    const updatedEmployee = updateEmployeeInputSchema.parse({
      email: "  UPDATED@MB-INTERIORS.EXAMPLE  ",
      id: "f45ac9c9-10e9-4e42-b93f-38796de4f65a",
      isActive: true,
      name: "Updated Employee",
      role: UserRole.MANAGER,
    });

    expect(updatedEmployee.name).toBe("Updated Employee");
    expect(updatedEmployee.email).toBe("updated@mb-interiors.example");
  });

  it("validates password-reset confirmation without retaining a plaintext value", async () => {
    const reset = resetEmployeePasswordInputSchema.parse({
      id: "f45ac9c9-10e9-4e42-b93f-38796de4f65a",
      password: "654321",
      passwordConfirmation: "654321",
    });
    const passwordHash = await hashPassword(reset.password);

    expect(passwordHash).not.toBe(reset.password);
    await expect(verifyPassword(reset.password, passwordHash)).resolves.toBe(
      true,
    );
    expect(
      resetEmployeePasswordInputSchema.safeParse({
        ...reset,
        passwordConfirmation: "different",
      }).success,
    ).toBe(false);
  });

  it("applies the same policy to the initial administrator", () => {
    const baseInput = {
      BOOTSTRAP_ADMIN_EMAIL: "admin@mb-interiors.example",
      BOOTSTRAP_ADMIN_NAME: "Initial Administrator",
    };

    expect(
      bootstrapAdminInputSchema.safeParse({
        ...baseInput,
        BOOTSTRAP_ADMIN_PASSWORD: "12345",
      }).success,
    ).toBe(false);
    expect(
      bootstrapAdminInputSchema.safeParse({
        ...baseInput,
        BOOTSTRAP_ADMIN_PASSWORD: "123456",
      }).success,
    ).toBe(true);
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
