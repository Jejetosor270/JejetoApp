import { getBilledFreight } from "@/lib/billing/freight-reporting";
import { freightDifference } from "@/domain/billing/freight-reporting";
import { reportingAmount } from "@/domain/finance/calculations";
import { formatMoney } from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";
export async function OrderFreightCoverage({ order }: { order: OrderSummary }) {
  if (!order.project.id)
    return (
      <p className="text-muted-foreground text-sm">
        This Order is unassigned and has no linked Billing freight coverage.
      </p>
    );
  const currency = order.project.reportingCurrencyCode;
  const billed = await getBilledFreight(
    { projectId: order.project.id, orderId: order.id },
    currency,
  );
  const cost =
    reportingAmount({
      originalAmount: order.costs.freight ?? "0",
      originalCurrencyCode: order.orderCurrencyCode,
      reportingCurrencyCode: currency,
      fxRateToReporting: order.costs.purchaseFxRate,
    })?.toFixed(4) ?? null;
  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Freight coverage</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          ["Invoiced freight coverage HT", billed.invoicedFreightHt],
          ["Quoted freight coverage HT (planned)", billed.quotedFreightHt],
          ["Order freight cost HT", cost],
          [
            "Invoiced coverage less freight cost HT",
            freightDifference(billed.invoicedFreightHt, cost),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1">
              {formatMoney(value ?? null, currency)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Freight coverage is already included in allocated billing revenue.
        Project-level freight remains in Project reporting. Quotes are planned,
        not actual revenue.
      </p>
    </section>
  );
}
