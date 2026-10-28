"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  loadOrderTermPaymentsAction,
  markSupplierTermUnpaidAction,
} from "@/app/(app)/payments/order-term-payment-actions";
import { payTermRemainingAction } from "@/app/(app)/payments/term-paid-actions";
import type { OrderTermPayments } from "@/lib/payments/order-term-payments";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import {
  paymentAmountToRecord,
  paymentTermState,
} from "@/domain/payments/terms";
import { formatMoney } from "@/domain/procurement/presentation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";

export function OrderTermPaymentDrawer({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return open ? (
    <PaymentTermsPanel
      key={orderId}
      orderId={orderId}
      onOpenChange={onOpenChange}
    />
  ) : null;
}

function PaymentTermsPanel({
  orderId,
  onOpenChange,
}: {
  orderId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<OrderTermPayments | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [termId, setTermId] = useState("");
  const [date, setDate] = useState(businessToday());
  const [fxRate, setFxRate] = useState("");
  const [undo, setUndo] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    loadOrderTermPaymentsAction({ orderId })
      .then((result) => {
        if (!active) return;
        setData(result.data);
        setError(result.error);
        setTermId(
          result.data?.terms.length === 1
            ? (result.data.terms[0]?.id ?? "")
            : "",
        );
      })
      .catch(() => {
        if (active)
          setError("Payment terms could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, attempt]);

  const term = data?.terms.find((row) => row.id === termId);
  const state = term
    ? paymentTermState({
        amount: term.scheduledAmount,
        payments: term.settlements,
        dueDate: term.dueDate,
        cancelled: term.isCancelled,
        today: businessToday(),
      })
    : null;
  const remaining =
    term && state
      ? paymentAmountToRecord(state.remaining, term.outstandingAmount)
      : "0";
  const canPay = Boolean(
    term && !data?.cancelled && !term.isCancelled && remaining !== "0",
  );
  const canUndo = Boolean(term && !data?.cancelled && term.settlements.length);
  const submit = () => {
    if (!term || pending || (undo ? !canUndo : !canPay)) return;
    startTransition(async () => {
      try {
        const result = undo
          ? await markSupplierTermUnpaidAction({
              orderId,
              termId: term.id,
              payments: term.settlements.map((payment) => ({
                id: payment.id,
                version: payment.editVersion ?? "",
              })),
              reason,
            })
          : await payTermRemainingAction({
              kind: "supplier",
              id: term.id,
              date,
              fxRate,
            });
        setError(result.error);
        if (!result.error) {
          onOpenChange(false);
          router.refresh();
        }
      } catch {
        setError(
          "The payment could not be updated. Your selection is retained; refresh and check the balance before retrying.",
        );
      }
    });
  };

  return (
    <EditorDrawer
      open
      size="compact"
      title="Payment terms"
      description="Choose a term to record or undo a payment."
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      {loading ? <p role="status">Loading payment terms…</p> : null}
      {!loading && !data && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError(null);
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      )}
      {data && !loading && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {data.terms.length ? (
            <Field label="Payment term" required>
              <select
                className={inputClassName}
                name="termId"
                value={termId}
                required
                disabled={pending || undo}
                onChange={(event) => {
                  setTermId(event.target.value);
                  setError(null);
                  setDate(businessToday());
                  setFxRate("");
                  setReason("");
                }}
              >
                <option value="">Choose payment term</option>
                {data.terms.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} ·{" "}
                    {formatMoney(row.scheduledAmount, row.currencyCode)}
                    {row.isCancelled ? " · Cancelled" : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="space-y-2 text-sm">
              <p>No payment terms. Add a term before recording payment.</p>
              <Link
                className="text-primary underline"
                href={`/orders/${orderId}?tab=related#payments`}
              >
                Open payment terms
              </Link>
            </div>
          )}
          {term && state && (
            <>
              <div className="bg-muted/40 space-y-3 rounded-md border p-3">
                <p className="text-muted-foreground text-xs">
                  {state.label} ·{" "}
                  {term.dueDate ? formatDateOnly(term.dueDate) : "No due date"}
                </p>
                <dl className="space-y-2 text-sm">
                  {(
                    [
                      ["Amount TTC", term.scheduledAmount],
                      ["Paid TTC", state.paid],
                      ["Remaining TTC", remaining],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <dt>{label}</dt>
                      <dd className="financial-figure font-medium">
                        {formatMoney(value, term.currencyCode)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {data.cancelled && (
                <p className="text-sm">
                  This Order is cancelled. Payments cannot be changed here.
                </p>
              )}
              {undo ? (
                <>
                  <p className="text-sm">
                    Undo {term.settlements.length} recorded payment
                    {term.settlements.length === 1 ? "" : "s"} totaling{" "}
                    {formatMoney(state.paid, term.currencyCode)}? Cash paid will
                    decrease and this term’s balance will reopen. This does not
                    record a refund or cancel the term. The removed payments
                    remain recoverable in Trash.
                  </p>
                  <Field label="Reason" required>
                    <input
                      className={inputClassName}
                      name="reason"
                      value={reason}
                      required
                      maxLength={500}
                      disabled={pending}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={pending || !reason.trim()}>
                      {pending ? "Updating…" : "Confirm unpaid"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setUndo(false);
                        setError(null);
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {canPay && (
                    <>
                      <Field label="Payment date" required>
                        <DateInput
                          name="paymentDate"
                          value={date}
                          required
                          disabled={pending}
                          onChange={(event) => setDate(event.target.value)}
                        />
                      </Field>
                      {term.currencyCode !== term.reportingCurrencyCode && (
                        <Field
                          label={`FX to ${term.reportingCurrencyCode}`}
                          required
                        >
                          <input
                            className={inputClassName}
                            name="paymentFx"
                            inputMode="decimal"
                            value={fxRate}
                            required
                            disabled={pending}
                            onChange={(event) => setFxRate(event.target.value)}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {canPay && (
                      <Button type="submit" disabled={pending}>
                        {pending ? "Recording…" : "Mark as paid"}
                      </Button>
                    )}
                    {canUndo && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          setUndo(true);
                          setError(null);
                        }}
                      >
                        Mark as unpaid
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}
    </EditorDrawer>
  );
}
