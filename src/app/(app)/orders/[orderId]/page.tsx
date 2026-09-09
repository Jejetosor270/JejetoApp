import { RecordPaymentStatus } from "@/components/payments/record-payment-status";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";
import { RelatedItems } from "@/components/items/related-items";
import {
  RelatedRecords,
  RelatedRecordTable,
} from "@/components/layout/related-records";
import { getOrderRelations } from "@/lib/related-records/records";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { RecordSummary } from "@/components/layout/record-presentation";
import { OrderFreightCoverage } from "@/components/billing/order-freight-coverage";
import { carrierName } from "@/config/carriers";
import { OrderBudgetComparison } from "@/components/procurement/order-budget-comparison";
import Link from "next/link";
import { RecordWorkspace } from "@/components/layout/record-workspace";
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

export const metadata: Metadata = { title: "Order" };
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
  const [billingDocuments, paymentSummary, quoteImports, relations] =
    await Promise.all([
      getOrderBillingReconciliation(orderId),
      getOrderPaymentSummary(orderId),
      listOrderQuoteImports(orderId),
      getOrderRelations(orderId),
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
            backLabel="Purchasing"
            eyebrow={order.orderNumber}
            meta={`${order.project.name} · ${order.supplier.displayName}`}
            title={order.packageName}
          />
          <RecordPaymentStatus
            key={`${order.id}:${order.paymentStatusOverride}:${order.status}`}
            kind="order"
            id={order.id}
            automatic={order.supplierPayment.status}
            override={order.paymentStatusOverride}
            cancelled={order.status === "CANCELLED"}
            canEdit={canEditMasterData(user.role)}
            showCancel
          />
          {order.description ? (
            <p className="bg-card text-muted-foreground -mt-px rounded-b-lg border px-5 py-4 text-sm leading-6">
              {order.description}
            </p>
          ) : null}
        </div>
        <RecordWorkspace
          label="Order workspace"
          sections={[
            {
              id: "items",
              group: "related",
              label: "Items",
              content: (
                <RelatedItems projectId={order.project.id} orderId={order.id} />
              ),
            },
            {
              id: "connections",
              group: "related",
              label: "Project, Supplier & Buildings",
              content: (
                <RelatedRecords
                  tables={relations.filter((table) =>
                    ["projects", "suppliers", "buildings"].includes(table.id),
                  )}
                />
              ),
            },
            {
              id: "overview",
              group: "details",
              label: "Overview",
              content: (
                <>
                  <RecordSummary
                    values={[
                      {
                        label: "Economic landed cost HT",
                        value: formatMoney(
                          cost.reportingEconomicLandedCost,
                          order.project.reportingCurrencyCode,
                        ),
                      },
                      {
                        label: "Planned sell HT",
                        value: formatMoney(
                          cost.reportingSellingRevenue,
                          order.project.reportingCurrencyCode,
                        ),
                      },
                      {
                        label: "Planned gross profit HT",
                        value: formatMoney(
                          cost.grossProfit,
                          order.project.reportingCurrencyCode,
                        ),
                      },
                    ]}
                  />
                  {cost.missingFx.length > 0 && (
                    <p
                      role="status"
                      className="border-warning/30 bg-warning-muted text-warning rounded-md border p-3 text-sm"
                    >
                      Financial reporting is incomplete: missing{" "}
                      {cost.missingFx.join(", ")}.
                    </p>
                  )}
                </>
              ),
            },
            {
              id: "commercial",
              group: "details",
              label: "Commercial breakdown & VAT",
              content: (
                <section className="grid gap-3 lg:grid-cols-2">
                  <article className="bg-card rounded-lg border p-4">
                    <h2 className="text-sm font-semibold">
                      Cost, sell & markup
                    </h2>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <dt>Product / supplier cost HT</dt>
                      <dd className="financial-figure text-right">
                        {formatMoney(
                          cost.purchaseCost,
                          order.orderCurrencyCode,
                        )}
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
                            {formatRate(
                              order.componentPricing.productMarkupRate,
                            )}
                            <span className="text-muted-foreground block text-[0.6875rem]">
                              {order.componentPricing.productMarkupSource ===
                              "PROJECT_DEFAULT"
                                ? "Project default"
                                : "Order override"}
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
                            {formatRate(
                              order.componentPricing.freightMarkupRate,
                            )}
                            <span className="text-muted-foreground block text-[0.6875rem]">
                              {order.componentPricing.freightMarkupSource ===
                              "PROJECT_DEFAULT"
                                ? "Project default"
                                : "Order override"}
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
                        {formatMoney(
                          cost.customsDuties,
                          order.orderCurrencyCode,
                        )}
                      </dd>
                      <dt>Miscellaneous</dt>
                      <dd className="financial-figure text-right">
                        {formatMoney(
                          cost.miscellaneous,
                          order.orderCurrencyCode,
                        )}
                      </dd>
                      <dt>Effective markup</dt>
                      <dd className="financial-figure text-right">
                        {formatRate(cost.markupRate)}
                      </dd>
                      <dt className="text-muted-foreground">
                        Analytical margin
                      </dt>
                      <dd className="financial-figure text-muted-foreground text-right">
                        {formatRate(cost.grossMarginRate)}
                      </dd>
                    </dl>
                  </article>
                  <article className="bg-card rounded-lg border p-4">
                    <h2 className="text-sm font-semibold">Selling & VAT</h2>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <dt>Total Order Sell HT</dt>
                      <dd className="financial-figure text-right">
                        {formatMoney(
                          order.totalSellingRevenue,
                          order.sellingCurrencyCode,
                        )}
                      </dd>
                      <dt>Planned Order Output VAT</dt>
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
                          Analytical margin{" "}
                          {formatRate(order.billing.actualMarginRate)}
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
              ),
            },
            {
              id: "payments",
              group: "related",
              label: "Payment terms",
              content: (
                <div className="space-y-4">
                  <PaymentSchedule
                    canEdit={canEditMasterData(user.role)}
                    currencies={options.currencies}
                    direction="SUPPLIER_PAYMENT"
                    orderId={order.id}
                    reportingCurrencyCode={order.project.reportingCurrencyCode}
                    summary={paymentSummary.supplier}
                    today={businessToday()}
                  />
                  {paymentSummary.client.installments.length > 0 ? (
                    <details className="rounded-lg border p-4">
                      <summary className="text-sm font-medium">
                        Legacy Order client schedule
                      </summary>
                      <p className="text-muted-foreground my-3 text-sm">
                        Historical planning only. Actual Client collections
                        belong to Billing.
                      </p>
                      <Link
                        className="text-primary text-sm underline"
                        href={`/billing?projectId=${order.project.id}`}
                      >
                        Open Project Billing
                      </Link>{" "}
                      <PaymentSchedule
                        canEdit={canEditMasterData(user.role)}
                        currencies={options.currencies}
                        direction="CLIENT_RECEIPT"
                        orderId={order.id}
                        reportingCurrencyCode={
                          order.project.reportingCurrencyCode
                        }
                        summary={paymentSummary.client}
                        today={businessToday()}
                      />
                    </details>
                  ) : null}
                </div>
              ),
            },
            {
              id: "delivery",
              group: "details",
              label: "Delivery",
              content: (
                <section className="bg-card rounded-lg border p-4">
                  <h2 className="text-sm font-semibold">Delivery & tracking</h2>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground text-xs">Carrier</dt>
                      <dd>
                        {carrierName(order.carrierCode, order.carrierOtherName)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Transit / freight / tracking reference
                      </dt>
                      <dd className="break-all">
                        {order.trackingReference || "—"}
                      </dd>
                    </div>
                  </dl>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Quote date
                      </dt>
                      <dd className="mt-1">
                        {formatDateOnly(order.quoteDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Order date
                      </dt>
                      <dd className="mt-1">
                        {formatDateOnly(order.orderDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Invoice date
                      </dt>
                      <dd className="mt-1">
                        {formatDateOnly(order.invoiceDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Lead time
                      </dt>
                      <dd className="mt-1">
                        {order.leadTimeWeeks === null
                          ? "—"
                          : `${order.leadTimeWeeks} weeks`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Expected ready
                      </dt>
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
                      <dt className="text-muted-foreground text-xs">
                        Actual delivery
                      </dt>
                      <dd className="mt-1">
                        {formatDateOnly(order.actualDeliveryDate)}
                      </dd>
                    </div>
                  </dl>
                </section>
              ),
            },
            {
              id: "billing",
              group: "related",
              label: "Linked Billing",
              content: (
                <div className="space-y-4">
                  <RelatedRecords
                    actions={
                      canEditMasterData(user.role)
                        ? {
                            billing: (
                              <div className="flex flex-wrap gap-2">
                                <RelatedCashCreate
                                  scope={{ kind: "order", id: order.id }}
                                  kind="client-installment"
                                />
                                <RelatedCashCreate
                                  scope={{ kind: "order", id: order.id }}
                                  kind="receipt"
                                />
                              </div>
                            ),
                          }
                        : {}
                    }
                    tables={relations.filter((table) => table.id === "billing")}
                  />
                  {canEditMasterData(user.role) ? (
                    <EditorDrawer title="Manage Billing allocations" wide>
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
                        reportingCurrencyCode={
                          order.project.reportingCurrencyCode
                        }
                      />
                    </EditorDrawer>
                  ) : null}
                </div>
              ),
            },
            {
              id: "budget",
              group: "details",
              label: "Budget & freight checks",
              content: (
                <>
                  <OrderBudgetComparison order={order} />
                  <OrderFreightCoverage order={order} />
                </>
              ),
            },
            {
              id: "history",
              group: "related",
              label: "Document history",
              content: (
                <>
                  <RelatedRecordTable
                    table={{
                      id: "history",
                      title: "Document history",
                      description:
                        "Reviewed Supplier imports. Source documents are not retained.",
                      columns: [
                        "Processed",
                        "Action",
                        "File name",
                        "Quote",
                        "Provider / model",
                        "Employee",
                      ],
                      rows: quoteImports.map((item) => ({
                        id: item.id,
                        cells: [
                          new Date(item.processedAt).toLocaleString("en-GB", {
                            timeZone: BUSINESS_TIME_ZONE,
                          }),
                          formatEnumLabel(item.action),
                          item.originalFilename,
                          (item.supplierQuoteReference ?? "—") +
                            " · " +
                            formatDateOnly(item.quoteDate),
                          item.extractionProvider +
                            " / " +
                            item.extractionModel,
                          item.processedByName ?? "Historical user",
                        ],
                      })),
                    }}
                  />
                </>
              ),
            },
          ]}
        />
      </OrderDetailShell>
    </div>
  );
}
