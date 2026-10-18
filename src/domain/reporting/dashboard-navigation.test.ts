import { expect, it } from "vitest";
import {
  dashboardReportHref,
  dashboardMonthHref,
  dashboardTrendMonths,
} from "./dashboard-navigation";
import { clearFiltersHref } from "@/components/listing/filter-navigation";

it("preserves business filters without leaking a stale period or direction into a drill-down", () => {
  const link = dashboardReportHref(
    {
      projectId: "project",
      supplierId: "supplier",
      clientId: "client",
      projectStatus: "ACTIVE",
      direction: "CLIENT_RECEIPT",
      dateFrom: "2020-01-01",
      trendMonths: "6",
    },
    "payments",
    { dateFrom: "2026-05-01", dateTo: "2026-10-07" },
  );
  const query = new URL(link, "https://example.invalid").searchParams;
  expect(query.get("projectId")).toBe("project");
  expect(query.get("supplierId")).toBe("supplier");
  expect(query.get("clientId")).toBe("client");
  expect(query.get("projectStatus")).toBe("ACTIVE");
  expect(query.get("dateFrom")).toBe("2026-05-01");
  expect(query.has("direction")).toBe(false);
  expect(dashboardReportHref({ projectId: ["one", "two"] }, "vat")).toBe(
    "/reports?view=vat",
  );
});
it("drills into the selected month while preserving scope and partial period bounds", () => {
  const href =
    "/reports?view=payments&projectId=p&supplierId=s&clientId=c&projectStatus=ACTIVE&cashDelay=30&dateFrom=2020-01-01";
  const query = new URL(
    dashboardMonthHref(href, "2026-10", {
      start: "2026-05-01",
      end: "2026-10-18",
    }),
    "https://example.invalid",
  ).searchParams;
  expect(Object.fromEntries(query)).toMatchObject({
    view: "payments",
    projectId: "p",
    supplierId: "s",
    clientId: "c",
    projectStatus: "ACTIVE",
    cashDelay: "30",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-18",
  });
  expect(
    dashboardMonthHref("/reports?view=cash-flow", "2028-02", {
      start: "2028-02-10",
      end: "2028-05-10",
    }),
  ).toBe("/reports?view=cash-flow&dateFrom=2028-02-10&dateTo=2028-02-29");
});
it("uses only supported history periods and keeps presentation choices when clearing filters", () => {
  expect([undefined, "0", "99", "3", "12"].map(dashboardTrendMonths)).toEqual([
    6, 6, 6, 3, 12,
  ]);
  expect(
    clearFiltersHref(
      "/reports",
      new URLSearchParams(
        "view=dashboard&projectId=p&trendMonths=12&horizon=90d&page=3",
      ),
    ),
  ).toBe("/reports?view=dashboard&trendMonths=12&horizon=90d");
});
