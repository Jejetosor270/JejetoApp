"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";
import { InstallmentForm, SettlementForm } from "./payment-forms";
import type {
  PaymentInstallmentView,
  PaymentSettlementView,
} from "@/lib/payments/payments";

export function SupplierRecordEditor({
  installment,
  settlement,
  baseAmount,
  currencies,
}: {
  installment: PaymentInstallmentView;
  settlement?: PaymentSettlementView | undefined;
  baseAmount: string;
  currencies: { code: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const saved = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <EditorDrawer
          open
          onOpenChange={setOpen}
          title={settlement ? "Edit payment" : "Edit installment"}
        >
          {settlement ? (
            <SettlementForm
              installment={installment}
              settlement={settlement}
              today={settlement.settledAt}
              onSaved={saved}
            />
          ) : (
            <InstallmentForm
              baseAmount={baseAmount}
              currencies={currencies}
              defaultCurrencyCode={installment.currencyCode}
              direction={installment.direction}
              installment={installment}
              orderId={installment.orderId}
              reportingCurrencyCode={installment.reportingCurrencyCode}
              onSaved={saved}
            />
          )}
        </EditorDrawer>
      )}
    </>
  );
}
