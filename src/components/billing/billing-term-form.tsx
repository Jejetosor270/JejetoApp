"use client";

import {
  createClientBillingInstallmentAction,
  updateClientBillingInstallmentAction,
} from "@/app/(app)/billing/actions";
import { InstallmentForm } from "@/components/payments/payment-forms";
import type { ClientBillingView } from "@/lib/billing/billing";

/** Creation and editing share fields, draft protection and the same percentage units. */
export function BillingTermForm({
  document,
  installment,
  onSaved,
}: {
  document: Pick<ClientBillingView, "id" | "totalTtc" | "currencyCode"> & {
    project: Pick<ClientBillingView["project"], "reportingCurrencyCode">;
  };
  installment?: ClientBillingView["paymentInstallments"][number];
  onSaved?: () => void;
}) {
  return (
    <InstallmentForm
      action={async (_, values) => {
        values.set(
          "billingDocumentId",
          installment?.billingDocumentId ?? document.id,
        );
        values.set(
          "scheduledAmount",
          String(values.get("amountDisplay") ?? ""),
        );
        // Both Billing action schemas accept human percentages (e.g. 30), not fractions.
        const action = installment
          ? updateClientBillingInstallmentAction
          : createClientBillingInstallmentAction;
        return action({ status: "idle", message: "" }, values);
      }}
      baseAmount={installment?.billingTotalTtc ?? document.totalTtc}
      currencies={[{ code: document.currencyCode }]}
      defaultCurrencyCode={document.currencyCode}
      direction="CLIENT_RECEIPT"
      {...(installment ? { installment } : {})}
      orderId=""
      reportingCurrencyCode={document.project.reportingCurrencyCode}
      hideExpectedFx
      {...(onSaved ? { onSaved } : {})}
    />
  );
}
