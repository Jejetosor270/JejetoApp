import "server-only";

import { getDatabase } from "@/lib/db";
import {
  getClientBillingDocument,
  type ClientBillingView,
} from "@/lib/billing/billing";
import {
  getOrderPaymentSummary,
  type PaymentInstallmentView,
} from "@/lib/payments/payments";

export type PaymentTermEditorData =
  | {
      kind: "supplier";
      installment: PaymentInstallmentView;
      baseAmount: string;
      currencies: { code: string }[];
      canPay: boolean;
    }
  | {
      kind: "client";
      document: ClientBillingView;
      term: ClientBillingView["paymentInstallments"][number];
    };

/** Called after editor authorization; reuses the authoritative record views. */
export async function getPaymentTermEditorData(
  kind: "supplier" | "client",
  id: string,
): Promise<PaymentTermEditorData | null> {
  const db = getDatabase();
  if (kind === "client") {
    const source = await db.clientPaymentInstallment.findUnique({
      where: { id },
      select: { billingDocumentId: true },
    });
    if (!source?.billingDocumentId) return null;
    const document = await getClientBillingDocument(source.billingDocumentId);
    const term = document?.paymentInstallments.find((row) => row.id === id);
    return document && term ? { kind, document, term } : null;
  }

  const source = await db.paymentInstallment.findUnique({
    where: { id },
    select: { orderId: true, order: { select: { status: true } } },
  });
  if (!source?.orderId || !source.order) return null;
  const [summary, currencies] = await Promise.all([
    getOrderPaymentSummary(source.orderId),
    db.currency.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  for (const schedule of [summary.supplier, summary.client]) {
    const installment = schedule.installments.find((row) => row.id === id);
    if (installment)
      return {
        kind,
        installment,
        baseAmount: schedule.baseAmount,
        currencies,
        canPay:
          source.order.status !== "CANCELLED" &&
          installment.direction === "SUPPLIER_PAYMENT",
      };
  }
  return null;
}
