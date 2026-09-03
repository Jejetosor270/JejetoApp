"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteClientReceiptAction,
  updateClientReceiptAction,
} from "@/app/(app)/billing/actions";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  Field,
  inputClassName,
  MoneyInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatFxRate, formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

type Receipt = ClientBillingView["receipts"][number];
type Installment = ClientBillingView["paymentInstallments"][number];

interface ReceiptDraft {
  amount: string;
  fxRate: string;
  installmentId: string;
  notes: string;
  receivedAt: string;
  reference: string;
}

const initialActionState: BillingActionState = {
  message: "",
  status: "idle",
};

function receiptDraft(receipt: Receipt): ReceiptDraft {
  return {
    amount: receipt.amount,
    fxRate: receipt.fxRate ?? "",
    installmentId: receipt.installmentId ?? "",
    notes: receipt.notes ?? "",
    receivedAt: receipt.receivedAt,
    reference: receipt.reference ?? "",
  };
}

export function BillingReceiptEditor({
  billingDocumentId,
  canEdit,
  currencyCode,
  installments,
  receipt,
  reportingCurrencyCode,
}: {
  billingDocumentId: string;
  canEdit: boolean;
  currencyCode: string;
  installments: Installment[];
  receipt: Receipt;
  reportingCurrencyCode: string;
}) {
  const router = useRouter();
  const [deleting, startDeleting] = useTransition();
  const [deleteMessage, setDeleteMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(() => receiptDraft(receipt));
  const [draft, setDraft] = useState(() => receiptDraft(receipt));
  const submittedDraft = useRef(draft);
  const { onSubmit, pending, state } = usePersistentActionState(
    updateClientReceiptAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    const values = state.values;
    const submitted = submittedDraft.current;
    const next: ReceiptDraft = {
      amount: values?.amount ?? submitted.amount,
      fxRate: values?.fxRate ?? submitted.fxRate,
      installmentId: values?.installmentId ?? submitted.installmentId,
      notes: values?.notes ?? submitted.notes,
      receivedAt: values?.receivedAt ?? submitted.receivedAt,
      reference: values?.reference ?? submitted.reference,
    };
    setSaved(next);
    setDraft(next);
    setEditing(false);
    router.refresh();
  }, [router, state]);

  const installmentLabel =
    installments.find((item) => item.id === saved.installmentId)?.label ??
    "Billing level";
  const fieldErrors = state.fieldErrors ?? {};
  const needsFx = currencyCode !== reportingCurrencyCode;

  return (
    <article className="rounded-md border p-3 text-sm">
      {editing ? (
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            submittedDraft.current = draft;
            onSubmit(event);
          }}
        >
          <input
            name="billingDocumentId"
            type="hidden"
            value={billingDocumentId}
          />
          <input name="id" type="hidden" value={receipt.id} />
          <Field error={fieldErrors.receivedAt} label="Receipt date" required>
            <input
              className={inputClassName}
              name="receivedAt"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  receivedAt: event.target.value,
                }))
              }
              required
              type="date"
              value={draft.receivedAt}
            />
          </Field>
          <Field
            error={fieldErrors.amount}
            label={`Amount (${currencyCode})`}
            required
          >
            <MoneyInput
              name="amount"
              onValueChange={(amount) =>
                setDraft((current) => ({ ...current, amount }))
              }
              required
              value={draft.amount}
            />
          </Field>
          <Field
            error={fieldErrors.installmentId}
            label="Apply to installment (optional)"
          >
            <select
              className={inputClassName}
              name="installmentId"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  installmentId: event.target.value,
                }))
              }
              value={draft.installmentId}
            >
              <option value="">Billing level</option>
              {installments.map((installment) => (
                <option key={installment.id} value={installment.id}>
                  {installment.label}
                </option>
              ))}
            </select>
          </Field>
          <Field error={fieldErrors.reference} label="Reference">
            <input
              className={inputClassName}
              name="reference"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  reference: event.target.value,
                }))
              }
              value={draft.reference}
            />
          </Field>
          {needsFx ? (
            <Field
              error={fieldErrors.fxRate}
              label={`FX: 1 ${currencyCode} in ${reportingCurrencyCode}`}
              required
            >
              <input
                className={inputClassName}
                inputMode="decimal"
                name="fxRate"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    fxRate: event.target.value,
                  }))
                }
                required
                value={draft.fxRate}
              />
            </Field>
          ) : (
            <input name="fxRate" type="hidden" value="" />
          )}
          <Field error={fieldErrors.notes} label="Notes">
            <input
              className={inputClassName}
              name="notes"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              value={draft.notes}
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <SubmitButton pending={pending}>Save receipt</SubmitButton>
            <Button
              disabled={pending}
              onClick={() => {
                setDraft(saved);
                setEditing(false);
              }}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
          {state.status === "error" ? (
            <p
              className="text-destructive text-xs sm:col-span-2 lg:col-span-3"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {formatDateOnly(saved.receivedAt)} ·{" "}
              {saved.reference || "Receipt"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {installmentLabel}
              {saved.fxRate ? ` · FX ${formatFxRate(saved.fxRate)}` : ""}
            </p>
            {saved.notes ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {saved.notes}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="financial-figure font-medium">
              {formatMoney(saved.amount, currencyCode)}
            </p>
            {canEdit ? (
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  onClick={() => {
                    setDeleteMessage("");
                    setDraft(saved);
                    setEditing(true);
                  }}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  Edit
                </Button>
                <Button
                  disabled={deleting}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Remove this receipt? This will update Billing outstanding and cash reporting.",
                      )
                    )
                      return;
                    const data = new FormData();
                    data.set("billingDocumentId", billingDocumentId);
                    data.set("id", receipt.id);
                    startDeleting(async () => {
                      const result = await deleteClientReceiptAction(data);
                      setDeleteMessage(
                        result.status === "success" ? "" : result.message,
                      );
                      if (result.status === "success") router.refresh();
                    });
                  }}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
          {deleteMessage ? (
            <p className="text-destructive w-full text-xs" role="alert">
              {deleteMessage}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}
