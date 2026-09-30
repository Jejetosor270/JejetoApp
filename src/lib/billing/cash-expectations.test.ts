import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({
  clientBillingDocument: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
import { listClientCashInstallments } from "./reporting";

const term = {
  id: "term",
  label: "Payment",
  currencyCode: "USD",
  dueDate: new Date("2099-01-01T00:00:00Z"),
  expectedFxRateToReporting: null,
  isCancelled: false,
  scheduledAmount: "1000",
  receipts: [],
};
const invoice = {
  currencyCode: "USD",
  id: "invoice",
  reference: "INV-1",
  documentType: "INVOICE",
  workflowStatus: "INVOICED",
  isCancelled: false,
  totalTtc: "1000",
  dueDate: null,
  client: { id: "client", displayName: "Client" },
  project: { id: "project", name: "Project" },
  receipts: [{ id: "cash", amount: "400" }],
  paymentInstallments: [term],
  matchedInstallment: null,
};

describe("Billing forecast read model", () => {
  it("preserves separate diagnostic Invoice sources when matched term ownership is ambiguous", async () => {
    const matched = {
      ...invoice,
      matchedInstallment: term,
      paymentInstallments: [],
    };
    database.clientBillingDocument.findMany.mockResolvedValue([
      matched,
      { ...matched, id: "planned-invoice", workflowStatus: "TO_BE_INVOICED" },
    ]);
    const rows = await listClientCashInstallments();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual([
      "invoice:term",
      "planned-invoice:term",
    ]);
    expect(rows.map((row) => row.cashKind)).toEqual(["issued", "planned"]);
    expect(
      rows.every((row) =>
        row.reviewReason?.includes("Several active Invoices"),
      ),
    ).toBe(true);
  });
  beforeEach(() => vi.clearAllMocks());
  it("caps direct receipts while retaining missing expected FX and original scheduled amounts", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([invoice]);
    const rows = await listClientCashInstallments(["project"]);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "term",
        outstandingAmount: "600",
        scheduledAmount: "1000",
        receivedAmount: "0",
        expectedFxRate: null,
        currencyCode: "USD",
        cashKind: "issued",
      }),
    ]);
    expect(database.clientBillingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isCancelled: false,
          workflowStatus: { notIn: ["DRAFT", "CANCELLED"] },
          projectId: { in: ["project"] },
        }),
      }),
    );
  });
  it("shares the cap across dated terms, uses term FX, and keeps pre-issue plans separate", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      {
        ...invoice,
        paymentInstallments: [
          {
            ...term,
            id: "later",
            scheduledAmount: "500",
            dueDate: new Date("2099-02-01T00:00:00Z"),
            expectedFxRateToReporting: "0.85",
          },
          {
            ...term,
            id: "first",
            scheduledAmount: "500",
            expectedFxRateToReporting: "0.9",
          },
          { ...term, id: "cancelled", isCancelled: true },
        ],
      },
      {
        ...invoice,
        id: "planned",
        workflowStatus: "TO_BE_INVOICED",
        receipts: [],
        paymentInstallments: [{ ...term, id: "planned-term" }],
      },
      { ...invoice, id: "draft", workflowStatus: "DRAFT" },
      { ...invoice, id: "cancelled", isCancelled: true },
    ]);
    const rows = await listClientCashInstallments();
    expect(rows.find((row) => row.id === "first")).toMatchObject({
      outstandingAmount: "500",
      expectedFxRate: "0.9",
    });
    expect(rows.find((row) => row.id === "later")).toMatchObject({
      outstandingAmount: "100",
      expectedFxRate: "0.85",
    });
    expect(rows.find((row) => row.id === "cancelled")?.outstandingAmount).toBe(
      "0",
    );
    expect(rows.find((row) => row.id === "planned-term")?.cashKind).toBe(
      "planned",
    );
    expect(
      rows.some((row) =>
        ["draft", "cancelled"].includes(row.billingDocumentId),
      ),
    ).toBe(false);
  });
});
