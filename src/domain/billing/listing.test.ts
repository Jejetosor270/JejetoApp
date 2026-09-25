import { expect, it } from "vitest";
import { billingListFilters, sortBillingRows } from "./listing";
const row = {
  id: "a",
  currencyCode: "EUR",
  totalHt: "100",
  paid: "0",
  outstanding: "100",
  dueDate: "2026-09-16",
  status: "INVOICED",
  reference: "Invoice",
  documentDate: "2026-09-01",
  project: { name: "Project" },
};
it("sorts the displayed completion date for paid invoices, keeping missing dates last", () => {
  const rows = [
    { ...row, id: "paid", status: "PAID", dueDate: null, paidAt: "2026-09-20" },
    { ...row, id: "unpaid", paidAt: null },
    { ...row, id: "missing", dueDate: null, paidAt: null },
  ];
  expect(sortBillingRows(rows, "dueDate", "asc").map((r) => r.id)).toEqual([
    "unpaid",
    "paid",
    "missing",
  ]);
  expect(sortBillingRows(rows, "dueDate", "desc").map((r) => r.id)).toEqual([
    "paid",
    "unpaid",
    "missing",
  ]);
});
it("validates status and sorts Decimal money exactly, with deterministic ties and currencies", () => {
  expect(billingListFilters({ status: "PAID", sort: "paid" })).toMatchObject({
    status: "PAID",
    sort: "paid",
  });
  expect(billingListFilters({ status: "BAD", sort: "bad" })).toMatchObject({
    status: undefined,
    sort: "updated",
  });
  const rows = [
    row,
    { ...row, id: "b", totalHt: "9.9999" },
    { ...row, id: "c", totalHt: "10.0001" },
    { ...row, id: "d", currencyCode: "USD", totalHt: "1" },
  ];
  expect(sortBillingRows(rows, "totalHt", "asc").map((r) => r.id)).toEqual([
    "b",
    "c",
    "a",
    "d",
  ]);
  expect(
    sortBillingRows([{ ...row, id: "z" }, row], "status", "desc").map(
      (r) => r.id,
    ),
  ).toEqual(["a", "z"]);
  expect(
    sortBillingRows(
      [{ ...row, id: "z", dueDate: null }, row],
      "dueDate",
      "desc",
    ).map((r) => r.id),
  ).toEqual(["a", "z"]);
});
