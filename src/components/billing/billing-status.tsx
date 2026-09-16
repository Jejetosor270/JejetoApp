"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { billingStatuses } from "@/domain/billing/status";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { formatMoney } from "@/domain/procurement/presentation";
import { changeBillingStatusAction } from "@/app/(app)/billing/status-actions";
import { Button } from "@/components/ui/button";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import {
  Field,
  MoneyInput,
  inputClassName,
} from "@/components/master-data/form-ui";
import { businessToday } from "@/domain/payments/dates";

function StatusOptions({
  documentType,
  creation = false,
}: {
  documentType: string;
  creation?: boolean;
}) {
  return billingStatuses
    .filter(
      (s) =>
        s !== "OVERDUE" &&
        (!creation || s !== "PARTIALLY_PAID") &&
        (documentType !== "QUOTE" ||
          ["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(s)),
    )
    .map((status) => (
      <option key={status} value={status}>
        {formatEnumLabel(status)}
      </option>
    ));
}

export function BillingCreationStatus({
  documentType,
}: {
  documentType: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Billing status">
        <select
          required
          name="workflowStatus"
          className={inputClassName}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Choose status</option>
          <StatusOptions documentType={documentType} creation />
        </select>
      </Field>
      {status === "PAID" && (
        <>
          <p className="text-muted-foreground text-xs">
            Saving records the full TTC amount as received against the payment
            terms. Confirm the actual payment date and, for foreign currency,
            its exchange rate.
          </p>
          <Field label="Actual payment date">
            <DateInput
              name="paymentDate"
              defaultValue={businessToday()}
              required
            />
          </Field>
          <Field label="Actual payment FX (foreign currency)">
            <input
              name="paymentFx"
              className={inputClassName}
              inputMode="decimal"
            />
          </Field>
        </>
      )}
    </div>
  );
}

export function BillingStatusControl({
  id,
  status,
  documentType,
  remaining,
  currency,
  canEdit,
}: {
  id: string;
  status: string;
  documentType: string;
  remaining: string;
  currency: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(status);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const save = (value: string, fields = new FormData()) =>
    startTransition(async () => {
      try {
        const result = await changeBillingStatusAction({
          id,
          value,
          confirmedAmount: remaining,
          amount: String(fields.get("amount") ?? ""),
          paymentDate: String(fields.get("paymentDate") || businessToday()),
          paymentFx: String(fields.get("paymentFx") ?? ""),
        });
        setFeedback(result.message);
        if (result.status === "success") {
          setOpen(false);
          router.refresh();
        } else {
          setDraft(value);
          setOpen(true);
        }
      } catch {
        setFeedback("Could not save. Your selection is retained.");
      }
    });
  if (!canEdit) return <span>{formatEnumLabel(status)}</span>;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setDraft(status === "OVERDUE" ? "INVOICED" : status);
          setFeedback("");
          setOpen(true);
        }}
        aria-label="Change Billing status"
      >
        {formatEnumLabel(status)}
      </Button>
      {documentType === "INVOICE" &&
        !["PAID", "CANCELLED"].includes(status) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => save("PAID")}
          >
            Mark as paid
          </Button>
        )}
      <EditorDrawer
        open={open}
        title="Billing status"
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            startTransition(async () => {
              try {
                const result = await changeBillingStatusAction({
                  id,
                  value: draft,
                  confirmedAmount: remaining,
                  paymentDate: String(fields.get("paymentDate") ?? ""),
                  paymentFx: String(fields.get("paymentFx") ?? ""),
                  amount: String(fields.get("amount") ?? ""),
                });
                setFeedback(result.message);
                if (result.status === "success") {
                  setOpen(false);
                  router.refresh();
                }
              } catch {
                setFeedback("Could not save. Your selection is retained.");
              }
            });
          }}
        >
          <Field label="Status">
            <select
              name="billingStatus"
              aria-label="Billing status"
              className={inputClassName}
              disabled={pending}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value === "PAID") save("PAID");
              }}
            >
              <StatusOptions documentType={documentType} />
            </select>
          </Field>
          {draft === "PARTIALLY_PAID" && (
            <Field label={`Actual received TTC (${currency})`}>
              <MoneyInput name="amount" required />
            </Field>
          )}
          {(draft === "PAID" || draft === "PARTIALLY_PAID") && (
            <>
              <p className="text-sm">
                Remaining to receive: {formatMoney(remaining, currency)}. This
                records actual cash and settles the open payment terms.
              </p>
              <Field label="Actual payment date">
                <DateInput
                  name="paymentDate"
                  defaultValue={businessToday()}
                  required
                />
              </Field>
              <Field label="Actual payment FX (foreign currency)">
                <input
                  name="paymentFx"
                  className={inputClassName}
                  inputMode="decimal"
                />
              </Field>
            </>
          )}
          {draft === "CANCELLED" && (
            <p className="text-sm">
              Cancellation removes this document from commercial reporting and
              forecasts. Documents with recorded receipts must have those
              payments corrected first.
            </p>
          )}
          {feedback && (
            <p role="alert" className="text-sm">
              {feedback}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            Confirm status
          </Button>
        </form>
      </EditorDrawer>
    </>
  );
}
