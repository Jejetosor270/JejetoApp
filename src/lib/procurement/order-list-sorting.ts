import "server-only";
import Decimal from "decimal.js";
import type { OrderSort } from "@/config/order-list";
import { carrierName } from "@/config/carriers";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
import type { OrderSummary } from "./orders";

type SortValue = { value: string | null; currency?: string; numeric?: boolean };

function sortValue(order: OrderSummary, field: OrderSort): SortValue {
  const money = (
    value: string | null,
    currency = order.orderCurrencyCode,
  ): SortValue => ({ value, currency, numeric: true });
  switch (field) {
    case "purchase":
      return money(order.costs.purchaseCost);
    case "economicCost":
      return money(
        order.costs.reportingEconomicLandedCost,
        order.project.reportingCurrencyCode,
      );
    case "sell":
      return money(
        order.costs.reportingSellingRevenue,
        order.project.reportingCurrencyCode,
      );
    case "markup":
      return { value: order.costs.markupRate, numeric: true };
    case "payable":
      return money(order.supplierPayment.totalPayable);
    case "scheduled":
      return money(order.supplierPayment.scheduled);
    case "paid":
      return money(order.supplierPayment.paid);
    case "outstanding":
      return money(order.supplierPayment.outstanding);
    case "paymentStatus":
      return {
        value: recordPaymentStatusLabel(
          order.supplierPayment.status,
          order.paymentStatusOverride,
          order.status === "CANCELLED",
        ),
      };
    case "dueDate":
      return { value: order.supplierPayment.nextDueDate };
    case "carrier":
      return {
        value: order.carrierCode
          ? carrierName(order.carrierCode, order.carrierOtherName)
          : null,
      };
    default:
      throw new Error("This column must use database sorting.");
  }
}

export const derivedOrderSorts: readonly OrderSort[] = [
  "purchase",
  "economicCost",
  "sell",
  "markup",
  "payable",
  "scheduled",
  "paid",
  "outstanding",
  "paymentStatus",
  "dueDate",
  "carrier",
];

/** Runs on the full filtered scope before paging; never compares money across currencies. */
export function sortOrderSummaries(
  orders: OrderSummary[],
  field: OrderSort,
  direction: "asc" | "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  return orders
    .map((order) => ({ order, key: sortValue(order, field) }))
    .sort((a, b) => {
      const av = a.key.value;
      const bv = b.key.value;
      // Missing dates / incomplete FX always sort last, in either direction.
      if (av === null || bv === null) {
        if (av !== bv) return av === null ? 1 : -1;
        return a.order.id.localeCompare(b.order.id);
      }
      const currency = (a.key.currency ?? "").localeCompare(
        b.key.currency ?? "",
      );
      const value =
        currency ||
        (a.key.numeric ? new Decimal(av).comparedTo(bv) : av.localeCompare(bv));
      return value * sign || a.order.id.localeCompare(b.order.id);
    })
    .map(({ order }) => order);
}
