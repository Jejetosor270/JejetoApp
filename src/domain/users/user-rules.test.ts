import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/client";
import {
  assertActiveAdminRetained,
  FinalActiveAdminError,
} from "@/domain/users/user-rules";

describe("active administrator protection", () => {
  const activeAdmin = { isActive: true, role: UserRole.ADMIN };

  it("prevents deactivation of the final active administrator", () => {
    expect(() =>
      assertActiveAdminRetained({
        activeAdminCount: 1,
        currentUser: activeAdmin,
        nextIsActive: false,
        nextRole: UserRole.ADMIN,
      }),
    ).toThrow(FinalActiveAdminError);
  });

  it("prevents demotion of the final active administrator", () => {
    expect(() =>
      assertActiveAdminRetained({
        activeAdminCount: 1,
        currentUser: activeAdmin,
        nextIsActive: true,
        nextRole: UserRole.MANAGER,
      }),
    ).toThrow(FinalActiveAdminError);
  });

  it("permits a change when another active administrator remains", () => {
    expect(() =>
      assertActiveAdminRetained({
        activeAdminCount: 2,
        currentUser: activeAdmin,
        nextIsActive: false,
        nextRole: UserRole.ADMIN,
      }),
    ).not.toThrow();
  });
});
