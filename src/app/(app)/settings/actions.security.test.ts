import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireMasterDataEditor: vi.fn(),
}));
const settings = vi.hoisted(() => ({ updateItemManagementSetting: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/settings/application-settings", () => ({
  updateApplicationSettings: vi.fn(),
  ...settings,
}));

import { updateItemManagementSettingAction } from "./actions";

describe("Item Management Beta authorization", () => {
  it.each(["MANAGER", "USER"])(
    "rejects a %s before changing the setting",
    async (role) => {
      auth.requireAdmin.mockRejectedValueOnce(new Error(`${role} forbidden`));
      await expect(
        updateItemManagementSettingAction(
          { message: "", status: "error" },
          new FormData(),
        ),
      ).rejects.toThrow(`${role} forbidden`);
      expect(settings.updateItemManagementSetting).not.toHaveBeenCalled();
    },
  );
});
