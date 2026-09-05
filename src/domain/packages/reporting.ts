import Decimal from "decimal.js";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import { reportingAmount } from "@/domain/finance/calculations";
import { aggregateReportingCash } from "@/domain/payments/calculations";

export function summarizePackage(
  orders: OrderSummary[],
  payments: PaymentInstallmentView[],
  currency: string,
) {
  const active = orders.filter((order) => order.status !== "CANCELLED");
  const sum = (amounts: (string | null)[]) =>
    amounts.some((value) => value === null)
      ? null
      : amounts
          .reduce<Decimal>(
            (total, value) => total.plus(value ?? "0"),
            new Decimal(0),
          )
          .toFixed(4);
  const ids = new Set(orders.map((order) => order.id));
  const cash = aggregateReportingCash({
    reportingCurrencyCode: currency,
    installments: payments
      .filter(
        (payment) =>
          ids.has(payment.orderId) && payment.direction === "SUPPLIER_PAYMENT",
      )
      .map((payment) => ({
        currencyCode: payment.currencyCode,
        expectedFxRate: payment.expectedFxRate,
        isCancelled: payment.isCancelled,
        outstandingAmount: payment.outstandingAmount,
        scheduledAmount: payment.scheduledAmount,
        settlements: payment.settlements.map((settlement) => ({
          amount: settlement.amount,
          actualFxRate: settlement.fxRate,
        })),
      })),
  });
  return {
    count: orders.length,
    purchase: sum(
      active.map((order) =>
        order.costs.purchaseCost === null
          ? null
          : (reportingAmount({
              originalAmount: order.costs.purchaseCost,
              originalCurrencyCode: order.orderCurrencyCode,
              reportingCurrencyCode: currency,
              fxRateToReporting: order.costs.purchaseFxRate,
            })?.toFixed(4) ?? null),
      ),
    ),
    economic: sum(
      active.map((order) => order.costs.reportingEconomicLandedCost),
    ),
    sell: sum(active.map((order) => order.costs.reportingSellingRevenue)),
    allocated: sum(active.map((order) => order.billing.invoicedAllocated)),
    paid: cash.incompleteAmountCount ? null : cash.paid.toFixed(4),
    outstanding: cash.incompleteAmountCount
      ? null
      : cash.outstanding.toFixed(4),
  };
}
