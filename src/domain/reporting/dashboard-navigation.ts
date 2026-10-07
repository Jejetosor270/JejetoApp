export type ReportParams = Record<string, string | string[] | undefined>;

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
