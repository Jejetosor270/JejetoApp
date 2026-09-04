import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderDetailShell } from "@/components/procurement/order-detail-shell";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import { OrderBillingReconciliation } from "@/components/billing/order-billing-reconciliation";
import { PaymentSchedule } from "@/components/payments/payment-schedule";
import {
  BUSINESS_TIME_ZONE,
  businessToday,
  formatDateOnly,
} from "@/domain/payments/dates";
import {
  formatFxRate,
  formatMoney,
  formatRate,
} from "@/domain/procurement/presentation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getOrder, listOrderOptions } from "@/lib/procurement/orders";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { listOrderQuoteImports } from "@/lib/quote-intake/history";
import { getOrderBillingReconciliation } from "@/lib/billing/billing";
import { orderBillingDifference } from "@/domain/billing/calculations";
import { formatEnumLabel } from "@/domain/presentation/labels";

export const metadata: Metadata = { title: "Supplier Order" };
export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const [user, options, order] = await Promise.all([
    requireUser(),
    listOrderOptions(),
    getOrder(orderId),
  ]);
  if (!order) notFound();
  const [billingDocuments, paymentSummary, quoteImports] = await Promise.all([
    getOrderBillingReconciliation(orderId),
    getOrderPaymentSummary(orderId),
    listOrderQuoteImports(orderId),
  ]);
  const cost = order.costs;
  return (
    <div className="space-y-6">
      <OrderDetailShell
        canEdit={canEditMasterData(user.role)}
        options={options}
        order={order}
      >
        <div>
          <DetailPageHeader
            backHref="/orders"
            backLabel="Supplier Orders"
            eyebrow={order.orderNumber}
            meta={`${order.project.name} · ${order.supplier.displayName}`}
            status={order.status}
            title={order.packageName}
          />
          {order.description ? (
            <p className="bg-card text-muted-foreground -mt-px rounded-b-lg border px-5 py-4 text-sm leading-6">
              {order.description}
            </p>
          ) : null}
        </div>
        <section className="grid gap-3 lg:grid-cols-2">
          <article className="bg-card rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Cost, sell & markup</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt>Product / supplier cost HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(cost.purchaseCost, order.orderCurrencyCode)}
              </dd>
              <dt>Freight</dt>
              <dd className="financial-figure text-right">
                {formatMoney(cost.freight, order.orderCurrencyCode)}
              </dd>
              <dt>Pricing method</dt>
              <dd className="text-right">
                {formatEnumLabel(order.pricingMode)}
              </dd>
              {order.pricingMode !== "DIRECT_SELLING_PRICE" ? (
                <>
                  <dt>Product markup</dt>
                  <dd className="financial-figure text-right">
                    {formatRate(order.componentPricing.productMarkupRate)}
                    <span className="text-muted-foreground block text-[0.6875rem]">
                      {order.componentPricing.productMarkupSource ===
                      "PROJECT_DEFAULT"
                        ? "Project default"
                        : "Supplier Order override"}
                    </span>
                  </dd>
                  <dt>Product Sell HT (reporting)</dt>
                  <dd className="financial-figure text-right">
                    {formatMoney(
                      order.componentPricing.productSellReporting,
                      order.project.reportingCurrencyCode,
                    )}
                  </dd>
                  <dt>Freight markup</dt>
                  <dd className="financial-figure text-right">
                    {formatRate(order.componentPricing.freightMarkupRate)}
                    <span className="text-muted-foreground block text-[0.6875rem]">
                      {order.componentPricing.freightMarkupSource ===
                      "PROJECT_DEFAULT"
                        ? "Project default"
                        : "Supplier Order override"}
                    </span>
                  </dd>
                  <dt>Freight Sell HT (reporting)</dt>
                  <dd className="financial-figure text-right">
                    {formatMoney(
                      order.componentPricing.freightSellReporting,
                      order.project.reportingCurrencyCode,
                    )}
                  </dd>
                </>
              ) : (
                <>
                  <dt>Package Sell HT</dt>
                  <dd className="financial-figure text-right">
                    {formatMoney(
                      order.packageSellingPrice,
                      order.sellingCurrencyCode,
                    )}
                  </dd>
                </>
              )}
              <dt>Customs / duties</dt>
              <dd className="financial-figure text-right">
                {formatMoney(cost.customsDuties, order.orderCurrencyCode)}
              </dd>
              <dt>Miscellaneous</dt>
              <dd className="financial-figure text-right">
                {formatMoney(cost.miscellaneous, order.orderCurrencyCode)}
              </dd>
              <dt className="border-t pt-2">
                Economic Landed Cost HT ({order.project.reportingCurrencyCode})
              </dt>
              <dd className="financial-figure border-t pt-2 text-right font-semibold">
                {formatMoney(
                  cost.reportingEconomicLandedCost,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt>Supplier Order Planned Gross Profit HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  cost.grossProfit,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt>Effective markup</dt>
              <dd className="financial-figure text-right">
                {formatRate(cost.markupRate)}
              </dd>
              <dt className="text-muted-foreground">Analytical margin</dt>
              <dd className="financial-figure text-muted-foreground text-right">
                {formatRate(cost.grossMarginRate)}
              </dd>
            </dl>
          </article>
          <article className="bg-card rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Selling & VAT</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt>Total Supplier Order Sell HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.totalSellingRevenue,
                  order.sellingCurrencyCode,
                )}
              </dd>
              <dt>Planned Supplier Order Output VAT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  cost.outputVat?.amount ?? null,
                  order.sellingCurrencyCode,
                )}
              </dd>
              <dt>VAT Base HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  cost.outputVat?.taxableBase ?? null,
                  order.sellingCurrencyCode,
                )}
                <span className="text-muted-foreground block text-[0.6875rem]">
                  {cost.outputVat?.taxableBaseIsManual
                    ? "Manual override"
                    : "Automatic · Total Sell HT"}
                </span>
              </dd>
              <dt>Selling TTC</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.totalSellingAmountIncludingVat,
                  order.sellingCurrencyCode,
                )}
              </dd>
              <dt>Input VAT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  cost.inputVat?.amount ?? null,
                  order.orderCurrencyCode,
                )}
              </dd>
              <dt>Input VAT recovery</dt>
              <dd className="text-right text-xs">
                {cost.inputVat?.recoverableRate
                  ? `${formatRate(cost.inputVat.recoverableRate)} · ${cost.inputVat.recoverability ? formatEnumLabel(cost.inputVat.recoverability) : ""}`
                  : "—"}
              </dd>
              <dt>Selling reporting</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  cost.reportingSellingRevenue,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt>Client quoted / allocated HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.billing.quotedAllocated,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt>Client invoiced / allocated HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.billing.invoicedAllocated,
                  order.project.reportingCurrencyCode,
                )}
                {!order.billing.conversionComplete ? (
                  <span className="text-destructive block text-[0.6875rem]">
                    Incomplete · billing FX required
                  </span>
                ) : null}
              </dd>
              <dt>Actual allocated gross profit</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.billing.actualGrossProfit,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt>Actual effective markup</dt>
              <dd className="financial-figure text-right">
                {formatRate(order.billing.actualMarkupRate)}
                <span className="text-muted-foreground block text-[0.6875rem]">
                  Analytical margin {formatRate(order.billing.actualMarginRate)}
                </span>
              </dd>
            </dl>
            <p className="text-muted-foreground mt-4 border-t pt-3 text-xs">
              Purchase FX:{" "}
              {cost.purchaseFxRate
                ? formatFxRate(cost.purchaseFxRate)
                : order.orderCurrencyCode ===
                    order.project.reportingCurrencyCode
                  ? "1 (same currency)"
                  : "Missing"}{" "}
              · Selling FX:{" "}
              {cost.sellingFxRate
                ? formatFxRate(cost.sellingFxRate)
                : order.sellingCurrencyCode ===
                    order.project.reportingCurrencyCode
                  ? "1 (same currency)"
                  : "Missing"}
            </p>
            {cost.missingFx.length ? (
              <p className="text-destructive mt-2 text-xs">
                Incomplete: missing {cost.missingFx.join(", ")}.
              </p>
            ) : null}
          </article>
        </section>
        <OrderBillingReconciliation
          canEdit={canEditMasterData(user.role)}
          difference={orderBillingDifference(
            order.costs.reportingSellingRevenue,
            order.billing.invoicedAllocated,
          )}
          documents={billingDocuments ?? []}
          invoicedAllocated={order.billing.invoicedAllocated}
          orderId={order.id}
          plannedSell={order.costs.reportingSellingRevenue}
          quotedAllocated={order.billing.quotedAllocated}
          reportingCurrencyCode={order.project.reportingCurrencyCode}
        />
        <section className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Procurement timing</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
            <div>
              <dt className="text-muted-foreground text-xs">Quote date</dt>
              <dd className="mt-1">{formatDateOnly(order.quoteDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                Supplier Order date
              </dt>
              <dd className="mt-1">{formatDateOnly(order.orderDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Lead time</dt>
              <dd className="mt-1">
                {order.leadTimeWeeks === null
                  ? "—"
                  : `${order.leadTimeWeeks} weeks`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Expected ready</dt>
              <dd className="mt-1">
                {formatDateOnly(order.expectedReadyDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                Expected delivery
              </dt>
              <dd className="mt-1">
                {formatDateOnly(order.expectedDeliveryDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Actual delivery</dt>
              <dd className="mt-1">
                {formatDateOnly(order.actualDeliveryDate)}
              </dd>
            </div>
          </dl>
        </section>
      </OrderDetailShell>
      {quoteImports.length > 0 ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Supplier quote history</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="px-2 py-2 font-medium">Processed</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                  <th className="px-2 py-2 font-medium">File</th>
                  <th className="px-2 py-2 font-medium">Quote</th>
                  <th className="px-2 py-2 font-medium">Provider</th>
                  <th className="px-2 py-2 font-medium">Employee</th>
                </tr>
              </thead>
              <tbody>
                {quoteImports.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="px-2 py-2">
                      {new Date(item.processedAt).toLocaleString("en-GB", {
                        timeZone: BUSINESS_TIME_ZONE,
                      })}
                    </td>
                    <td className="px-2 py-2">
                      {formatEnumLabel(item.action)}
                    </td>
                    <td className="px-2 py-2">{item.originalFilename}</td>
                    <td className="px-2 py-2">
                      {item.supplierQuoteReference ?? "—"} ·{" "}
                      {formatDateOnly(item.quoteDate)}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {item.extractionProvider} · {item.extractionModel}
                    </td>
                    <td className="px-2 py-2">
                      {item.processedByName ?? "Historical user"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <div className="space-y-4" id="payments">
        <PaymentSchedule
          canEdit={canEditMasterData(user.role)}
          currencies={options.currencies}
          direction="SUPPLIER_PAYMENT"
          orderId={order.id}
          reportingCurrencyCode={order.project.reportingCurrencyCode}
          summary={paymentSummary.supplier}
          today={businessToday()}
        />
        <PaymentSchedule
          canEdit={canEditMasterData(user.role)}
          currencies={options.currencies}
          direction="CLIENT_RECEIPT"
          orderId={order.id}
          reportingCurrencyCode={order.project.reportingCurrencyCode}
          summary={paymentSummary.client}
          today={businessToday()}
        />
      </div>
    </div>
  );
}
