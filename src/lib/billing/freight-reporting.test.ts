import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  clientBillingDocument: { findMany: vi.fn() },
  clientBillingAllocation: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => db }));
import { getBilledFreight } from "./freight-reporting";
beforeEach(() => vi.clearAllMocks());
it("counts the document freight once for the whole Project", async () => {
  db.clientBillingDocument.findMany.mockResolvedValue([
    {
      freightCoverageHt: "100",
      currencyCode: "EUR",
      fxRateToReporting: null,
      documentType: "INVOICE",
      isCancelled: false,
    },
  ]);
  expect(await getBilledFreight({ projectId: "p" }, "EUR")).toMatchObject({
    invoicedFreightHt: "100.0000",
  });
  expect(db.clientBillingDocument.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: "p", isCancelled: false } }),
  );
  expect(db.clientBillingAllocation.findMany).not.toHaveBeenCalled();
});
it("uses only the selected Order freight portion", async () => {
  db.clientBillingAllocation.findMany.mockResolvedValue([
    {
      freightCoverageHt: "25",
      billingDocument: {
        currencyCode: "EUR",
        fxRateToReporting: null,
        documentType: "INVOICE",
        isCancelled: false,
      },
    },
  ]);
  expect(
    await getBilledFreight({ projectId: "p", orderId: "o" }, "EUR"),
  ).toMatchObject({ invoicedFreightHt: "25.0000" });
  expect(db.clientBillingAllocation.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        orderId: "o",
        billingDocument: { projectId: "p", isCancelled: false },
      },
    }),
  );
});
