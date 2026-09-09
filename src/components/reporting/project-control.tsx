import { getProjectControl } from "@/lib/reporting/project-control";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import Link from "next/link";

export async function ProjectFinancialControl({
  projectId,
}: {
  projectId: string;
}) {
  const data = await getProjectControl(projectId);
  const money = (value: string | null) => formatMoney(value, data.currency);
  const rows = [
    ["Budgeted cost HT", "budget"],
    ["Recorded cost", "recordedCost"],
    ["Required revenue on budget", "budgetTarget"],
    ["Required revenue on recorded costs", "recordedTarget"],
    ["Quoted revenue (planned)", "quoted"],
    ["Invoiced revenue HT", "billed"],
    ["Invoice HT assigned to active Orders", "allocated"],
    ["Invoice HT outside active Orders", "projectRemainder"],
    ["Recovery less budgeted cost", "budgetCostSurplus"],
    ["Recovery less recorded cost", "recordedCostSurplus"],
    ["Recovery less budget selling target", "budgetTargetSurplus"],
    ["Recovery less recorded-cost selling target", "recordedTargetSurplus"],
  ] as const;
  return (
    <section className="space-y-4">
      {data.excludedReceiptCount > 0 && (
        <p
          role="status"
          className="bg-warning-muted text-warning-foreground rounded-md p-3 text-sm"
        >
          {data.excludedReceiptCount} historical receipts have no active Invoice
          context and are excluded from this cash position. Their records are
          retained.{" "}
          <Link className="underline" href={`/receipts?projectId=${projectId}`}>
            Review receipts
          </Link>
          .
        </p>
      )}
      <div>
        <h2 className="text-sm font-semibold">Project commercial position</h2>
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
              {["Merchandise", "Freight", "Other/services"].map((label) => (
                <th className="p-3 text-right" key={label}>
                  {label}
                </th>
              ))}
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
            </tr>
            {rows.map(([label, key]) => (
              <tr key={key}>
                <th className="p-3 font-medium">{label}</th>
                {data.categories.map((row) => (
                  <td
                    className="financial-figure p-3 text-right"
                    key={row.category}
                  >
                    {money(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Commercial freight allowance: {money(data.freightAllowance)}. This is
        separate from expected freight spending. Order non-deductible VAT:{" "}
        {money(data.orderNonDeductibleVat)}, included in Project economic profit
        below rather than arbitrarily assigned to a category. Freight expense
        non-deductible VAT remains in freight cost. Other/services has no
        separate planning budget yet. Recorded-cost targets use Order component
        markups; direct selling prices remain authoritative in Funding Coverage.
        Existing non-freight Billing starts as merchandise until reviewed.
      </p>
      <p className="text-muted-foreground text-xs">
        Project-level amounts include unassigned category revenue and
        allocations to cancelled Orders; they are not free cash. Category
        surpluses stay in their categories and contribute once to total Project
        profitability.
      </p>
      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Project cash position</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Client invoiced TTC", data.billedTtc],
              ["Client cash received", data.received],
              ["Client outstanding TTC", data.outstandingTtc],
              ["Supplier cash paid", data.supplierPaid],
              ["Freight expense cash paid", data.freightPaid],
              ["Tracked net Project cash", data.cash.net],
              [
                "Unpaid commitments: overdue + next 30 days",
                data.cash.nearTerm,
              ],
              [
                "Cash surplus / shortfall after 30-day commitments",
                data.cash.afterNearTerm,
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 text-sm font-semibold">
                {money(value)}
              </dd>
            </div>
          ))}
        </dl>
        <details className="mt-4 border-t pt-3">
          <summary className="cursor-pointer text-sm">
            All remaining commitments
          </summary>
          <p className="mt-2 text-sm">
            Outstanding scheduled Supplier and freight commitments:{" "}
            {money(data.cash.allRemaining)}. Cash after these commitments:{" "}
            {money(data.cash.afterAll)}.
          </p>
        </details>
        <p className="text-muted-foreground mt-3 text-xs">
          {data.cash.undatedCount} unpaid commitments have no due date; included
          only in all remaining. Unscheduled Order balances are separate from
          installment commitments. Future Client collections are not available
          cash. Invoice and payment FX may differ; a dash means an unavailable
          or incomplete value. This is tracked Project cash, not a bank balance.
        </p>
        <Link
          className="text-primary mt-3 inline-block text-xs underline"
          href="/unassigned-cash"
        >
          Review unassigned cash separately
        </Link>
      </div>
    </section>
  );
}
