import Link from "next/link";
import type { ProjectControl } from "@/lib/reporting/project-control";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";

function CoverageFigures({
  values,
  currency,
}: {
  values: readonly (readonly [string, string | null, boolean?])[];
  currency: string;
}) {
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      {values.map(([label, value, signed]) => (
        <div key={label} className="bg-muted/25 rounded-md border p-3">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="financial-figure mt-1 text-sm font-semibold">
            {signed
              ? formatSignedMoney(value, currency)
              : formatMoney(value, currency)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectCoverage({
  data,
  projectId,
}: {
  data: ProjectControl;
  projectId: string;
}) {
  const freight = data.freightCoverage;
  return (
    <div className="space-y-4">
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">
          Billing/Purchasing Cash Coverage
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Actual Client Invoice receipts minus Supplier and Project-freight
          payments, TTC. Each payment uses its own recorded FX.
        </p>
        <CoverageFigures
          currency={data.currency}
          values={[
            ["Supplier & freight paid TTC", data.cash.paid],
            ["Client Invoice receipts TTC", data.received],
            ["Cash Coverage TTC", data.cash.net, true],
          ]}
        />
        {data.cash.net === null && (
          <p role="status" className="text-warning-foreground mt-3 text-xs">
            Cash coverage is incomplete: check payment FX.
          </p>
        )}
        {data.excludedReceiptCount > 0 && (
          <p role="status" className="text-warning-foreground mt-3 text-xs">
            {data.excludedReceiptCount} historical receipts have no active
            Invoice context and are excluded.{" "}
            <Link
              className="underline"
              href={`/receipts?projectId=${projectId}`}
            >
              Review receipts
            </Link>
            .
          </p>
        )}
      </section>
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">
          Billing/Purchasing Freight Coverage
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Order freight plus Project freight expenses, excluding VAT. Project
          freight markup: {formatRate(freight.projectMarkup)}.
        </p>
        <CoverageFigures
          currency={data.currency}
          values={[
            ["Supplier Freight invoiced HT", freight.supplierHt],
            ["Supplier Freight Project markup HT", freight.supplierMarkupHt],
            ["Supplier Freight Sell HT", freight.supplierSellHt],
          ]}
        />
        <CoverageFigures
          currency={data.currency}
          values={[
            ["Client Freight invoiced HT", freight.clientInvoicedHt],
            ["Client Freight paid HT (proportional)", freight.clientPaidHt],
          ]}
        />
        <p className="text-muted-foreground mt-3 text-xs">
          Paid freight HT = receipt TTC × Invoice freight HT ÷ Invoice TTC. This
          is proportional attribution, not a separately recorded freight
          payment.
        </p>
        <div className="mt-4 border-t pt-3">
          <h3 className="text-sm font-semibold">Available freight coverage</h3>
          <CoverageFigures
            currency={data.currency}
            values={[
              [
                "Invoiced less Supplier Freight Sell HT",
                freight.invoicedCoverageHt,
                true,
              ],
              [
                "Paid less Supplier Freight Sell HT",
                freight.paidCoverageHt,
                true,
              ],
            ]}
          />
        </div>
        {(freight.invoicedCoverageHt === null ||
          freight.paidCoverageHt === null) && (
          <p role="status" className="text-warning-foreground mt-3 text-xs">
            Freight coverage is incomplete: check FX and receipt Invoice
            attribution.
          </p>
        )}
      </section>
    </div>
  );
}
