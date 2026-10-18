import { describe, expect, it } from "vitest";
import {
  billingTermPresentation,
  receiptTermChoices,
} from "./term-presentation";

const term = {
  amount: "1000",
  payments: [],
  dueDate: "2026-01-01",
  cancelled: false,
  today: "2026-10-18",
  hasCredits: false,
};

describe("Billing term presentation", () => {
  it("shows Invoice-level coverage without inventing term cash or Paid", () => {
    expect(
      billingTermPresentation({ ...term, cappedRemaining: "0.0000" }),
    ).toMatchObject({
      paid: "0",
      remaining: "0.0000",
      label: "Covered at invoice level",
    });
  });
  it("keeps actual term payment history and remaining overdue amount", () => {
    expect(
      billingTermPresentation({
        ...term,
        payments: [{ amount: "250" }],
        cappedRemaining: "300",
      }),
    ).toMatchObject({
      paid: "250",
      remaining: "300",
      invoiceCoverage: "450",
      label: "Overdue · Partially paid",
    });
  });
  it("distinguishes credits, paid terms, cancellation and invalid source contexts", () => {
    expect(
      billingTermPresentation({ ...term, dueDate: null, cappedRemaining: "0" })
        .needsDueDate,
    ).toBe(false);
    expect(
      billingTermPresentation({
        ...term,
        dueDate: null,
        cappedRemaining: "300",
      }).needsDueDate,
    ).toBe(true);
    expect(
      billingTermPresentation({
        ...term,
        hasCredits: true,
        cappedRemaining: "0",
      }).label,
    ).toBe("No balance due");
    expect(
      billingTermPresentation({
        ...term,
        payments: [{ amount: "1000" }],
        cappedRemaining: "0",
      }).label,
    ).toBe("Paid");
    expect(
      billingTermPresentation({
        ...term,
        cancelled: true,
        cappedRemaining: "0",
      }).label,
    ).toBe("Cancelled");
    expect(
      billingTermPresentation({ ...term, balanceReviewRequired: true }),
    ).toMatchObject({ label: "Review balance", remaining: null });
  });
});

it("offers same-currency active terms with Decimal-safe capacity excluding the current receipt", () => {
  const candidate = {
    id: "term",
    isCancelled: false,
    currencyCode: "EUR",
    scheduledAmount: "0.3",
    receipts: [{ id: "other", amount: "0.1" }],
  };
  const choices = receiptTermChoices({ id: "receipt", amount: "0.2" }, "EUR", [
    candidate,
    { ...candidate, id: "too-small", scheduledAmount: "0.2999" },
    {
      ...candidate,
      id: "current",
      receipts: [{ id: "receipt", amount: "0.2" }],
    },
    { ...candidate, id: "cancelled", isCancelled: true },
    { ...candidate, id: "foreign", currencyCode: "USD" },
    { ...candidate, id: "review", balanceReviewRequired: true },
  ]);
  expect(
    choices.map(({ term, available, fits }) => [term.id, available, fits]),
  ).toEqual([
    ["term", "0.2", true],
    ["too-small", "0.1999", false],
    ["current", "0.3", true],
  ]);
});
