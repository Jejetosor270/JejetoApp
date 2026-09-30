import { expect, it } from "vitest";
import {
  completedPaymentDate,
  earliestUnpaidTermDate,
  nextUnpaidTerm,
  paymentTermState,
  overdueTermAmount,
} from "./terms";

const unpaidTerm = {
  id: "unpaid",
  dueDate: "2026-10-01",
  isCancelled: false,
  scheduledAmount: "100",
  payments: [] as { amount: string }[],
};

it("selects the earliest unpaid ISO date across years and months regardless of input order", () => {
  const terms = [
    { ...unpaidTerm, id: "next-year", dueDate: "2027-01-01" },
    { ...unpaidTerm, id: "december", dueDate: "2026-12-01" },
    { ...unpaidTerm, id: "earliest", dueDate: "2026-02-09" },
    { ...unpaidTerm, id: "next-day", dueDate: "2026-02-10" },
  ];
  const original = structuredClone(terms);
  for (const rows of [terms, terms.toReversed()]) {
    expect(earliestUnpaidTermDate(rows, null)).toBe("2026-02-09");
    expect(nextUnpaidTerm(rows)?.id).toBe("earliest");
  }
  expect(terms).toEqual(original);
});

it("ignores cancelled, fully paid, overpaid and zero terms while retaining a precise partial balance", () => {
  const terms = [
    {
      ...unpaidTerm,
      id: "cancelled",
      dueDate: "2026-01-01",
      isCancelled: true,
    },
    {
      ...unpaidTerm,
      id: "settled",
      dueDate: "2026-01-02",
      scheduledAmount: "0.3",
      payments: [{ amount: "0.1" }, { amount: "0.2" }],
    },
    {
      ...unpaidTerm,
      id: "overpaid",
      dueDate: "2026-01-03",
      payments: [{ amount: "101" }],
    },
    { ...unpaidTerm, id: "zero", dueDate: "2026-01-04", scheduledAmount: "0" },
    {
      ...unpaidTerm,
      id: "partial",
      dueDate: "2026-09-30",
      scheduledAmount: "0.3001",
      payments: [{ amount: "0.1" }, { amount: "0.2" }],
    },
    unpaidTerm,
  ];
  expect(earliestUnpaidTermDate(terms, "2025-01-01")).toBe("2026-09-30");
  expect(nextUnpaidTerm(terms)?.id).toBe("partial");
  expect(earliestUnpaidTermDate(terms.slice(0, 4), "2025-01-01")).toBeNull();
  expect(nextUnpaidTerm(terms.slice(0, 4))).toBeUndefined();
});

it.each([
  ["2026-09-01", "2026-09-01", "undated"],
  ["2026-11-01", "2026-10-01", "unpaid"],
  [null, "2026-10-01", "unpaid"],
] as const)(
  "orders undated terms using fallback %s only when present",
  (fallback, expected, id) => {
    const terms = [unpaidTerm, { ...unpaidTerm, id: "undated", dueDate: null }];
    expect(earliestUnpaidTermDate(terms, fallback)).toBe(expected);
    expect(nextUnpaidTerm(terms, fallback)?.id).toBe(id);
  },
);

it("keeps undated unpaid terms selectable without inventing a date and breaks equal-date ties by ID", () => {
  const undated = [{ ...unpaidTerm, dueDate: null }];
  expect(earliestUnpaidTermDate(undated, null)).toBeNull();
  expect(nextUnpaidTerm(undated)?.id).toBe("unpaid");
  const tied = [
    { ...unpaidTerm, id: "b" },
    { ...unpaidTerm, id: "a" },
  ];
  expect(earliestUnpaidTermDate(tied, null)).toBe("2026-10-01");
  expect(nextUnpaidTerm(tied)?.id).toBe("a");
  expect(nextUnpaidTerm(tied.toReversed())?.id).toBe("a");
});

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
