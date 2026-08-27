import { describe, expect, it } from "vitest";

import { buildCalendarEvents } from "@/domain/payments/calendar";

const installment = {
  currencyCode: "EUR",
  direction: "SUPPLIER_PAYMENT" as const,
  dueDate: "2026-09-15",
  id: "installment-1",
  isCancelled: false,
  label: "Deposit",
  orderId: "order-1",
  orderNumber: "PO-001",
  partyName: "Example Supplier",
  paidAmount: "0",
  projectName: "Example Project",
  scheduledAmount: "30000",
};
const order = {
  actualDeliveryDate: null,
  expectedDeliveryDate: "2026-10-20",
  expectedReadyDate: "2026-10-01",
  id: "order-1",
  orderNumber: "PO-001",
  projectName: "Example Project",
};

describe("procurement calendar derivation", () => {
  it("derives Item logistics dates without a synchronized calendar record", () => {
    const events = buildCalendarEvents({
      installments: [],
      orders: [],
      today: "2026-08-26",
      items: [
        {
          estimatedFabricatorDate: "2026-09-05",
          estimatedResidenceDate: null,
          estimatedWarehouseDate: "2026-09-01",
          id: "item-1",
          installedDate: "2026-09-10",
          itemReference: "IT-1",
          name: "Dining Chair",
          projectName: "Villa Project",
        },
      ],
    });
    expect(events.map((event) => event.type)).toEqual([
      "ITEM_WAREHOUSE",
      "ITEM_FABRICATOR",
      "ITEM_INSTALLATION",
    ]);
    expect(events[0]?.href).toBe("/items/item-1");
  });
  it("derives payment and order timing events from source records", () => {
    const events = buildCalendarEvents({
      installments: [
        installment,
        { ...installment, direction: "CLIENT_RECEIPT", id: "installment-2" },
      ],
      orders: [order],
      today: "2026-09-01",
    });
    expect(events.map((event) => event.type)).toEqual([
      "SUPPLIER_PAYMENT",
      "CLIENT_RECEIPT",
      "EXPECTED_READY",
      "EXPECTED_DELIVERY",
    ]);
    expect(events[0]).toMatchObject({
      partyName: "Example Supplier",
      status: "UPCOMING",
    });
  });

  it("reflects a changed source date without a stale duplicate", () => {
    const events = buildCalendarEvents({
      installments: [{ ...installment, dueDate: "2026-09-20" }],
      orders: [],
      today: "2026-09-01",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.date).toBe("2026-09-20");
  });

  it("reflects cancellation, settlement, and deletion directly from sources", () => {
    const cancelled = buildCalendarEvents({
      installments: [{ ...installment, isCancelled: true }],
      orders: [],
      today: "2026-09-01",
    });
    expect(cancelled[0]?.status).toBe("CANCELLED");

    const paid = buildCalendarEvents({
      installments: [{ ...installment, paidAmount: "30000" }],
      orders: [],
      today: "2026-09-01",
    });
    expect(paid[0]?.status).toBe("PAID");

    expect(
      buildCalendarEvents({
        installments: [],
        orders: [],
        today: "2026-09-01",
      }),
    ).toEqual([]);
  });

  it("derives an AI-approved installment through the same path without duplicates", () => {
    const events = buildCalendarEvents({
      installments: [{ ...installment, label: "AI-reviewed deposit" }],
      orders: [],
      today: "2026-09-01",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-09-15",
      id: "payment-installment-1",
      title: "AI-reviewed deposit",
      type: "SUPPLIER_PAYMENT",
    });
  });
});
