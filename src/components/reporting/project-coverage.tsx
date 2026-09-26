import Link from "next/link";
import type { ProjectControl } from "@/lib/reporting/project-control";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";

export function CoverageFigures({
  values,
  currency,
}: {
  values: readonly (readonly [string, string | null, boolean?])[];
  currency: string;
}) {
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      {values.map(([label, value, signed]) => (
        <div key={label} className="bg-muted/60 min-w-0 rounded-md border p-4">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="financial-figure mt-2 overflow-x-auto text-xl font-semibold tracking-tight">
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
  showCash = true,
}: {
  data: ProjectControl;
  projectId: string;
  showCash?: boolean;
}) {
  const freight = data.freightCoverage;
  return (
    <div className="space-y-4">
      {showCash && (
        <section className="record-surface">
          <h2 className="text-sm font-semibold">Cash balance</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Actual Client Invoice receipts minus Supplier and Project-freight
            payments, TTC. Each payment uses its own recorded FX.
          </p>
          <CoverageFigures
            currency={data.currency}
            values={[
              ["Supplier & freight paid TTC", data.cash.paid],
              ["Client Invoice receipts TTC", data.received],
              ["Cash balance TTC", data.cash.net, true],
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
      )}
      <section className="record-surface">
        <h2 className="text-sm font-semibold">Freight recovery surplus</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Order freight plus Project freight expenses, excluding VAT. Project
          freight markup: {formatRate(freight.projectMarkup)}.
        </p>
        <CoverageFigures
          currency={data.currency}
          values={[
            ["Recorded Supplier freight HT", freight.supplierHt],
            ["Supplier Freight Project markup HT", freight.supplierMarkupHt],
            ["Project-default freight target HT", freight.supplierSellHt],
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
          <CoverageFigures
            currency={data.currency}
            values={[
              [
                "Invoiced less Project-default target HT",
                freight.invoicedCoverageHt,
                true,
              ],
              [
                "Received less Project-default target HT",
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
