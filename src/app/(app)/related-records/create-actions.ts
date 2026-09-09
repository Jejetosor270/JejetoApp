"use server";
import { z } from "zod";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { getOrder } from "@/lib/procurement/orders";

export async function loadRelatedCreation(
  scope: { kind: "project" | "order" | "billing"; id: string },
  kind: "payment" | "receipt" | "supplier-installment" | "client-installment",
  targetId?: string,
) {
  await requireMasterDataEditor();
  const parsed = z
    .object({
      scope: z.object({
        kind: z.enum(["project", "order", "billing"]),
        id: z.uuid(),
      }),
      kind: z.enum([
        "payment",
        "receipt",
        "supplier-installment",
        "client-installment",
      ]),
      targetId: z.uuid().optional(),
    })
    .safeParse({ scope, kind, targetId });
  if (!parsed.success) return { data: null, message: "Choose a valid record." };
  try {
    const db = getDatabase();
    const supplier = kind === "payment" || kind === "supplier-installment";
    const choices = supplier
      ? (scope.kind === "billing"
          ? []
          : await db.procurementOrder.findMany({
              where: {
                ...(scope.kind === "order"
                  ? { id: scope.id }
                  : { projectId: scope.id }),
                status: { not: "CANCELLED" },
              },
              select: { id: true, orderNumber: true, packageName: true },
              orderBy: [{ orderNumber: "asc" }, { id: "asc" }],
            })
        ).map((row) => ({
          id: row.id,
          label: `${row.orderNumber} · ${row.packageName}`,
        }))
      : (
          await db.clientBillingDocument.findMany({
            where: {
              ...(scope.kind === "billing"
                ? { id: scope.id }
                : scope.kind === "project"
                  ? { projectId: scope.id }
                  : { allocations: { some: { orderId: scope.id } } }),
              isCancelled: false,
              ...(kind === "receipt"
                ? { documentType: "INVOICE" as const }
                : { matchedInstallmentId: null }),
            },
            select: { id: true, reference: true, documentType: true },
            orderBy: [{ documentDate: "desc" }, { id: "asc" }],
          })
        ).map((row) => ({
          id: row.id,
          label: `${row.reference} · ${row.documentType}`,
        }));
    const selectedId =
      targetId ?? (choices.length === 1 ? choices[0]?.id : undefined);
    if (selectedId && !choices.some((row) => row.id === selectedId))
      return {
        data: null,
        message: "That document is unavailable in this Related view.",
      };
    const currencies = await db.currency.findMany({
      where: { isActive: true },
      select: { code: true },
      orderBy: { code: "asc" },
    });
    if (!selectedId)
      return { data: { choices, currencies, form: null }, message: "" };
    if (supplier) {
      const [order, summary] = await Promise.all([
        getOrder(selectedId),
        getOrderPaymentSummary(selectedId),
      ]);
      if (!order)
        return { data: null, message: "The Order is no longer available." };
      return {
        data: {
          choices,
          currencies,
          form: {
            type: "supplier" as const,
            orderId: selectedId,
            reportingCurrencyCode: order.project.reportingCurrencyCode,
            summary: summary.supplier,
          },
        },
        message: "",
      };
    }
    const document = await getClientBillingDocument(selectedId);
    return {
      data: {
        choices,
        currencies,
        form: document ? { type: "client" as const, document } : null,
      },
      message: "",
    };
  } catch {
    return {
      data: null,
      message: "The creation form could not be loaded. Please retry.",
    };
  }
}
