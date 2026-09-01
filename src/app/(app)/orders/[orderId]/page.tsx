import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderForm } from "@/components/procurement/order-form";
import { PaymentSchedule } from "@/components/payments/payment-schedule";
import {
  BUSINESS_TIME_ZONE,
  businessToday,
  formatDateOnly,
} from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getOrder, listOrderOptions } from "@/lib/procurement/orders";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { listOrderQuoteImports } from "@/lib/quote-intake/history";

export const metadata: Metadata = { title: "Procurement order" };
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
  const [paymentSummary, quoteImports] = await Promise.all([
    getOrderPaymentSummary(orderId),
    listOrderQuoteImports(orderId),
  ]);
  const cost = order.costs;
  return (
    <div className="space-y-6">
      <header className="bg-card rounded-lg border p-5">
        <p className="text-primary font-mono text-xs">{order.orderNumber}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {order.packageName}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {order.project.name} · {order.supplier.displayName} ·{" "}
          {order.status.replaceAll("_", " ")}
        </p>
        {order.description ? (
          <p className="text-muted-foreground mt-4 border-t pt-4 text-sm leading-6">
            {order.description}
          </p>
        ) : null}
      </header>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Cost & margin</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt>Purchase cost HT</dt>
            <dd className="financial-figure text-right">
              {formatMoney(cost.purchaseCost, order.orderCurrencyCode)}
            </dd>
            <dt>Freight</dt>
            <dd className="financial-figure text-right">
              {formatMoney(cost.freight, order.orderCurrencyCode)}
            </dd>
            <dt>Customs / duties</dt>
            <dd className="financial-figure text-right">
              {formatMoney(cost.customsDuties, order.orderCurrencyCode)}
            </dd>
            <dt>Miscellaneous</dt>
            <dd className="financial-figure text-right">
              {formatMoney(cost.miscellaneous, order.orderCurrencyCode)}
            </dd>
            <dt className="border-t pt-2">
              Economic cost ({order.project.reportingCurrencyCode})
            </dt>
            <dd className="financial-figure border-t pt-2 text-right font-semibold">
              {formatMoney(
                cost.reportingEconomicLandedCost,
                order.project.reportingCurrencyCode,
              )}
            </dd>
            <dt>Gross profit</dt>
            <dd className="financial-figure text-right">
              {formatMoney(
                cost.grossProfit,
                order.project.reportingCurrencyCode,
              )}
            </dd>
            <dt>Gross margin</dt>
            <dd className="financial-figure text-right">
              {formatRate(cost.grossMarginRate)}
            </dd>
            <dt>Markup</dt>
            <dd className="financial-figure text-right">
              {formatRate(cost.markupRate)}
            </dd>
          </dl>
        </article>
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Selling & VAT</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt>Selling HT</dt>
            <dd className="financial-figure text-right">
              {formatMoney(
                order.totalSellingRevenue,
                order.sellingCurrencyCode,
              )}
            </dd>
            <dt>Output VAT</dt>
            <dd className="financial-figure text-right">
              {formatMoney(
                cost.outputVat?.amount ?? null,
                order.sellingCurrencyCode,
              )}
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
              {cost.inputVat?.recoverability?.replaceAll("_", " ") ?? "—"}
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
            <dt>Actual markup / margin</dt>
            <dd className="financial-figure text-right">
              {formatRate(order.billing.actualMarkupRate)} /{" "}
              {formatRate(order.billing.actualMarginRate)}
            </dd>
          </dl>
          <p className="text-muted-foreground mt-4 border-t pt-3 text-xs">
            Purchase FX:{" "}
            {cost.purchaseFxRate ??
              (order.orderCurrencyCode === order.project.reportingCurrencyCode
                ? "1 (same currency)"
                : "Missing")}{" "}
            · Selling FX:{" "}
            {cost.sellingFxRate ??
              (order.sellingCurrencyCode === order.project.reportingCurrencyCode
                ? "1 (same currency)"
                : "Missing")}
          </p>
          {cost.missingFx.length ? (
            <p className="text-destructive mt-2 text-xs">
              Incomplete: missing {cost.missingFx.join(", ")}.
            </p>
          ) : null}
        </article>
      </section>
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Procurement timing</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
          <div>
            <dt className="text-muted-foreground text-xs">Quote date</dt>
            <dd className="mt-1">{formatDateOnly(order.quoteDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Order date</dt>
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
            <dd className="mt-1">{formatDateOnly(order.expectedReadyDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Expected delivery</dt>
            <dd className="mt-1">
              {formatDateOnly(order.expectedDeliveryDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Actual delivery</dt>
            <dd className="mt-1">{formatDateOnly(order.actualDeliveryDate)}</dd>
          </div>
        </dl>
      </section>
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
                      {item.action.replaceAll("_", " ").toLowerCase()}
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
      {canEditMasterData(user.role) ? (
        <details>
          <summary className="border-input inline-flex h-9 cursor-pointer list-none items-center rounded-lg border px-3 text-sm font-medium">
            Edit order
          </summary>
          <div className="mt-4">
            <OrderForm options={options} order={order} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
