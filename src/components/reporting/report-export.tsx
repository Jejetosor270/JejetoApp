import { reportExports } from "@/domain/reporting/export-options";
import { Button } from "@/components/ui/button";
import { filterControlClassName } from "@/components/listing/filter-field";

export function ReportExport({
  params,
  view,
}: {
  params: Record<string, string | string[] | undefined>;
  view: string;
}) {
  const defaultDataset =
    (
      {
        dashboard: "summary",
        "cash-flow": "forecast",
        payments: "transactions",
        projects: "projects",
        vat: "vat",
        freight: "freight",
      } as Record<string, string>
    )[view] ?? "summary";
  const keys = [
    "projectId",
    "clientId",
    "supplierId",
    "projectStatus",
    "trendMonths",
    "cashDelay",
  ];
  if (view === "payments" || view === "cash-flow")
    keys.push("dateFrom", "dateTo");
  if (view === "payments") keys.push("direction");
  return (
    <form
      action="/reports/export"
      method="get"
      className="flex flex-wrap items-end gap-2"
    >
      {keys.map((name) =>
        typeof params[name] === "string" && params[name] ? (
          <input key={name} type="hidden" name={name} value={params[name]} />
        ) : null,
      )}
      <input
        type="hidden"
        name="horizon"
        value={
          typeof params.horizon === "string" && params.horizon
            ? params.horizon
            : view === "dashboard"
              ? "90d"
              : "12m"
        }
      />
      <label className="grid gap-1 text-xs font-medium">
        Export report
        <select
          className={filterControlClassName}
          name="dataset"
          defaultValue={defaultDataset}
        >
          {reportExports.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline">
        Download CSV
      </Button>
      <p className="text-muted-foreground w-full text-xs">
        Current applied filters. Exact decimals, ISO dates and explicit
        incomplete values.
      </p>
    </form>
  );
}
