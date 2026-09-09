import "server-only";
import { getDatabase } from "@/lib/db";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { BillingInstallmentEditor } from "@/components/billing/billing-installment-editor";
import { BillingReceiptEditor } from "@/components/billing/billing-receipt-editor";
import { SupplierRecordEditor } from "./supplier-record-editor";
import type { CashRecordKind } from "@/lib/related-records/types";

export async function cashRecordEditor(kind: CashRecordKind, id: string) {
  await requireMasterDataEditor();
  const db = getDatabase();
  if (kind === "receipt" || kind === "client-installment") {
    const source =
      kind === "receipt"
        ? await db.clientReceipt.findUnique({
            where: { id },
            select: { billingDocumentId: true },
          })
        : await db.clientPaymentInstallment.findUnique({
            where: { id },
            select: { billingDocumentId: true },
          });
    if (!source?.billingDocumentId) return null;
    const billing = await getClientBillingDocument(source.billingDocumentId);
    if (!billing) return null;
    if (kind === "receipt") {
      const receipt = billing.receipts.find((row) => row.id === id);
      return receipt ? (
        <BillingReceiptEditor
          actionOnly
          canEdit
          billingDocumentId={source.billingDocumentId}
          currencyCode={billing.currencyCode}
          reportingCurrencyCode={billing.project.reportingCurrencyCode}
          installments={billing.paymentInstallments}
          receipt={receipt}
        />
      ) : null;
    }
    const installment = billing.paymentInstallments.find(
      (row) => row.id === id,
    );
    return installment ? (
      <BillingInstallmentEditor
        actionOnly
        canEdit
        billingDocumentId={source.billingDocumentId}
        installment={installment}
      />
    ) : null;
  }
  const source =
    kind === "payment"
      ? await db.paymentSettlement
          .findUnique({
            where: { id },
            select: { installment: { select: { orderId: true } } },
          })
          .then((row) => row?.installment)
      : await db.paymentInstallment.findUnique({
          where: { id },
          select: { orderId: true },
        });
  if (!source?.orderId) return null;
  const [summary, currencies] = await Promise.all([
    getOrderPaymentSummary(source.orderId),
    db.currency.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  for (const schedule of [summary.supplier, summary.client]) {
    const installment = schedule.installments.find((row) =>
      kind === "payment"
        ? row.settlements.some((payment) => payment.id === id)
        : row.id === id,
    );
    if (installment)
      return (
        <SupplierRecordEditor
          installment={installment}
          settlement={
            kind === "payment"
              ? installment.settlements.find((row) => row.id === id)
              : undefined
          }
          baseAmount={schedule.baseAmount}
          currencies={currencies}
        />
      );
  }
  return null;
}
