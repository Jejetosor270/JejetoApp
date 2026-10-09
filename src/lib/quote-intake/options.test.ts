import { expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  clientBillingDocument: { findMany: vi.fn() },
  project: { findMany: vi.fn().mockResolvedValue([]) },
  supplier: { findMany: vi.fn().mockResolvedValue([]) },
  currency: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/settings/application-settings", () => ({
  isItemManagementEnabled: vi.fn().mockResolvedValue(false),
}));
import { listQuoteIntakeOptions } from "./options";

it("selects and serializes the Billing description without changing allocation amounts", async () => {
  database.clientBillingDocument.findMany.mockResolvedValue([
    {
      allocations: [{ allocatedAmount: "100.25" }],
      currencyCode: "EUR",
      documentType: "INVOICE",
      fxRateToReporting: null,
      id: "billing",
      isProjectRemainderApproved: false,
      projectId: "project",
      reference: "INV-DEMO",
      shortDescription: "Living room furnishings",
      totalHt: "60000",
    },
  ]);
  const options = await listQuoteIntakeOptions();
  expect(database.clientBillingDocument.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({ shortDescription: true }),
    }),
  );
  expect(options.billingDocuments[0]).toMatchObject({
    shortDescription: "Living room furnishings",
    allocatedHt: "100.2500",
    totalHt: "60000",
  });
});
