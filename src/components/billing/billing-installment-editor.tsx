"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  deleteClientBillingInstallmentAction,
  updateClientBillingInstallmentAction,
} from "@/app/(app)/billing/actions";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import type { BillingActionState } from "@/domain/billing/action-state";
import { formatDateOnly } from "@/domain/payments/dates";
import { businessToday } from "@/domain/payments/dates";
import { derivePaymentStatus } from "@/domain/payments/calculations";
import {
  formatMoney,
  formatRate,
  rateToPercentInput,
} from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import type { ClientBillingView } from "@/lib/billing/billing";

type Installment = ClientBillingView["paymentInstallments"][number];

interface InstallmentDraft {
  amount: string;
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  dueDate: string;
  label: string;
  notes: string;
  percentage: string;
}

const initialActionState: BillingActionState = {
  message: "",
  status: "idle",
};

function installmentDraft(installment: Installment): InstallmentDraft {
  return {
    amount: installment.scheduledAmount,
    basis: installment.basis,
    dueDate: installment.dueDate,
    label: installment.label,
    notes: installment.notes ?? "",
    percentage: rateToPercentInput(
      installment.percentageRate ??
        percentageFromAmount(
          installment.billingTotalTtc,
          installment.scheduledAmount,
        ),
    ),
  };
}

function installmentRate(
  draft: InstallmentDraft,
  totalTtc: string,
): string | null {
  if (draft.basis === "PERCENTAGE")
    return humanPercentageToFraction(draft.percentage, {
      maximumPercent: "100",
    });
  const percentage = percentageFromAmount(totalTtc, draft.amount);
  return percentage === null
    ? null
    : new Decimal(percentage).dividedBy(100).toString();
}

export function BillingInstallmentEditor({
  billingDocumentId,
  canEdit,
  installment,
}: {
  billingDocumentId: string;
  canEdit: boolean;
  installment: Installment;
}) {
  const router = useRouter();
  const [deleting, startDeleting] = useTransition();
  const [deleteMessage, setDeleteMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(() => installmentDraft(installment));
  const [draft, setDraft] = useState(() => installmentDraft(installment));
  const submittedDraft = useRef(draft);
  const { onSubmit, pending, state } = usePersistentActionState(
    updateClientBillingInstallmentAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    const values = state.values;
    const submitted = submittedDraft.current;
    const next: InstallmentDraft = {
      amount: values?.scheduledAmount ?? submitted.amount,
      basis:
        values?.basis === "PERCENTAGE" || values?.basis === "FIXED_AMOUNT"
          ? values.basis
          : submitted.basis,
      dueDate: values?.dueDate ?? submitted.dueDate,
      label: values?.label ?? submitted.label,
      notes: values?.notes ?? submitted.notes,
      percentage: values?.percentageRate
        ? rateToPercentInput(values.percentageRate)
        : submitted.percentage,
    };
    setSaved(next);
    setDraft(next);
    setEditing(false);
    router.refresh();
  }, [router, state]);

  const received = installment.receipts.reduce(
    (total, receipt) => total.plus(receipt.amount),
    new Decimal(0),
  );
  const remaining = Decimal.max(new Decimal(saved.amount).minus(received), 0);
  const status = derivePaymentStatus({
    dueDate: saved.dueDate,
    isCancelled: installment.isCancelled,
    paidAmount: received,
    scheduledAmount: saved.amount,
    today: businessToday(),
  });
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <article className="rounded-md border p-3 text-sm">
      {editing ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            submittedDraft.current = draft;
            onSubmit(event);
          }}
        >
          <input name="basis" type="hidden" value={draft.basis} />
          <input
            name="billingDocumentId"
            type="hidden"
            value={billingDocumentId}
          />
          <input name="id" type="hidden" value={installment.id} />
          <Field error={fieldErrors.label} label="Label" required>
            <input
              className={inputClassName}
              name="label"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
              required
              value={draft.label}
            />
          </Field>
          <Field error={fieldErrors.dueDate} label="Due date" required>
            <input
              className={inputClassName}
              name="dueDate"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
              required
              type="date"
              value={draft.dueDate}
            />
          </Field>
          <Field
            error={fieldErrors.percentageRate}
            label="Installment %"
            required
          >
            <PercentageInput
              className={inputClassName}
              name="percentageRate"
              onValueChange={(percentage) => {
                setDraft((current) => ({
                  ...current,
                  amount:
                    amountFromPercentage(
                      installment.billingTotalTtc,
                      percentage,
                    ) ?? current.amount,
                  basis: "PERCENTAGE",
                  percentage,
                }));
              }}
              required
              value={draft.percentage}
            />
          </Field>
          <Field
            error={fieldErrors.scheduledAmount}
            label="Scheduled amount"
            required
          >
            <MoneyInput
              name="scheduledAmount"
              onValueChange={(amount) =>
                setDraft((current) => ({
                  ...current,
                  amount,
                  basis: "FIXED_AMOUNT",
                  percentage:
                    percentageFromAmount(installment.billingTotalTtc, amount) ??
                    current.percentage,
                }))
              }
              required
              value={draft.amount}
            />
          </Field>
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
          <div className="flex items-end gap-2 sm:col-span-2">
            <SubmitButton pending={pending}>Save installment</SubmitButton>
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
            <p className="text-destructive text-xs sm:col-span-2" role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-medium">{saved.label}</p>
              <p className="text-muted-foreground text-xs">
                Due {formatDateOnly(saved.dueDate)} ·{" "}
                {formatRate(
                  installmentRate(saved, installment.billingTotalTtc),
                )}
              </p>
              {saved.notes ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {saved.notes}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="financial-figure">
                {formatMoney(saved.amount, installment.currencyCode)}
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
                    disabled={
                      deleting ||
                      installment.billingDocumentId !== billingDocumentId
                    }
                    onClick={() => {
                      if (!window.confirm("Remove this payment installment?"))
                        return;
                      const data = new FormData();
                      data.set("billingDocumentId", billingDocumentId);
                      data.set("id", installment.id);
                      startDeleting(async () => {
                        const result =
                          await deleteClientBillingInstallmentAction(data);
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
          </div>
          <div className="mt-3 space-y-1 border-t pt-2 text-xs">
            <p className="flex justify-between gap-2 font-medium">
              <span>Received</span>
              <span className="financial-figure">
                {formatMoney(received.toString(), installment.currencyCode)}
              </span>
            </p>
            <p className="flex justify-between gap-2 border-t pt-1">
              <span>Remaining</span>
              <span className="financial-figure">
                {formatMoney(remaining.toString(), installment.currencyCode)}
              </span>
            </p>
            <p className="text-muted-foreground text-right">
              {formatEnumLabel(status)}
            </p>
            {deleteMessage ? (
              <p className="text-destructive text-right" role="alert">
                {deleteMessage}
              </p>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}
