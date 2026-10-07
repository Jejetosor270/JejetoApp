import { expect, it } from "vitest";
import {
  dashboardReportHref,
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
