import { describe, expect, it } from "vitest";
import { billingCashContexts } from "./cash-expectations";

const receipt = { id: "receipt", amount: "100" };
const term = {
  id: "term",
  label: "Deposit",
  currencyCode: "EUR",
  dueDate: null,
  expectedFxRateToReporting: null,
  isCancelled: false,
  scheduledAmount: "500",
  receipts: [receipt],
};
const quote = {
  currencyCode: "EUR",
  id: "quote",
  documentType: "QUOTE",
  workflowStatus: "TO_BE_INVOICED",
  isCancelled: false,
  totalTtc: "1000",
  receipts: [receipt],
  paymentInstallments: [term, { ...term, id: "later", receipts: [] }],
  matchedInstallment: null,
};
const invoice = {
  ...quote,
  id: "invoice",
  documentType: "INVOICE",
  workflowStatus: "INVOICED",
  totalTtc: "500",
  matchedInstallment: term,
  paymentInstallments: [],
};

describe("shared Billing cash contexts", () => {
  it("does not sum foreign matched receipts into an Invoice balance", () => {
    const context = billingCashContexts([
      { ...invoice, currencyCode: "USD", receipts: [] },
    ])[0];
    expect(context?.reviewReason).toContain("currency differs");
    expect(context?.paid).toBe("0.0000");
    expect(context?.total).toBe("500.0000");
  });
  it("marks every owner of an ambiguous match incomplete without choosing a winner", () => {
    const contexts = billingCashContexts([
      quote,
      invoice,
      { ...invoice, id: "second", workflowStatus: "TO_BE_INVOICED" },
    ]);
    expect(
      contexts.every((context) =>
        context.reviewReason?.includes("Several active Invoices"),
      ),
    ).toBe(true);
    expect(contexts.map((context) => context.document.id)).toEqual([
      "quote",
      "invoice",
      "second",
    ]);
  });
  it("moves matched expectations to the Invoice once and deduplicates receipts", () => {
    const contexts = billingCashContexts([quote, invoice]);
    expect(
      contexts.map(({ kind, total, paid, terms }) => ({
        kind,
        total,
        paid,
        terms: terms.map((item) => item.id),
      })),
    ).toEqual([
      { kind: "planned", total: "500.0000", paid: "0.0000", terms: ["later"] },
      { kind: "issued", total: "500.0000", paid: "100.0000", terms: ["term"] },
    ]);
  });
  it("keeps pre-issue Invoices planned without reviving their matched Quote term", () => {
    const contexts = billingCashContexts([
      quote,
      { ...invoice, workflowStatus: "TO_BE_INVOICED" },
    ]);
    expect(contexts.map((context) => context.kind)).toEqual([
      "planned",
      "planned",
    ]);
    expect(contexts[0]?.terms.map((item) => item.id)).toEqual(["later"]);
  });
  it.each(["DRAFT", "CANCELLED"])(
    "excludes %s documents and lets their Quote expectation resume",
    (workflowStatus) => {
      const contexts = billingCashContexts([
        quote,
        { ...invoice, workflowStatus },
      ]);
      expect(contexts).toHaveLength(1);
      expect(contexts[0]?.total).toBe("1000.0000");
      expect(contexts[0]?.terms).toHaveLength(2);
    },
  );
  it("excludes cancelled documents independently of stored workflow status", () => {
    expect(billingCashContexts([{ ...invoice, isCancelled: true }])).toEqual(
      [],
    );
  });
});
