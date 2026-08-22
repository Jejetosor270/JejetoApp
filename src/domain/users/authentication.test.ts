import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { authenticateEmployee } from "@/domain/users/authentication";
import { hashPassword } from "@/domain/users/passwords";

describe("employee authentication", () => {
  const input = {
    email: "employee@mb-interiors.example",
    password: "a-safe-initial-password",
  };

  it("accepts valid credentials for an active employee", async () => {
    const passwordHash = await hashPassword(input.password);
    const employee = await authenticateEmployee(input, {
      findByNormalizedEmail: async () => ({
        email: input.email,
        id: "f45ac9c9-10e9-4e42-b93f-38796de4f65a",
        isActive: true,
        name: "Marie Bernard",
        passwordHash,
        role: UserRole.MANAGER,
      }),
    });

    expect(employee?.id).toBe("f45ac9c9-10e9-4e42-b93f-38796de4f65a");
  });

  it("rejects inactive employees even with the correct password", async () => {
    const passwordHash = await hashPassword(input.password);
    const employee = await authenticateEmployee(input, {
      findByNormalizedEmail: async () => ({
        email: input.email,
        id: "f45ac9c9-10e9-4e42-b93f-38796de4f65a",
        isActive: false,
        name: "Marie Bernard",
        passwordHash,
        role: UserRole.USER,
      }),
    });

    expect(employee).toBeNull();
  });
});
