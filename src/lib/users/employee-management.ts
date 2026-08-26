import "server-only";

import { Prisma, UserRole } from "@/generated/prisma/client";
import { hashPassword } from "@/domain/users/passwords";
import {
  assertActiveAdminRetained,
  FinalActiveAdminError,
} from "@/domain/users/user-rules";
import type {
  CreateEmployeeInput,
  ResetEmployeePasswordInput,
  UpdateEmployeeInput,
} from "@/domain/users/validation";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";

const employeeSelect = {
  createdAt: true,
  email: true,
  id: true,
  isActive: true,
  name: true,
  role: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type ManagedEmployee = Prisma.UserGetPayload<{
  select: typeof employeeSelect;
}>;

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("The employee account no longer exists.");
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeSelfDeletionError extends Error {
  constructor() {
    super("You cannot permanently delete your own current account.");
  }
}

export class LastActiveAdminDeletionError extends Error {
  constructor() {
    super(
      "This deletion would leave the application without an active Administrator.",
    );
  }
}

export async function listManagedEmployees(): Promise<ManagedEmployee[]> {
  return getDatabase().user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: employeeSelect,
  });
}

export async function createEmployee(
  actorId: string,
  input: CreateEmployeeInput,
): Promise<ManagedEmployee> {
  const passwordHash = await hashPassword(input.password);

  return getDatabase().$transaction(async (transaction) => {
    const employee = await transaction.user.create({
      data: {
        createdById: actorId,
        email: input.email,
        isActive: true,
        name: input.name,
        passwordHash,
        role: input.role,
        updatedById: actorId,
      },
      select: employeeSelect,
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: employee.id,
      entityReference: employee.email,
      entityType: "USER",
      metadata: { role: employee.role },
      summary: "Created an employee account.",
    });
    return employee;
  });
}

export async function updateEmployee(
  actorId: string,
  input: UpdateEmployeeInput,
): Promise<ManagedEmployee> {
  return getDatabase().$transaction(
    async (transaction) => {
      const currentUser = await transaction.user.findUnique({
        where: { id: input.id },
        select: { isActive: true, role: true },
      });

      if (!currentUser) {
        throw new EmployeeNotFoundError();
      }

      if (currentUser.isActive && currentUser.role === UserRole.ADMIN) {
        const activeAdminCount = await transaction.user.count({
          where: { isActive: true, role: UserRole.ADMIN },
        });

        assertActiveAdminRetained({
          activeAdminCount,
          currentUser,
          nextIsActive: input.isActive,
          nextRole: input.role,
        });
      }

      const employee = await transaction.user.update({
        where: { id: input.id },
        data: {
          email: input.email,
          isActive: input.isActive,
          name: input.name,
          role: input.role,
          updatedById: actorId,
        },
        select: employeeSelect,
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: employee.id,
        entityReference: employee.email,
        entityType: "USER",
        metadata: { active: employee.isActive, role: employee.role },
        summary: "Updated an employee account.",
      });
      return employee;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function resetEmployeePassword(
  actorId: string,
  input: ResetEmployeePasswordInput,
): Promise<ManagedEmployee> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await getDatabase().$transaction(async (transaction) => {
      const employee = await transaction.user.update({
        where: { id: input.id },
        data: {
          passwordHash,
          updatedById: actorId,
        },
        select: employeeSelect,
      });
      await writeAuditEvent(transaction, actorId, {
        action: "PASSWORD_RESET",
        entityId: employee.id,
        entityReference: employee.email,
        entityType: "USER",
        summary: "Reset an employee password.",
      });
      return employee;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new EmployeeNotFoundError();
    }

    throw error;
  }
}

export async function deleteEmployees(
  actorId: string,
  ids: string[],
): Promise<void> {
  await getDatabase().$transaction(
    async (transaction) => {
      const employees = await transaction.user.findMany({
        where: { id: { in: ids } },
        select: {
          email: true,
          id: true,
          isActive: true,
          name: true,
          role: true,
        },
      });
      if (employees.length !== ids.length) throw new EmployeeNotFoundError();
      if (employees.some((employee) => employee.id === actorId)) {
        throw new EmployeeSelfDeletionError();
      }
      const activeAdminCount = await transaction.user.count({
        where: { isActive: true, role: UserRole.ADMIN },
      });
      const selectedActiveAdminCount = employees.filter(
        (employee) => employee.isActive && employee.role === UserRole.ADMIN,
      ).length;
      if (activeAdminCount - selectedActiveAdminCount < 1) {
        throw new LastActiveAdminDeletionError();
      }
      for (const employee of employees) {
        await writeAuditEvent(transaction, actorId, {
          action: "DELETED",
          entityId: employee.id,
          entityReference: employee.email,
          entityType: "USER",
          metadata: {
            deletedEmployeeEmail: employee.email,
            deletedEmployeeName: employee.name,
            deletedEmployeeRole: employee.role,
          },
          summary: `Permanently deleted employee ${employee.name}.`,
        });
      }
      const deleted = await transaction.user.deleteMany({
        where: { id: { in: ids } },
      });
      if (deleted.count !== ids.length) throw new EmployeeNotFoundError();
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export { isDuplicateEmailError } from "@/domain/users/persistence-errors";

export function isExpectedEmployeeUpdateError(error: unknown): boolean {
  return (
    error instanceof EmployeeNotFoundError ||
    error instanceof FinalActiveAdminError ||
    error instanceof EmployeeSelfDeletionError ||
    error instanceof LastActiveAdminDeletionError
  );
}
