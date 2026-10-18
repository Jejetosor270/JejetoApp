import {
  addMonthsToDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";

export type ReportParams = Record<string, string | string[] | undefined>;

/** Keep scope and clip partial edge months to the period represented by the chart. */
export function dashboardMonthHref(
  href: string,
  month: string,
  range: { start: string; end: string },
) {
  const [path, queryString = ""] = href.split("?");
  const query = new URLSearchParams(queryString);
  const first = `${month}-01`;
  const last = dateOnlyToDate(addMonthsToDateOnly(first, 1));
  last.setUTCDate(last.getUTCDate() - 1);
  query.set("dateFrom", first < range.start ? range.start : first);
  const monthEnd = dateToDateOnly(last);
  query.set("dateTo", monthEnd > range.end ? range.end : monthEnd);
  return `${path}?${query.toString()}`;
}

/** Preserve business scope; drill-downs explicitly choose their date/column semantics. */
export function dashboardReportHref(
  params: ReportParams,
  view: string,
  extra: Record<string, string> = {},
) {
  const query = new URLSearchParams();
  for (const key of [
    "projectId",
    "clientId",
    "supplierId",
    "projectStatus",
    "horizon",
    "trendMonths",
    "cashDelay",
  ]) {
    const value = params[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  query.set("view", view);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return `/reports?${query.toString()}`;
}

export function dashboardTrendMonths(value: string | undefined): 3 | 6 | 12 {
  return value === "3" ? 3 : value === "12" ? 12 : 6;
}
