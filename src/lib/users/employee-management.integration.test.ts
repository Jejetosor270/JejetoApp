import { describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import { verifyPassword } from "@/domain/users/passwords";

const databaseMocks = vi.hoisted(() => {
  const user = {
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };

  return {
    database: {
      $transaction: vi.fn(
        async (
          callback: (transaction: { user: typeof user }) => Promise<unknown>,
        ): Promise<unknown> => callback({ user }),
      ),
      user,
    },
    user,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => databaseMocks.database,
}));

import {
  resetEmployeePassword,
  updateEmployee,
} from "@/lib/users/employee-management";

const employeeId = "f45ac9c9-10e9-4e42-b93f-38796de4f65a";
const administratorId = "d1ba89a0-c7d0-4657-a922-80cdf9f9b94e";

function managedEmployee() {
  return {
    createdAt: new Date("2026-08-22T00:00:00.000Z"),
    email: "updated@mb-interiors.example",
    id: employeeId,
    isActive: true,
    name: "Updated Employee",
    role: UserRole.MANAGER,
    updatedAt: new Date("2026-08-22T00:00:00.000Z"),
  };
}

describe("employee management writes", () => {
  it("persists a normalized employee name and email through the transaction", async () => {
    databaseMocks.user.findUnique.mockResolvedValue({
      isActive: false,
      role: UserRole.USER,
    });
    databaseMocks.user.update.mockResolvedValue(managedEmployee());

    const employee = await updateEmployee(administratorId, {
      email: "updated@mb-interiors.example",
      id: employeeId,
      isActive: true,
      name: "Updated Employee",
      role: UserRole.MANAGER,
    });

    expect(employee).toMatchObject({
      email: "updated@mb-interiors.example",
      name: "Updated Employee",
    });
    expect(databaseMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "updated@mb-interiors.example",
          name: "Updated Employee",
          updatedById: administratorId,
        }),
        where: { id: employeeId },
      }),
    );
  });

  it("writes a new bcrypt hash when an administrator resets a password", async () => {
    databaseMocks.user.update.mockResolvedValue(managedEmployee());

    await resetEmployeePassword(administratorId, {
      id: employeeId,
      password: "654321",
      passwordConfirmation: "654321",
    });

    const updateCall = databaseMocks.user.update.mock.calls.at(-1)?.[0];
    const passwordHash = updateCall?.data.passwordHash;

    expect(passwordHash).not.toBe("654321");
    await expect(verifyPassword("654321", passwordHash)).resolves.toBe(true);
    expect(updateCall?.data.updatedById).toBe(administratorId);
  });
});
