import { orderBudgetComparison } from "@/domain/finance/order-budget";
import {
  formatMoney,
  formatRate,
  formatPercentagePoints,
} from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";
export function OrderBudgetComparison({ order }: { order: OrderSummary }) {
  const comparison = orderBudgetComparison({
    budget: order.budgetPurchaseAmountHt ?? null,
    purchase: order.costs.purchaseCost,
    purchaseCurrency: order.orderCurrencyCode,
    reportingCurrency: order.project.reportingCurrencyCode,
    purchaseFx: order.costs.purchaseFxRate,
    agreedMarkup: order.costs.markupRate ?? "0",
    actualMarkup: order.billing.actualMarkupRate,
  });
  const currency = order.project.reportingCurrencyCode;
  const values = [
    [
      "Allocated Invoice HT (to date)",
      formatMoney(order.billing.invoicedAllocated, currency, "Missing FX"),
    ],
    [
      "Allocated product budget HT",
      formatMoney(order.budgetPurchaseAmountHt ?? null, currency),
    ],
    [
      "Actual product purchase HT",
      formatMoney(comparison.actualPurchase, currency),
    ],
    [
      "Purchase variance (actual − budget)",
      formatMoney(comparison.variance, currency),
    ],
    ["Planned economic markup", formatRate(order.costs.markupRate)],
    [
      "Allocated-to-date economic markup (provisional)",
      formatRate(order.billing.actualMarkupRate),
    ],
    [
      "Markup difference",
      order.costs.markupRate === null
        ? "Not applicable"
        : formatPercentagePoints(comparison.markupDifferencePoints),
    ],
  ];
  return (
    <details className="bg-card rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Budget & actual performance
      </summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Positive purchase variance means over budget. Both markup figures use
        total economic landed cost. Allocated-to-date markup uses allocated
        active Invoice HT less economic landed cost, divided by economic landed
        cost; partial invoicing makes it provisional. Missing amounts or
        required FX leave comparisons incomplete.
      </p>
    </details>
  );
}
