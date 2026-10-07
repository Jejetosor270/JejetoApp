import Decimal from "decimal.js";
import { freightCoverageBreakdown } from "@/domain/billing/freight-coverage";
import {
  billingCreditTotals,
  netBillingAllocation,
  type BillingCredit,
} from "@/domain/billing/credits";

export interface BillingProfitOrder {
  id: string;
  plannedSell: string | null;
  economicCost?: string | null;
  reportingCurrencyCode: string;
  cancelled?: boolean;
  invoicedAllocated?: string | null;
}
export interface BillingProfitInput {
  totalHt: string;
  freightHt: string;
  otherHt: string;
  currency: string;
  reportingCurrency: string;
  fx: string | null;
  rates: readonly (string | null)[];
  cancelled: boolean;
  allocations: readonly {
    orderId: string;
    allocatedAmount: string;
    freightCoverageHt?: string | undefined;
    otherCoverageHt?: string | undefined;
  }[];
  credits?: readonly BillingCredit[];
  orders: readonly BillingProfitOrder[];
}

const sum = (values: readonly (Decimal | null)[]) =>
  values.some((value) => value === null)
    ? null
    : values.reduce<Decimal>(
        (total, value) => total.plus(value ?? 0),
        new Decimal(0),
      );
const amount = (value: Decimal | null) => value?.toFixed(4) ?? null;
const rate = (profit: Decimal | null, cost: Decimal | null) =>
  profit === null || cost === null || cost.isZero()
    ? null
    : profit.div(cost).toFixed(6);

/** Billing-specific proportional pricing attribution, never recognized cash or a refund. */
export function billingProfitability(input: BillingProfitInput) {
  const creditSource = { credits: input.credits ?? [] };
  const credits = billingCreditTotals(creditSource);
  const allocations = input.allocations.map((allocation) => ({
    orderId: allocation.orderId,
    ...netBillingAllocation(creditSource, {
      ...allocation,
      freightCoverageHt: allocation.freightCoverageHt ?? "0",
      otherCoverageHt: allocation.otherCoverageHt ?? "0",
    }),
  }));
  const breakdown = freightCoverageBreakdown(
    new Decimal(input.totalHt).minus(credits.creditedHt).toFixed(4),
    new Decimal(input.freightHt).minus(credits.creditedFreightHt).toFixed(4),
    allocations,
    new Decimal(input.otherHt).minus(credits.creditedOtherHt).toFixed(4),
  );
  const orders = new Map(input.orders.map((order) => [order.id, order]));
  const costs: (Decimal | null)[] = [
    new Decimal(0),
    new Decimal(0),
    new Decimal(0),
  ];
  const orderRates: Record<string, string | null> = {};
  const issues = new Set<string>();
  const fxComplete =
    input.currency === input.reportingCurrency ||
    (input.fx !== null && new Decimal(input.fx).greaterThan(0));
  for (const allocation of allocations) {
    const allocated = new Decimal(allocation.allocatedAmount);
    if (allocated.isZero()) {
      orderRates[allocation.orderId] = null;
      continue;
    }
    const order = orders.get(allocation.orderId);
    const sell =
      order?.plannedSell == null ? null : new Decimal(order.plannedSell);
    const cost =
      order?.economicCost == null ? null : new Decimal(order.economicCost);
    const allocatedReporting = fxComplete
      ? allocated.times(
          input.currency === input.reportingCurrency ? 1 : (input.fx ?? "1"),
        )
      : null;
    const excessive =
      sell !== null &&
      (allocatedReporting?.greaterThan(sell) ||
        (order?.invoicedAllocated != null &&
          new Decimal(order.invoicedAllocated).greaterThan(sell)));
    const valid =
      !input.cancelled &&
      order &&
      !order.cancelled &&
      order.reportingCurrencyCode === input.reportingCurrency &&
      sell !== null &&
      sell.greaterThan(0) &&
      cost !== null &&
      fxComplete &&
      !excessive;
    // Economic cost and sell share one reporting currency. Their ratio is currency-independent;
    // applying it to each Billing category attributes the full Order cost proportionally once.
    const costRatio = valid ? cost.div(sell) : null;
    const parts = [
      allocated
        .minus(allocation.freightCoverageHt)
        .minus(allocation.otherCoverageHt),
      new Decimal(allocation.freightCoverageHt),
      new Decimal(allocation.otherCoverageHt),
    ];
    parts.forEach((part, index) => {
      if (part.isZero()) return;
      const current = costs[index];
      costs[index] =
        costRatio === null || current == null
          ? null
          : current.plus(part.times(costRatio));
    });
    const attributedCost =
      costRatio === null ? null : allocated.times(costRatio);
    orderRates[allocation.orderId] = rate(
      attributedCost === null ? null : allocated.minus(attributedCost),
      attributedCost,
    );
    if (!valid)
      issues.add(
        excessive
          ? "Order allocations exceed selling HT."
          : "Linked Order costs, status or FX need review.",
      );
  }
  const expectedCosts = breakdown.categories.map((category, index) => {
    const total = new Decimal(category.total);
    const markup = input.rates[index];
    return total.isZero()
      ? new Decimal(0)
      : markup == null
        ? null
        : total.div(new Decimal(1).plus(markup));
  });
  const expectedProfits = breakdown.categories.map((category, index) =>
    expectedCosts[index] == null
      ? null
      : new Decimal(category.total).minus(expectedCosts[index]),
  );
  const columns = breakdown.categories.map((category, index) => {
    const cost = input.cancelled ? null : (costs[index] ?? null);
    const profit =
      cost === null ? null : new Decimal(category.allocated).minus(cost);
    return {
      ...category,
      agreedMarkup: input.rates[index] ?? null,
      expectedProfit: amount(expectedProfits[index] ?? null),
      allocatedCost: amount(cost),
      allocatedProfit: amount(profit),
      actualMarkup: rate(profit, cost),
    };
  });
  const totalCost = input.cancelled ? null : sum(costs);
  const totalAllocated =
    sum(columns.map((column) => new Decimal(column.allocated))) ??
    new Decimal(0);
  const totalProfit =
    totalCost === null ? null : totalAllocated.minus(totalCost);
  const expectedProfit = sum(expectedProfits);
  columns.push({
    label: "Total",
    total:
      amount(sum(columns.map((column) => new Decimal(column.total)))) ??
      "0.0000",
    allocated: totalAllocated.toFixed(4),
    remaining:
      amount(sum(columns.map((column) => new Decimal(column.remaining)))) ??
      "0.0000",
    agreedMarkup: rate(expectedProfit, sum(expectedCosts)),
    expectedProfit: amount(expectedProfit),
    allocatedCost: amount(totalCost),
    allocatedProfit: amount(totalProfit),
    actualMarkup: rate(totalProfit, totalCost),
  });
  return { columns, orderRates, issues: [...issues] };
}
