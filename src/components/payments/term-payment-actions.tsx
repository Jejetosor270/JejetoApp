"use client";
import { useCallback, useState, useTransition, type ReactNode } from "react";
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
import { formatMoney } from "@/domain/procurement/presentation";

export function TermPaymentActions(
  props: (
    | { supplier: PaymentInstallmentView }
    | { document: ClientBillingView; termId: string; remaining: string }
  ) & {
    canPay?: boolean;
    children?: ReactNode;
    editor: (onSaved: () => void) => ReactNode;
    label: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  },
) {
  const canPay = props.canPay ?? true;
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = props.open ?? internalEditing;
  const [mode, setMode] = useState<"paid" | "partial" | null>(null);
  const [date, setDate] = useState(businessToday());
  const [fxRate, setFxRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const onOpenChange = props.onOpenChange;
  const setEditing = useCallback(
    (open: boolean) => {
      setInternalEditing(open);
      onOpenChange?.(open);
      if (!open) setMode(null);
    },
    [onOpenChange],
  );
  const currency =
    "supplier" in props
      ? props.supplier.currencyCode
      : props.document.currencyCode;
  const reportingCurrency =
    "supplier" in props
      ? props.supplier.reportingCurrencyCode
      : props.document.project.reportingCurrencyCode;
  const remaining =
    "supplier" in props ? props.supplier.outstandingAmount : props.remaining;
  const foreignCurrency = currency !== reportingCurrency;
  const saved = useCallback(() => {
    setMode(null);
    router.refresh();
  }, [router]);
  const termSaved = useCallback(() => {
    setEditing(false);
    router.refresh();
  }, [router, setEditing]);
  const markPaid = () => {
    if (pending || !canPay) return;
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
        if (!result.error) saved();
      } catch {
        setError(
          "Payment could not be recorded. Check its current balance before retrying.",
        );
      }
    });
  };
  return (
    <>
      {props.open === undefined && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          {canPay && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={pending}
              onClick={() => {
                setDate(businessToday());
                setFxRate("");
                setError(null);
                setMode("paid");
              }}
            >
              Mark as paid
            </Button>
          )}
        </div>
      )}
      {editing && (
        <EditorDrawer open title="Edit payment term" onOpenChange={setEditing}>
          {props.editor(termSaved)}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            {canPay && (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => setMode("partial")}
              >
                Record partial payment
              </Button>
            )}
            {props.children}
          </div>
          {mode === "partial" && (
            <EditorDrawer
              open
              title="Record partial payment"
              onOpenChange={(open) => {
                if (!open) setMode(null);
              }}
            >
              {"supplier" in props ? (
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
        </EditorDrawer>
      )}
      {mode === "paid" && (
        <EditorDrawer
          open
          size="compact"
          title="Mark as paid"
          description={props.label}
          onOpenChange={(open) => {
            if (!open && !pending) setMode(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              markPaid();
            }}
          >
            <div className="bg-muted/40 rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Remaining TTC</p>
              <p className="financial-figure mt-1 text-lg font-semibold">
                {formatMoney(remaining, currency)}
              </p>
            </div>
            <Field label="Payment date" required>
              <DateInput
                name="paymentDate"
                value={date}
                required
                disabled={pending}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            {foreignCurrency && (
              <Field label={`Actual FX to ${reportingCurrency}`} required>
                <input
                  name="paymentFx"
                  className={inputClassName}
                  inputMode="decimal"
                  value={fxRate}
                  required
                  disabled={pending}
                  onChange={(event) => setFxRate(event.target.value)}
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button disabled={pending || !canPay} type="submit">
              {pending ? "Recording…" : "Confirm payment"}
            </Button>
          </form>
        </EditorDrawer>
      )}
    </>
  );
}
