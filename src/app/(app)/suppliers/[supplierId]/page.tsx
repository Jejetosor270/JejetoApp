import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SupplierDetailEditor } from "@/app/(app)/suppliers/supplier-management";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import { formatTimestamp } from "@/domain/payments/dates";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getSupplier } from "@/lib/master-data/suppliers";
import { listActiveCurrencies } from "@/lib/master-data/lookups";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  if (!z.uuid().safeParse(supplierId).success) notFound();
  const [user, supplier, currencies, activity] = await Promise.all([
    requireUser(),
    getSupplier(supplierId),
    listActiveCurrencies(),
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
      <nav aria-label="Supplier work" className="flex flex-wrap gap-2">
        <Link
          id="orders"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          href={"/orders?supplierId=" + supplierId}
        >
          Orders
        </Link>
        <Link
          id="payments"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          href={"/payments?tab=supplier&supplierId=" + supplierId}
        >
          Payments
        </Link>
      </nav>
      <div className="space-y-6">
        <SupplierDetailEditor
          canEdit={canEditMasterData(user.role)}
          currencies={currencies}
          supplier={supplier}
        />
        <details className="border-t pt-4">
          <summary className="text-sm font-semibold">Recent activity</summary>
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
              <p className="text-muted-foreground py-4">
                No activity recorded.
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}
