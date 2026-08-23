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
});
