import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import {
  assertRequiredRole,
  hasRequiredRole,
  InsufficientRoleError,
} from "@/domain/users/authorization";

describe("role authorization", () => {
  it("permits administrators to administrative actions", () => {
    expect(hasRequiredRole(UserRole.ADMIN, [UserRole.ADMIN])).toBe(true);
  });

  it("rejects non-administrators from employee password management", () => {
    expect(hasRequiredRole(UserRole.MANAGER, [UserRole.ADMIN])).toBe(false);
    expect(hasRequiredRole(UserRole.USER, [UserRole.ADMIN])).toBe(false);
    expect(() =>
      assertRequiredRole(UserRole.MANAGER, [UserRole.ADMIN]),
    ).toThrow(InsufficientRoleError);
  });
});
