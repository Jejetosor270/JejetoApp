"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";
import { SettlementForm } from "./payment-forms";
import { ClientReceiptCreateForm } from "./related-cash-create";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import type { ClientBillingView } from "@/lib/billing/billing";
import { businessToday } from "@/domain/payments/dates";

export function TermPaymentActions(
  props:
    | {
        supplier: PaymentInstallmentView;
      }
    | { document: ClientBillingView; termId: string; remaining: string },
) {
  const [mode, setMode] = useState<"paid" | "partial" | null>(null);
  const router = useRouter();
  const saved = useCallback(() => {
    setMode(null);
    router.refresh();
  }, [router]);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setMode("paid")}>
        Mark paid
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("partial")}>
        Record partial payment
      </Button>
      {mode && (
        <EditorDrawer
          open
          title={mode === "paid" ? "Mark paid" : "Record partial payment"}
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
        >
          <p className="mb-4 text-sm">
            Confirm the actual amount and payment date. Status and reporting
            update when saved.
          </p>
          {"supplier" in props ? (
            <SettlementForm
              installment={props.supplier}
              today={businessToday()}
              initialAmount={
                mode === "partial" ? "" : props.supplier.outstandingAmount
              }
              onSaved={saved}
            />
          ) : (
            <ClientReceiptCreateForm
              document={props.document}
              termId={props.termId}
              initialAmount={mode === "paid" ? props.remaining : ""}
              onSaved={saved}
            />
          )}
        </EditorDrawer>
      )}
    </div>
  );
}
