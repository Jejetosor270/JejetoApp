import "server-only";

import { Prisma, UserRole } from "@/generated/prisma/client";
import { hashPassword } from "@/domain/users/passwords";
import {
  assertActiveAdminRetained,
  FinalActiveAdminError,
} from "@/domain/users/user-rules";
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "@/domain/users/validation";
import { getDatabase } from "@/lib/db";

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

  return getDatabase().user.create({
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

      return transaction.user.update({
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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function isDuplicateEmailError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isExpectedEmployeeUpdateError(error: unknown): boolean {
  return (
    error instanceof EmployeeNotFoundError ||
    error instanceof FinalActiveAdminError
  );
}
