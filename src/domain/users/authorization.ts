import { UserRole } from "@/generated/prisma/client";

export class InsufficientRoleError extends Error {
  constructor() {
    super("You are not authorized to perform this action.");
    this.name = "InsufficientRoleError";
  }
}

export function hasRequiredRole(
  role: UserRole,
  allowedRoles: readonly UserRole[],
): boolean {
  return allowedRoles.includes(role);
}

export function assertRequiredRole(
  role: UserRole,
  allowedRoles: readonly UserRole[],
): void {
  if (!hasRequiredRole(role, allowedRoles)) {
    throw new InsufficientRoleError();
  }
}
