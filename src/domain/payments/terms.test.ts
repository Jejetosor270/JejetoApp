import { expect, it } from "vitest";
import {
  earliestUnpaidTermDate,
  paymentTermState,
  overdueTermAmount,
} from "./terms";

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
it("uses unpaid term dates before a stale document date without dating an undated term", () => {
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
  ).toBeNull();
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
