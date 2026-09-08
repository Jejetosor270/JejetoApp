import { orderBudgetComparison } from "@/domain/finance/order-budget";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";
export function OrderBudgetComparison({ order }: { order: OrderSummary }) {
  const comparison = orderBudgetComparison({
    budget: order.budgetPurchaseAmountHt ?? null,
    purchase: order.costs.purchaseCost,
    purchaseCurrency: order.orderCurrencyCode,
    reportingCurrency: order.project.reportingCurrencyCode,
    purchaseFx: order.costs.purchaseFxRate,
    agreedMarkup: order.project.defaultProductMarkupRate,
    actualMarkup: order.billing.actualMarkupRate,
  });
  const currency = order.project.reportingCurrencyCode;
  const values = [
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
    [
      "Agreed Project product markup",
      formatRate(order.project.defaultProductMarkupRate),
    ],
    ["Actual invoiced markup", formatRate(order.billing.actualMarkupRate)],
    [
      "Markup difference",
      comparison.markupDifferencePoints === null
        ? "—"
        : comparison.markupDifferencePoints + " percentage points",
    ],
  ];
  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Budget & actual performance</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Positive purchase variance means over budget. Actual markup uses
        allocated active Invoice HT less economic landed cost, divided by
        economic landed cost; it includes freight and other costs. Missing
        amounts or required FX leave comparisons incomplete.
      </p>
    </section>
  );
}
