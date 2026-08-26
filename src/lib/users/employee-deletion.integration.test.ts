import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserRole } from "@/generated/prisma/client";

const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));
const transaction = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/events", () => audit);
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  deleteEmployees,
  EmployeeSelfDeletionError,
  LastActiveAdminDeletionError,
} from "@/lib/users/employee-management";

const actorId = "d1ba89a0-c7d0-4657-a922-80cdf9f9b94e";

function employee(id: string, role: UserRole, isActive = true) {
  return {
    email: `${id}@example.test`,
    id,
    isActive,
    name: `Employee ${id}`,
    role,
  };
}

describe("permanent employee deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.user.count.mockResolvedValue(2);
    transaction.user.deleteMany.mockImplementation(async ({ where }) => ({
      count: where.id.in.length,
    }));
  });

  it.each([UserRole.USER, UserRole.MANAGER, UserRole.ADMIN])(
    "deletes another %s without deleting operational models",
    async (role) => {
      const target = employee(`target-${role}`, role);
      transaction.user.findMany.mockResolvedValue([target]);

      await deleteEmployees(actorId, [target.id]);

      expect(transaction.user.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [target.id] } },
      });
      expect(audit.writeAuditEvent).toHaveBeenCalledWith(
        transaction,
        actorId,
        expect.objectContaining({
          action: "DELETED",
          entityReference: target.email,
          entityType: "USER",
          metadata: expect.objectContaining({
            deletedEmployeeEmail: target.email,
            deletedEmployeeName: target.name,
            deletedEmployeeRole: role,
          }),
        }),
      );
    },
  );

  it("rejects deletion of the currently authenticated administrator", async () => {
    transaction.user.findMany.mockResolvedValue([
      employee(actorId, UserRole.ADMIN),
    ]);

    await expect(deleteEmployees(actorId, [actorId])).rejects.toBeInstanceOf(
      EmployeeSelfDeletionError,
    );
    expect(transaction.user.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects the last active administrator", async () => {
    transaction.user.count.mockResolvedValue(1);
    transaction.user.findMany.mockResolvedValue([
      employee("last-admin", UserRole.ADMIN),
    ]);

    await expect(
      deleteEmployees(actorId, ["last-admin"]),
    ).rejects.toBeInstanceOf(LastActiveAdminDeletionError);
    expect(transaction.user.deleteMany).not.toHaveBeenCalled();
  });

  it("evaluates a bulk set atomically and cannot leave zero active administrators", async () => {
    transaction.user.count.mockResolvedValue(2);
    transaction.user.findMany.mockResolvedValue([
      employee("admin-1", UserRole.ADMIN),
      employee("admin-2", UserRole.ADMIN),
    ]);

    await expect(
      deleteEmployees(actorId, ["admin-1", "admin-2"]),
    ).rejects.toBeInstanceOf(LastActiveAdminDeletionError);
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transaction.user.deleteMany).not.toHaveBeenCalled();
  });
});
