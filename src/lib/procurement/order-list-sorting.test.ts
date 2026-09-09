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
