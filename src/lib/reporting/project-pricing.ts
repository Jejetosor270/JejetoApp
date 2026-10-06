import "server-only";
import Decimal from "decimal.js";
import { reportingAmount } from "@/domain/finance/calculations";
import type { ProjectMetricRow } from "@/domain/finance/project-dashboard";
import { freightExpenseEconomicCost } from "@/lib/freight/expenses";
import type { OrderSummary } from "@/lib/procurement/orders";

export { summarizeProjectPricing } from "@/domain/finance/project-dashboard";

type PricingOrder = Pick<OrderSummary, "id" | "orderNumber" | "status"> & {
  costs: Pick<
    OrderSummary["costs"],
    "reportingEconomicLandedCost" | "reportingSellingRevenue"
  >;
};

type PricingFreightExpense = Parameters<
  typeof freightExpenseEconomicCost
>[0] & {
  id: string;
  description: string;
  currencyCode: string;
  fxRateToReporting: { toString(): string } | null;
};

/** Reuses authoritative Order summaries and visible freight for one Project. */
export function projectPricingRows(input: {
  projectId: string;
  reportingCurrencyCode: string;
  orders: readonly PricingOrder[];
  freightExpenses: readonly PricingFreightExpense[];
}): { cost: ProjectMetricRow[]; sell: ProjectMetricRow[] } {
  const orders = input.orders.filter((order) => order.status !== "CANCELLED");
  const orderRows = (
    value: (order: PricingOrder) => string | null,
    note: string,
  ): ProjectMetricRow[] =>
    orders.map((order) => ({
      label: order.orderNumber,
      href: `/orders/${order.id}`,
      amount: value(order),
      note,
    }));

  return {
    cost: [
      ...orderRows(
        (order) => order.costs.reportingEconomicLandedCost,
        "Order economic cost after Supplier credits, including non-deductible VAT.",
      ),
      ...input.freightExpenses.map((expense) => {
        const economicCost = freightExpenseEconomicCost(expense);
        return {
          label: expense.description,
          href: `/projects/${input.projectId}?section=freight#freight-${expense.id}`,
          amount: new Decimal(economicCost).isZero()
            ? "0"
            : (reportingAmount({
                originalAmount: economicCost,
                originalCurrencyCode: expense.currencyCode,
                reportingCurrencyCode: input.reportingCurrencyCode,
                fxRateToReporting:
                  expense.fxRateToReporting?.toString() ?? null,
              })?.toString() ?? null),
          note: "Separate Project freight economic cost, including non-deductible VAT.",
        };
      }),
    ],
    sell: orderRows(
      (order) => order.costs.reportingSellingRevenue,
      "Agreed active Order selling HT.",
    ),
  };
}
