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
          </div>
        </div>
        {order.description ? (
          <p className="text-muted-foreground mt-4 border-t pt-4 text-sm leading-6">
            {order.description}
          </p>
        ) : null}
      </header>
      <section className="grid gap-3 lg:grid-cols-3">
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
              <dt className="border-t pt-2 font-medium">Landed cost</dt>
              <dd className="financial-figure border-t pt-2 text-right font-semibold">
                {formatMoney(financial.landedCost, order.orderCurrencyCode)}
              </dd>
              <dt className="text-muted-foreground">Gross profit</dt>
              <dd className="financial-figure text-right">
                {formatMoney(financial.grossProfit, order.sellingCurrencyCode)}
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
