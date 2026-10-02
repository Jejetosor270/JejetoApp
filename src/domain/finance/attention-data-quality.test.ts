import { expect, it } from "vitest";
import type { AttentionDocument } from "./attention";
import { archivedBalanceIssues } from "./attention-data-quality";

const source = (
  overrides: Partial<AttentionDocument> = {},
): AttentionDocument => ({
  id: "invoice",
  side: "client",
  projectId: "archived",
  projectName: "Archived Project",
  reportingCurrency: "EUR",
  reference: "INV",
  partyId: "client",
  href: "/billing/invoice?tab=related",
  date: "2026-01-01",
  dueDate: "2027-02-01",
  currency: "EUR",
  totalHt: "100",
  totalTtc: "120",
  paid: "20",
  issued: true,
  toInvoice: false,
  fxMissing: false,
  actualFxMissing: false,
  terms: [],
  ...overrides,
});
it("shows all-date archived obligations in original currency without requiring a horizon", () => {
  expect(archivedBalanceIssues([source()])[0]).toMatchObject({
    key: "archived-client:invoice",
    priority: "Review",
    amount: "100.0000",
    currency: "EUR",
    basis: "TTC",
    date: "2027-02-01",
  });
});
it("does not invent converted totals for missing FX or ambiguous matches", () => {
  expect(
    archivedBalanceIssues([source({ currency: "USD", fxMissing: true })])[0],
  ).toMatchObject({
    priority: "Incomplete",
    amount: "100.0000",
    currency: "USD",
  });
  expect(
    archivedBalanceIssues([
      source({ reviewReason: "Ambiguous Invoice match" }),
    ])[0],
  ).toMatchObject({
    priority: "Incomplete",
    amount: null,
    detail: "Ambiguous Invoice match",
  });
});
it("omits planning documents and financially settled documents", () => {
  expect(
    archivedBalanceIssues([
      source({ issued: false, toInvoice: true }),
      source({ paid: "120" }),
    ]),
  ).toEqual([]);
});
it("uses the document balance when direct receipts settled an unallocated schedule", () => {
  const term = {
    id: "term",
    dueDate: null,
    currency: "EUR",
    scheduled: "120",
    paid: "0",
    fx: null,
    cancelled: false,
    href: "/installments/client/term",
    actualFxMissing: false,
  };
  expect(
    archivedBalanceIssues([source({ paid: "120", terms: [term] })]),
  ).toEqual([]);
  expect(
    archivedBalanceIssues([
      source({ paid: "120", terms: [{ ...term, cancelled: true }] }),
    ]),
  ).toEqual([]);
  expect(
    archivedBalanceIssues([
      source({ terms: [{ ...term, currency: "USD" }] }),
    ])[0],
  ).toMatchObject({ priority: "Incomplete", amount: null });
  expect(
    archivedBalanceIssues([
      source({ terms: [{ ...term, actualFxMissing: true }] }),
    ])[0],
  ).toMatchObject({ priority: "Incomplete", amount: "100.0000" });
});
it("shows inconsistent paid balances as incomplete rather than crashing or substituting zero", () => {
  expect(archivedBalanceIssues([source({ paid: "121" })])[0]).toMatchObject({
    priority: "Incomplete",
    amount: null,
  });
});
it.each(["supplier", "client"] as const)(
  "keeps archived %s refunds visible without inventing a corrupt paid balance",
  (side) => {
    expect(
      archivedBalanceIssues([
        source({
          side,
          totalTtc: "80",
          paid: "120",
          creditAdjusted: true,
          refundDue: "40",
        }),
      ]),
    ).toMatchObject([
      {
        key: `archived-refund-due-${side}:invoice`,
        priority: "Action needed",
        amount: "40.0000",
        date: null,
        href: "/billing/invoice?tab=related#credits",
      },
    ]);
  },
);
