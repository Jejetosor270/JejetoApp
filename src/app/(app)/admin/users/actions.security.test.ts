import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const employees = vi.hoisted(() => ({ deleteEmployees: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/users/employee-management", () => ({
  ...employees,
  isDuplicateEmailError: vi.fn(),
  isExpectedEmployeeUpdateError: vi.fn(),
}));

import { deleteSelectedEmployeesAction } from "@/app/(app)/admin/users/actions";

describe("employee deletion action authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["MANAGER", "USER"])(
    "rejects a %s before employee persistence is reached",
    async (role) => {
      auth.requireAdmin.mockRejectedValueOnce(new Error(`${role} forbidden`));

      await expect(
        deleteSelectedEmployeesAction(new FormData()),
      ).rejects.toThrow(`${role} forbidden`);
      expect(employees.deleteEmployees).not.toHaveBeenCalled();
    },
  );
});
