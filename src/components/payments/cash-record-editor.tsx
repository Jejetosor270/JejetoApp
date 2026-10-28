import "server-only";
import { getDatabase } from "@/lib/db";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { BillingTermActions } from "@/components/billing/billing-term-actions";
import { BillingReceiptEditor } from "@/components/billing/billing-receipt-editor";
import { SupplierRecordEditor } from "./supplier-record-editor";
import { SupplierTermActions } from "./supplier-term-actions";
import { getPaymentTermEditorData } from "@/lib/payments/term-editor";
import type { CashRecordKind } from "@/lib/related-records/types";

export async function cashRecordEditor(kind: CashRecordKind, id: string) {
  await requireMasterDataEditor();
  if (kind === "supplier-installment" || kind === "client-installment") {
    const data = await getPaymentTermEditorData(
      kind === "supplier-installment" ? "supplier" : "client",
      id,
    );
    if (!data) return null;
    return data.kind === "supplier" ? (
      <SupplierTermActions
        installment={data.installment}
        baseAmount={data.baseAmount}
        currencies={data.currencies}
        canPay={data.canPay}
      />
    ) : (
      <BillingTermActions document={data.document} term={data.term} />
    );
  }
  const db = getDatabase();
  if (kind === "receipt") {
    const source = await db.clientReceipt.findUnique({
      where: { id },
      select: { billingDocumentId: true },
    });
    if (!source?.billingDocumentId) return null;
    const billing = await getClientBillingDocument(source.billingDocumentId);
    if (!billing) return null;
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
  const source = await db.paymentSettlement
    .findUnique({
      where: { id },
      select: { installment: { select: { orderId: true } } },
    })
    .then((row) => row?.installment);
  if (!source?.orderId) return null;
  const [summary, currencies] = await Promise.all([
    getOrderPaymentSummary(source.orderId),
    db.currency.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  for (const schedule of [summary.supplier, summary.client]) {
    const installment = schedule.installments.find((row) =>
      row.settlements.some((payment) => payment.id === id),
    );
    if (installment)
      return (
        <SupplierRecordEditor
          installment={installment}
          settlement={installment.settlements.find((row) => row.id === id)}
          baseAmount={schedule.baseAmount}
          currencies={currencies}
        />
      );
  }
  return null;
}
