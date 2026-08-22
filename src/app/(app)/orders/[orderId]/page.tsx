import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderForm } from "@/components/procurement/order-form";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getOrder, listOrderOptions } from "@/lib/procurement/orders";

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
  return (
    <div className="space-y-6">
      <header className="bg-card rounded-lg border p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <div>
            <p className="text-primary font-mono text-xs">
              {order.orderNumber}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {order.packageName}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {order.project.name} · {order.supplier.displayName} ·{" "}
              {order.status.replaceAll("_", " ")}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-muted-foreground text-xs">
              Total selling revenue HT
            </p>
            <p className="financial-figure mt-1 text-xl font-semibold">
              {formatMoney(
                order.totalSellingRevenue,
                order.sellingCurrencyCode,
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Original selling currency · reporting in{" "}
              {order.project.reportingCurrencyCode}
            </p>
          </div>
        </div>
        {order.description ? (
          <p className="text-muted-foreground mt-4 border-t pt-4 text-sm leading-6">
            {order.description}
          </p>
        ) : null}
      </header>
      <section className="grid gap-3 xl:grid-cols-3">
        {order.financialStates.map((financial) => (
          <article
            className="bg-card rounded-lg border p-4"
            key={financial.state}
          >
            <h2 className="text-sm font-semibold">
              {financial.state[0] + financial.state.slice(1).toLowerCase()}
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Purchase</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.supplierPurchase,
                  order.orderCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.supplierDiscount,
                  order.orderCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Freight</dt>
              <dd className="financial-figure text-right">
                {formatMoney(financial.freight, order.orderCurrencyCode)}
              </dd>
              <dt className="text-muted-foreground">Customs / duties</dt>
              <dd className="financial-figure text-right">
                {formatMoney(financial.customsDuties, order.orderCurrencyCode)}
              </dd>
              <dt className="text-muted-foreground">Miscellaneous</dt>
              <dd className="financial-figure text-right">
                {formatMoney(financial.miscellaneous, order.orderCurrencyCode)}
              </dd>
              <dt className="border-t pt-2 font-medium">Landed cost HT</dt>
              <dd className="financial-figure border-t pt-2 text-right font-semibold">
                {formatMoney(financial.landedCost, order.orderCurrencyCode)}
              </dd>
              <dt className="text-muted-foreground">Input VAT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.inputVat?.amount ?? null,
                  order.orderCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Purchase TTC</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.inputVat?.totalIncludingVat ?? null,
                  order.orderCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Input VAT treatment</dt>
              <dd className="text-right text-xs">
                {financial.inputVat
                  ? `${financial.inputVat.treatment.replaceAll("_", " ")} · ${financial.inputVat.recoverability?.replaceAll("_", " ")}`
                  : "—"}
              </dd>
              {financial.inputVat ? (
                <>
                  <dt className="text-muted-foreground">Input VAT basis</dt>
                  <dd className="text-right text-xs">
                    {financial.inputVat.amountIsManual
                      ? "Manual amount"
                      : "Calculated from rate"}
                  </dd>
                </>
              ) : null}
              <dt className="border-t pt-2 font-medium">
                Economic cost ({order.project.reportingCurrencyCode})
              </dt>
              <dd className="financial-figure border-t pt-2 text-right font-semibold">
                {formatMoney(
                  financial.reportingEconomicLandedCost,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Selling HT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  order.totalSellingRevenue,
                  order.sellingCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Output VAT</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.outputVat?.amount ?? null,
                  order.sellingCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Selling TTC</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.outputVat?.totalIncludingVat ?? null,
                  order.sellingCurrencyCode,
                )}
              </dd>
              {financial.outputVat ? (
                <>
                  <dt className="text-muted-foreground">Output VAT basis</dt>
                  <dd className="text-right text-xs">
                    {financial.outputVat.amountIsManual
                      ? "Manual amount"
                      : "Calculated from rate"}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Selling reporting</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.reportingSellingRevenue,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Gross profit</dt>
              <dd className="financial-figure text-right">
                {formatMoney(
                  financial.grossProfit,
                  order.project.reportingCurrencyCode,
                )}
              </dd>
              <dt className="text-muted-foreground">Gross margin</dt>
              <dd className="financial-figure text-right font-medium">
                {formatRate(financial.grossMarginRate)}
              </dd>
              <dt className="text-muted-foreground">Markup</dt>
              <dd className="financial-figure text-right">
                {formatRate(financial.markupRate)}
              </dd>
            </dl>
            <div className="text-muted-foreground mt-4 border-t pt-3 text-xs">
              <p>
                Purchase FX:{" "}
                {financial.purchaseFxRate ??
                  (order.orderCurrencyCode ===
                  order.project.reportingCurrencyCode
                    ? "1 (same currency)"
                    : "Missing")}
                {" · "}Selling FX:{" "}
                {financial.sellingFxRate ??
                  (order.sellingCurrencyCode ===
                  order.project.reportingCurrencyCode
                    ? "1 (same currency)"
                    : "Missing")}
              </p>
              {financial.missingFx.length ? (
                <p className="text-destructive mt-2 font-medium">
                  Incomplete: missing {financial.missingFx.join(", ")}.
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </section>
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Commercial basis</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Pricing method</dt>
            <dd className="mt-1">{order.pricingMode.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              Pricing cost state
            </dt>
            <dd className="mt-1">{order.pricingSourceState}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              Package selling price HT
            </dt>
            <dd className="financial-figure mt-1">
              {formatMoney(
                order.packageSellingPrice,
                order.sellingCurrencyCode,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              Separate freight resale HT
            </dt>
            <dd className="financial-figure mt-1">
              {formatMoney(
                order.freightResaleAmount,
                order.sellingCurrencyCode,
              )}
            </dd>
          </div>
        </dl>
      </section>
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
