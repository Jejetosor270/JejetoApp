"use client";
import { useCallback, useState, useTransition } from "react";
import { payTermRemainingAction } from "@/app/(app)/payments/term-paid-actions";
import { useRouter } from "next/navigation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { Field, inputClassName } from "@/components/master-data/form-ui";
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
  const [date, setDate] = useState(businessToday());
  const [fxRate, setFxRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const saved = useCallback(() => {
    setMode(null);
    router.refresh();
  }, [router]);
  const markPaid = () =>
    startTransition(async () => {
      try {
        const result = await payTermRemainingAction(
          "supplier" in props
            ? { kind: "supplier", id: props.supplier.id, date, fxRate }
            : {
                kind: "client",
                id: props.termId,
                documentId: props.document.id,
                date,
                fxRate,
              },
        );
        setError(result.error);
        if (result.error) setMode("paid");
        else saved();
      } catch {
        setError(
          "Payment could not be recorded. Check its current balance before retrying.",
        );
        setMode("paid");
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={markPaid}>
        {pending ? "Recording…" : "Mark paid"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMode("partial");
        }}
      >
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
          {error && (
            <p role="alert" className="text-destructive mb-3 text-sm">
              {error}
            </p>
          )}
          <p className="mb-4 text-sm">
            Confirm the actual amount and payment date. Status and reporting
            update when saved.
          </p>
          {mode === "paid" ? (
            <div className="space-y-4">
              <p className="text-sm">
                Record the full remaining balance. For a smaller amount use
                Record partial payment.
              </p>
              <Field label="Payment date">
                <DateInput
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Actual FX (foreign currency)">
                <input
                  className={inputClassName}
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                />
              </Field>
              <Button disabled={pending} onClick={markPaid}>
                Record remaining payment
              </Button>
            </div>
          ) : "supplier" in props ? (
            <SettlementForm
              installment={props.supplier}
              today={businessToday()}
              initialAmount=""
              onSaved={saved}
            />
          ) : (
            <ClientReceiptCreateForm
              document={props.document}
              termId={props.termId}
              initialAmount=""
              onSaved={saved}
            />
          )}
        </EditorDrawer>
      )}
    </div>
  );
}
