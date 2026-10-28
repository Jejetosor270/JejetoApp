"use client";

import { useState, useTransition } from "react";
import { loadPaymentTermEditorAction } from "@/app/(app)/payments/term-editor-actions";
import { BillingTermActions } from "@/components/billing/billing-term-actions";
import { SupplierTermActions } from "./supplier-term-actions";
import { Button } from "@/components/ui/button";
import type { PaymentTermEditorData } from "@/lib/payments/term-editor";

/** Generic lists open the same full editor as the owning record. */
export function PaymentTermEditor({
  kind,
  id,
}: {
  kind: "supplier" | "client";
  id: string;
}) {
  const [data, setData] = useState<PaymentTermEditorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = (open: boolean) => {
    if (!open) setData(null);
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await loadPaymentTermEditorAction({ kind, id });
              setData(result.data);
              setError(result.error);
            } catch {
              setError(
                "The payment term could not be loaded. Please try again.",
              );
            }
          });
        }}
      >
        {pending ? "Loading…" : "Edit"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
      {data?.kind === "supplier" && (
        <SupplierTermActions
          installment={data.installment}
          baseAmount={data.baseAmount}
          currencies={data.currencies}
          canPay={data.canPay}
          open
          onOpenChange={close}
        />
      )}
      {data?.kind === "client" && (
        <BillingTermActions
          document={data.document}
          term={data.term}
          open
          onOpenChange={close}
        />
      )}
    </>
  );
}
