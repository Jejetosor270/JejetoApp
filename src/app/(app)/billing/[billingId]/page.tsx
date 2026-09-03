import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { BillingDetail } from "@/components/billing/billing-detail";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import {
  getClientBillingDocument,
  listClientBillingOptions,
} from "@/lib/billing/billing";
import { listProjectOrders } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Client Billing Event" };

export default async function BillingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ billingId: string }>;
  searchParams: Promise<{ edit?: string | string[] | undefined }>;
}) {
  const [{ billingId }, query, user, options] = await Promise.all([
    params,
    searchParams,
    requireUser(),
    listClientBillingOptions(),
  ]);
  if (!z.uuid().safeParse(billingId).success) notFound();
  const document = await getClientBillingDocument(billingId);
  if (!document) notFound();
  const orders = await listProjectOrders(document.projectId);
  return (
    <BillingDetail
      canEdit={canEditMasterData(user.role)}
      document={document}
      options={options}
      orderFinancials={orders.map((order) => ({
        actualMarkupRate: order.billing.actualMarkupRate,
        id: order.id,
        plannedSell: order.costs.reportingSellingRevenue,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      }))}
      startEditing={query.edit === "1"}
    />
  );
}
