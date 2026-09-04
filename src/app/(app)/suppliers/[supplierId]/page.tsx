import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SupplierDetailEditor } from "@/app/(app)/suppliers/supplier-management";
import { Badge } from "@/components/ui/badge";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import { formatDateOnly, formatTimestamp } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { PaymentDirection } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getSupplier } from "@/lib/master-data/suppliers";
import { listActiveCurrencies } from "@/lib/master-data/lookups";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { listOrders } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  if (!z.uuid().safeParse(supplierId).success) notFound();
  const [user, supplier, currencies, orders, installments, activity] =
    await Promise.all([
      requireUser(),
      getSupplier(supplierId),
      listActiveCurrencies(),
      listOrders({ query: "", supplierId }),
      listPaymentInstallments({
        direction: PaymentDirection.SUPPLIER_PAYMENT,
        supplierId,
      }),
      getDatabase().auditEvent.findMany({
        where: { entityId: supplierId, entityType: "SUPPLIER" },
        orderBy: { occurredAt: "desc" },
        take: 20,
      }),
    ]);
  if (!supplier) notFound();
  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/suppliers"
        backLabel="Suppliers"
        eyebrow="Directory · Supplier"
        meta={supplier.legalName}
        status={supplier.isActive ? "ACTIVE" : "ARCHIVED"}
        title={supplier.displayName}
      />
      <SupplierDetailEditor
        canEdit={canEditMasterData(user.role)}
        currencies={currencies}
        supplier={supplier}
      />
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Supplier Orders</h2>
        <div className="mt-3 divide-y text-sm">
          {orders.map((order) => (
            <Link
              className="grid gap-2 py-2 hover:underline sm:grid-cols-4"
              href={`/orders/${order.id}`}
              key={order.id}
            >
              <span className="font-mono">{order.orderNumber}</span>
              <span>{order.project.name}</span>
              <span>{formatEnumLabel(order.status)}</span>
              <span className="financial-figure text-right">
                {formatMoney(order.costs.purchaseCost, order.orderCurrencyCode)}
              </span>
            </Link>
          ))}
          {orders.length === 0 ? (
            <p className="text-muted-foreground py-4">No Supplier Orders.</p>
          ) : null}
        </div>
      </section>
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Payments</h2>
        <div className="mt-3 divide-y text-sm">
          {installments.map((installment) => (
            <div
              className="grid gap-2 py-2 sm:grid-cols-6"
              key={installment.id}
            >
              <Link
                className="font-mono hover:underline"
                href={`/orders/${installment.orderId}#payments`}
              >
                {installment.orderNumber}
              </Link>
              <span>{installment.label}</span>
              <span>{formatDateOnly(installment.dueDate)}</span>
              <span className="financial-figure text-right">
                {formatMoney(installment.paidAmount, installment.currencyCode)}{" "}
                paid
              </span>
              <span className="financial-figure text-right">
                {formatMoney(
                  installment.outstandingAmount,
                  installment.currencyCode,
                )}{" "}
                outstanding
              </span>
              <Badge
                variant={
                  installment.status === "OVERDUE" ? "destructive" : "outline"
                }
              >
                {formatEnumLabel(installment.status)}
              </Badge>
            </div>
          ))}
          {installments.length === 0 ? (
            <p className="text-muted-foreground py-4">
              No Supplier payment schedule.
            </p>
          ) : null}
        </div>
      </section>
      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="mt-3 divide-y text-sm">
          {activity.map((event) => (
            <p className="py-2" key={event.id}>
              {event.summary}{" "}
              <span className="text-muted-foreground">
                · {event.actorName} · {formatTimestamp(event.occurredAt)}
              </span>
            </p>
          ))}
          {activity.length === 0 ? (
            <p className="text-muted-foreground py-4">No activity recorded.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
