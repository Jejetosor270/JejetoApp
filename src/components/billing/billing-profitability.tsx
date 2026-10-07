import type { billingProfitability } from "@/domain/finance/billing-profitability";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { RecordSectionHeading } from "@/components/layout/record-presentation";

export function BillingProfitability({
  result,
  currency,
}: {
  result: ReturnType<typeof billingProfitability>;
  currency: string;
}) {
  return (
    <article className="bg-card min-w-0 rounded-lg border p-4">
      <RecordSectionHeading title="Invoice allocation HT" />
      <div className="mt-3 overflow-x-auto">
        <table
          className="w-full text-sm"
          aria-label="Billing allocation and markup"
        >
          <thead>
            <tr>
              <th className="p-2 text-left">Measure</th>
              {result.columns.map((column) => (
                <th key={column.label} className="p-2 text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Total", "total", false],
                ["Agreed markup", "agreedMarkup", true],
                ["Expected profit", "expectedProfit", false],
                ["Allocated to Orders", "allocated", false],
                ["Allocated cost", "allocatedCost", false],
                ["Allocated profit", "allocatedProfit", false],
                ["Actual markup", "actualMarkup", true],
                ["Unallocated HT", "remaining", false],
              ] as const
            ).map(([label, key, percentage]) => (
              <tr key={key} className="border-t">
                <th
                  className="p-2 text-left font-normal"
                  title={
                    key === "allocatedCost"
                      ? "Full Order economic cost attributed by this allocation / Order selling HT, including freight, other costs and non-recoverable VAT."
                      : key === "expectedProfit"
                        ? "Profit embedded in total Billing HT at each Project category markup; not allocated profit."
                        : undefined
                  }
                >
                  {label}
                </th>
                {result.columns.map((column) => (
                  <td
                    key={column.label}
                    className={`financial-figure p-2 text-right whitespace-nowrap ${column.label === "Total" ? "font-semibold" : ""}`}
                  >
                    {percentage
                      ? column[key] === null
                        ? (key === "actualMarkup" &&
                            column.allocatedCost !== null) ||
                          (key === "agreedMarkup" &&
                            column.expectedProfit !== null)
                          ? "—"
                          : "Incomplete"
                        : formatRate(column[key])
                      : formatMoney(column[key], currency, "Incomplete")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.issues.length ? (
        <p className="text-warning-foreground mt-2 text-xs">
          {result.issues.join(" ")}
        </p>
      ) : null}
    </article>
  );
}
