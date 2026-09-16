import type { ProjectControl } from "@/lib/reporting/project-control";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";

export function ProjectFinancialControl({ data }: { data: ProjectControl }) {
  const money = (value: string | null) => formatMoney(value, data.currency);
  const rows = [
    ["Budgeted cost HT", "budget"],
    ["Recorded cost HT", "recordedCost"],
    ["Budgeted Sell HT", "budgetTarget"],
    ["Target Revenue HT", "recordedTarget"],
    ["Quoted revenue (planned)", "quoted"],
    ["Invoiced revenue HT", "billed"],
    ["Allocated Client Invoice Amount HT", "allocated"],
    ["Unallocated Invoice HT", "projectRemainder"],
  ] as const;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Financials</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Revenue and costs in {data.currency}. Positive differences are
          surpluses; negative differences are shortfalls. Billing coverage is
          not cash received.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3">Measure</th>
              {["Merchandise", "Freight", "Other/services", "Total"].map(
                (label) => (
                  <th className="p-3 text-right" key={label}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <th className="p-3 font-medium">
                Current Project markup default
              </th>
              {data.categories.map((row) => (
                <td
                  className="financial-figure p-3 text-right"
                  key={row.category}
                >
                  {formatRate(row.markup)}
                </td>
              ))}
              <td
                className="text-muted-foreground p-3 text-right"
                title="Category markup defaults are not added or averaged."
              >
                Not applicable
              </td>
            </tr>
            {rows.map(([label, key]) => (
              <tr key={key}>
                <th className="p-3 font-medium">{label}</th>
                {data.categories.map((row) => (
                  <td
                    className="financial-figure p-3 text-right"
                    key={row.category}
                  >
                    {row[key] === null
                      ? key === "budget" || key === "budgetTarget"
                        ? key === "budgetTarget" && data.directTarget
                          ? "Not allocated"
                          : "Not budgeted"
                        : "Missing FX"
                      : money(row[key])}
                  </td>
                ))}
                <td
                  className="financial-figure p-3 text-right font-semibold"
                  title={
                    data.totals[key] === null
                      ? "Incomplete: a category value or required FX is missing."
                      : undefined
                  }
                >
                  {data.totals[key] === null
                    ? key === "budget" || key === "budgetTarget"
                      ? "Budget incomplete"
                      : "Missing FX"
                    : money(data.totals[key])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section
        className="rounded-lg border p-4"
        aria-label="Economic cost reconciliation"
      >
        <h3 className="text-sm font-semibold">Economic cost reconciliation</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Recorded cost HT", data.economicReconciliation.recordedHt],
              [
                "Order non-deductible VAT",
                data.economicReconciliation.orderNonDeductibleVat,
              ],
              [
                "Freight expense non-deductible VAT",
                data.economicReconciliation.freightNonDeductibleVat,
              ],
              ["Total economic cost", data.economicReconciliation.economicCost],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 text-sm">
                {value === null ? "Missing FX" : money(value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
