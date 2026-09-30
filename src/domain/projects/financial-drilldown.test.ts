import { expect, it } from "vitest";
import {
  projectFinancialRows,
  type ProjectFinancialRow,
} from "./financial-drilldown";
const rows: ProjectFinancialRow[] = [
  {
    kind: "issued",
    label: "Overdue",
    href: "/billing/past",
    amount: "10",
    due: "2026-09-29",
  },
  {
    kind: "issued",
    label: "Today",
    href: "/billing/today",
    amount: "20",
    due: "2026-09-30",
  },
  {
    kind: "issued",
    label: "Boundary",
    href: "/billing/end",
    amount: null,
    due: "2026-10-29",
  },
  {
    kind: "issued",
    label: "Later",
    href: "/billing/later",
    amount: "40",
    due: "2026-10-30",
  },
  {
    kind: "issued",
    label: "Undated",
    href: "/billing/undated",
    amount: "50",
    due: null,
  },
  {
    kind: "planned",
    label: "Quote",
    href: "/billing/quote",
    amount: "60",
    due: "2026-10-01",
  },
  {
    kind: "payment",
    label: "Supplier",
    href: "/orders/supplier",
    amount: "70",
    due: "2026-10-01",
  },
];
it("uses inclusive period boundaries, preserves incomplete FX and separates plans and directions", () => {
  expect(
    projectFinancialRows(
      rows,
      ["issued"],
      "upcoming",
      "2026-09-30",
      "2026-10-29",
    ),
  ).toEqual([rows[1], rows[2]]);
  expect(
    projectFinancialRows(
      rows,
      ["issued"],
      "overdue",
      "2026-09-30",
      "2026-10-29",
    ),
  ).toEqual([rows[0]]);
  expect(
    projectFinancialRows(
      rows,
      ["issued"],
      "undated",
      "2026-09-30",
      "2026-10-29",
    ),
  ).toEqual([rows[4]]);
  expect(
    projectFinancialRows(rows, ["issued"], "all", "2026-09-30", "2026-10-29"),
  ).toHaveLength(5);
});
