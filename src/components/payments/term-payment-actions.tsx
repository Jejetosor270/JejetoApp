"use client";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  props: (
    | {
        supplier: PaymentInstallmentView;
      }
    | { document: ClientBillingView; termId: string; remaining: string }
  ) & { canPay?: boolean; children?: ReactNode },
) {
  const canPay = props.canPay ?? true;
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
      {canPay && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={markPaid}
        >
          {pending ? "Recording…" : "Mark paid"}
        </Button>
      )}
      <details
        className="group/term-actions self-start"
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            !(event.target instanceof Node) ||
            !event.currentTarget.contains(event.target)
          )
            return;
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }}
      >
        <summary className="focus-visible:ring-ring/50 hover:bg-accent flex h-8 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          More actions
          <ChevronDown
            aria-hidden="true"
            className="size-3 group-open/term-actions:rotate-180"
          />
        </summary>
        <div className="bg-muted/40 mt-1 flex flex-wrap items-center gap-2 rounded-md border p-2">
          {canPay && (
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
          )}
          {props.children}
        </div>
      </details>
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
                  name="paymentDate"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Actual FX (foreign currency)">
                <input
                  name="paymentFx"
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
