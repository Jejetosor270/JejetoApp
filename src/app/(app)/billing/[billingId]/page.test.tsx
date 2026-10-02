import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => ({
  getCreditWorkspace: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ role: "MANAGER" }),
  canEditMasterData: () => true,
}));
vi.mock("@/lib/audit/history", () => ({ getRecordHistory: mocks.history }));
vi.mock("@/lib/billing/billing", () => ({
  getClientBillingDocument: async () => ({ projectId: "project" }),
  listClientBillingOptions: async () => ({}),
}));
vi.mock("@/lib/procurement/orders", () => ({
  listProjectOrders: async () => [],
}));
vi.mock("@/lib/related-records/records", () => ({
  getBillingRelations: async () => [],
}));
import BillingDetailPage from "./page";

it("passes only this Billing record's authorized history into its detail view", async () => {
  const billingId = "11111111-1111-4111-8111-111111111111";
  const history = {
    entries: [],
    hasMore: false,
    activityHref: `/admin/activity?entityType=BILLING_DOCUMENT&entityId=${billingId}`,
  };
  mocks.history.mockResolvedValue(history);
  const page = await BillingDetailPage({
    params: Promise.resolve({ billingId }),
    searchParams: Promise.resolve({}),
  });
  expect(mocks.history).toHaveBeenCalledWith("BILLING_DOCUMENT", billingId);
  expect(page.props.history).toEqual(history);
});
