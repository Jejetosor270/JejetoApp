import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { OrderSummary } from "./orders";
import { sortOrderSummaries } from "./order-list-sorting";

const row = (id: string, value: string | null, currency = "EUR") =>
  ({
    id,
    orderCurrencyCode: currency,
    costs: { purchaseCost: value },
  }) as OrderSummary;
it("sorts exact Decimal amounts, not lexicographic strings or floating-point values", () => {
  const sorted = sortOrderSummaries(
    [
      row("c", "900719925474099.0002"),
      row("b", "900719925474099.0001"),
      row("a", "2"),
    ],
    "purchase",
    "asc",
  );
  expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
});
it("groups unlike currencies and leaves missing values last in both directions", () => {
  const rows = [
    row("null", null),
    row("usd", "1", "USD"),
    row("eur", "100", "EUR"),
  ];
  expect(
    sortOrderSummaries(rows, "purchase", "asc").map((item) => item.id),
  ).toEqual(["eur", "usd", "null"]);
  expect(
    sortOrderSummaries(rows, "purchase", "desc").map((item) => item.id),
  ).toEqual(["usd", "eur", "null"]);
});
it("breaks equal-value ties by immutable ID without mutating the input", () => {
  const rows = [row("b", "10"), row("a", "10")];
  expect(
    sortOrderSummaries(rows, "purchase", "desc").map((item) => item.id),
  ).toEqual(["a", "b"]);
  expect(rows[0]?.id).toBe("b");
});

it("sorts next unpaid due dates without substituting historical payment dates", () => {
  const rows = [
    {
      ...row("paid", "100"),
      supplierPayment: {
        status: "PAID",
        nextDueDate: "2026-01-01",
        paidAt: "2026-09-20",
      },
    },
    {
      ...row("unpaid", "100"),
      supplierPayment: { nextDueDate: "2026-09-16", paidAt: null },
    },
    {
      ...row("missing", "100"),
      supplierPayment: { nextDueDate: null, paidAt: null },
    },
  ] as OrderSummary[];
  expect(sortOrderSummaries(rows, "dueDate", "asc").map((r) => r.id)).toEqual([
    "unpaid",
    "missing",
    "paid",
  ]);
  expect(sortOrderSummaries(rows, "dueDate", "desc").map((r) => r.id)).toEqual([
    "unpaid",
    "missing",
    "paid",
  ]);
});

it("sorts the displayed supplier document date, preferring the Invoice over its earlier Quote", () => {
  const rows = [
    {
      ...row("invoice", "100"),
      quoteDate: "2026-01-01",
      invoiceDate: "2026-03-01",
    },
    { ...row("quote", "100"), quoteDate: "2026-02-01", invoiceDate: null },
    { ...row("missing", "100"), quoteDate: null, invoiceDate: null },
  ] as OrderSummary[];
  expect(
    sortOrderSummaries(rows, "documentDate", "asc").map((r) => r.id),
  ).toEqual(["quote", "invoice", "missing"]);
  expect(
    sortOrderSummaries(rows, "documentDate", "desc").map((r) => r.id),
  ).toEqual(["invoice", "quote", "missing"]);
});
