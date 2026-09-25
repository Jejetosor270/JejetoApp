import { expect, it } from "vitest";
import {
  completedPaymentDate,
  earliestUnpaidTermDate,
  paymentTermState,
  overdueTermAmount,
} from "./terms";

it("uses the latest actual cash date only when fully paid, without fabricating missing dates", () => {
  const dates = ["2026-09-26", null, "2026-08-01", "2026-09-10"];
  expect(completedPaymentDate(true, dates)).toBe("2026-09-26");
  expect(completedPaymentDate(false, dates)).toBeNull();
  expect(completedPaymentDate(true, [])).toBeNull();
  expect(completedPaymentDate(true, [null])).toBeNull();
  expect(dates[0]).toBe("2026-09-26");
});

it.each([
  [null, "0", false, "DATE_NEEDED", "Date needed"],
  ["2026-09-10", "0", false, "UPCOMING", "Unpaid"],
  ["2026-09-09", "0", false, "DUE", "Due today"],
  ["2026-09-10", "30", false, "PARTIALLY_PAID", "Partially paid"],
  ["2026-09-08", "0", false, "OVERDUE", "Overdue"],
  [null, "100", false, "PAID", "Paid"],
  ["2026-09-08", "30", true, "CANCELLED", "Cancelled"],
] as const)(
  "preserves the %s / %s / %s status label",
  (dueDate, paid, cancelled, status, label) => {
    expect(
      paymentTermState({
        amount: "100",
        payments: [{ amount: paid }],
        dueDate,
        cancelled,
        today: "2026-09-09",
      }),
    ).toMatchObject({ status, label, paid });
  },
);

it("keeps undated and partially paid commitments explicit", () => {
  expect(
    paymentTermState({
      amount: "100.1256",
      payments: [{ amount: "30.1256" }],
      dueDate: null,
      cancelled: false,
      today: "2026-09-09",
    }),
  ).toEqual({
    paid: "30.1256",
    remaining: "70",
    status: "DATE_NEEDED",
    label: "Date needed · Partially paid",
  });
});
it("shows overdue and partial together, while paid and cancelled take precedence", () => {
  const input = {
    amount: "100",
    payments: [{ amount: "30" }],
    dueDate: "2026-09-01",
    cancelled: false,
    today: "2026-09-09",
  };
  expect(paymentTermState(input).label).toBe("Overdue · Partially paid");
  expect(
    paymentTermState({ ...input, payments: [{ amount: "100" }] }).status,
  ).toBe("PAID");
  expect(paymentTermState({ ...input, cancelled: true }).status).toBe(
    "CANCELLED",
  );
});
it("uses unpaid term dates before a stale document date falling back for an undated term", () => {
  const term = {
    dueDate: "2026-09-01",
    isCancelled: false,
    scheduledAmount: "100",
    payments: [{ amount: "100" }],
  };
  expect(
    earliestUnpaidTermDate(
      [term, { ...term, dueDate: "2026-10-01", payments: [] }],
      "2026-08-01",
    ),
  ).toBe("2026-10-01");
  expect(
    earliestUnpaidTermDate(
      [{ ...term, dueDate: null, payments: [] }],
      "2026-08-01",
    ),
  ).toBe("2026-08-01");
  expect(earliestUnpaidTermDate([], "2026-08-01")).toBe("2026-08-01");
});

it("counts only overdue term balances, capped by the actual Invoice outstanding", () => {
  const overdue = {
    scheduledAmount: "40",
    payments: [{ amount: "10" }],
    isCancelled: false,
    dueDate: "2026-09-01",
  };
  const input = {
    terms: [
      overdue,
      {
        ...overdue,
        scheduledAmount: "60",
        payments: [],
        dueDate: "2026-10-01",
      },
    ],
    outstanding: "90",
    fallbackDate: null,
    today: "2026-09-09",
  };
  expect(overdueTermAmount(input)).toBe("30");
  expect(overdueTermAmount({ ...input, outstanding: "20" })).toBe("20");
});
