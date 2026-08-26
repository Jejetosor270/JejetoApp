import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  paymentInstallment: { findMany: vi.fn() },
  procurementOrder: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { getProcurementCalendarEvents } from "@/lib/payments/payments";

function installment(overrides: Record<string, unknown> = {}) {
  return {
    basis: "PERCENTAGE",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    createdById: null,
    currencyCode: "EUR",
    direction: "SUPPLIER_PAYMENT",
    dueDate: new Date("2026-09-15T00:00:00.000Z"),
    expectedFxRateToReporting: null,
    id: "installment-1",
    isCancelled: false,
    label: "AI-reviewed deposit",
    notes: null,
    order: {
      id: "order-1",
      orderCurrencyCode: "EUR",
      orderNumber: "PO-001",
      packageName: "Furniture package",
      project: {
        client: { displayName: "Example Client", id: "client-1" },
        id: "project-1",
        name: "Example Project",
        reportingCurrencyCode: "EUR",
      },
      sellingCurrencyCode: "EUR",
      supplier: { displayName: "Example Supplier", id: "supplier-1" },
    },
    orderId: "order-1",
    percentageRate: "0.300000",
    scheduledAmount: "30000.0000",
    sequence: 1,
    settlements: [],
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedById: null,
    ...overrides,
  };
}

describe("calendar events from authoritative installments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.procurementOrder.findMany.mockResolvedValue([]);
  });

  it("includes Supplier Payment and Client Receipt due dates with their parties", async () => {
    database.paymentInstallment.findMany.mockResolvedValue([
      installment(),
      installment({
        direction: "CLIENT_RECEIPT",
        id: "installment-2",
        label: "Client deposit",
      }),
    ]);

    const events = await getProcurementCalendarEvents(
      "2026-09-01",
      "2026-09-30",
    );
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-09-15",
          partyName: "Example Supplier",
          type: "SUPPLIER_PAYMENT",
        }),
        expect.objectContaining({
          date: "2026-09-15",
          partyName: "Example Client",
          type: "CLIENT_RECEIPT",
        }),
      ]),
    );
  });

  it("moves, updates, and removes the event with its source installment", async () => {
    database.paymentInstallment.findMany.mockResolvedValue([
      installment({ dueDate: new Date("2026-09-20T00:00:00.000Z") }),
    ]);
    const moved = await getProcurementCalendarEvents(
      "2026-09-01",
      "2026-09-30",
    );
    expect(moved).toHaveLength(1);
    expect(moved[0]?.date).toBe("2026-09-20");

    database.paymentInstallment.findMany.mockResolvedValue([
      installment({ isCancelled: true }),
    ]);
    const cancelled = await getProcurementCalendarEvents(
      "2026-09-01",
      "2026-09-30",
    );
    expect(cancelled[0]?.status).toBe("CANCELLED");

    database.paymentInstallment.findMany.mockResolvedValue([
      installment({
        settlements: [
          {
            amount: "30000.0000",
            createdAt: new Date("2026-09-10T00:00:00.000Z"),
            createdById: null,
            fxRateToReporting: null,
            id: "settlement-1",
            installmentId: "installment-1",
            notes: null,
            reference: null,
            settledAt: new Date("2026-09-10T00:00:00.000Z"),
            updatedAt: new Date("2026-09-10T00:00:00.000Z"),
            updatedById: null,
          },
        ],
      }),
    ]);
    const paid = await getProcurementCalendarEvents("2026-09-01", "2026-09-30");
    expect(paid[0]?.status).toBe("PAID");

    database.paymentInstallment.findMany.mockResolvedValue([]);
    expect(
      await getProcurementCalendarEvents("2026-09-01", "2026-09-30"),
    ).toEqual([]);
  });

  it("derives an AI-approved schedule once through the normal query path", async () => {
    database.paymentInstallment.findMany.mockResolvedValue([installment()]);
    const events = await getProcurementCalendarEvents(
      "2026-09-01",
      "2026-09-30",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "payment-installment-1",
      title: "AI-reviewed deposit",
    });
  });
});
