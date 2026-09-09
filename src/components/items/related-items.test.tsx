import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: vi.fn(),
  settings: vi.fn(),
  items: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  canEditMasterData: (role: string) => role !== "USER",
  requireUser: mock.user,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ item: { findMany: mock.items } }),
}));
vi.mock("@/lib/settings/application-settings", () => ({
  getApplicationSettings: mock.settings,
}));
import { RelatedItems } from "./related-items";
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ role: "USER" });
  mock.items.mockResolvedValue([]);
});
it("does not read or display Items when Beta is disabled", async () => {
  mock.settings.mockResolvedValue({ itemManagementEnabled: false });
  expect(await RelatedItems({ projectId: "project" })).toBeNull();
  expect(mock.items).not.toHaveBeenCalled();
});
it("scopes enabled Items to the current Project and Order", async () => {
  mock.settings.mockResolvedValue({ itemManagementEnabled: true });
  expect(
    await RelatedItems({ projectId: "project", orderId: "order" }),
  ).not.toBeNull();
  expect(mock.items).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "project", procurementOrderId: "order" },
    }),
  );
});

vi.mock("@/app/(app)/related-records/actions", () => ({
  editRelatedNameAction: vi.fn(),
  removeOptionalLinksAction: vi.fn(),
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  unassignCashAction: vi.fn(),
}));

vi.mock("@/app/(app)/related-records/inline-actions", () => ({
  editRelatedFinancialRowAction: vi.fn(),
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: vi.fn(),
}));
