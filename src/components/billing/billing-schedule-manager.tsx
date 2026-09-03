"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  createClientBillingInstallmentAction,
  recordClientReceiptAction,
} from "@/app/(app)/billing/actions";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

const initialState: BillingActionState = { message: "", status: "idle" };

export function BillingScheduleManager({
  canEdit,
  document,
}: {
  canEdit: boolean;
  document: ClientBillingView;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"FIXED_AMOUNT" | "PERCENTAGE">(
    "FIXED_AMOUNT",
  );
  const [dueDate, setDueDate] = useState(document.dueDate ?? "");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [percentage, setPercentage] = useState("");
  const create = usePersistentActionState(
    createClientBillingInstallmentAction,
    initialState,
  );
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const receipt = usePersistentActionState(
    recordClientReceiptAction,
    initialState,
  );
  const scheduled = document.paymentInstallments
    .filter((installment) => !installment.isCancelled)
    .reduce(
      (total, installment) => total.plus(installment.scheduledAmount),
      new Decimal(0),
    );
  const remaining = Decimal.max(
    new Decimal(document.totalTtc).minus(scheduled),
    0,
  );
  const ownedInstallments = document.paymentInstallments.filter(
    (installment) => installment.billingDocumentId === document.id,
  );

  useEffect(() => {
    if (create.state.status !== "success") return;
    router.refresh();
  }, [create.state.status, router]);
  useEffect(() => {
    if (receipt.state.status !== "success") return;
    router.refresh();
  }, [receipt.state.status, router]);

  return (
    <div className="space-y-4">
      <div className="bg-muted/25 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
        <p>
          Document TTC
          <br />
          <strong className="financial-figure">
            {formatMoney(document.totalTtc, document.currencyCode)}
          </strong>
        </p>
        <p>
          Scheduled
          <br />
          <strong className="financial-figure">
            {formatMoney(scheduled.toString(), document.currencyCode)}
          </strong>
        </p>
        <p>
          Unscheduled remainder
          <br />
          <strong className="financial-figure">
            {formatMoney(remaining.toString(), document.currencyCode)}
          </strong>
        </p>
      </div>

      {canEdit && !document.matchedInstallmentId ? (
        <form
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={create.onSubmit}
        >
          <input name="basis" type="hidden" value={basis} />
          <input name="billingDocumentId" type="hidden" value={document.id} />
          <Field error={create.state.fieldErrors?.label} label="Label" required>
            <input
              className={inputClassName}
              name="label"
              onChange={(event) => setLabel(event.target.value)}
              required
              value={label}
            />
          </Field>
          <Field
            error={create.state.fieldErrors?.dueDate}
            label="Due date"
            required
          >
            <input
              className={inputClassName}
              name="dueDate"
              onChange={(event) => setDueDate(event.target.value)}
              required
              type="date"
              value={dueDate}
            />
          </Field>
          <Field
            error={create.state.fieldErrors?.percentageRate}
            label="Installment %"
            required
          >
            <PercentageInput
              className={inputClassName}
              name="percentageRate"
              onValueChange={(value) => {
                setPercentage(value);
                setBasis("PERCENTAGE");
                setAmount(
                  amountFromPercentage(document.totalTtc, value) ?? amount,
                );
              }}
              required
              value={percentage}
            />
          </Field>
          <Field
            error={create.state.fieldErrors?.scheduledAmount}
            label="Scheduled amount"
            required
          >
            <MoneyInput
              name="scheduledAmount"
              onValueChange={(value) => {
                setAmount(value);
                setBasis("FIXED_AMOUNT");
                setPercentage(
                  percentageFromAmount(document.totalTtc, value) ?? percentage,
                );
              }}
              required
              value={amount}
            />
          </Field>
          <Field error={create.state.fieldErrors?.notes} label="Notes">
            <input
              className={inputClassName}
              name="notes"
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <SubmitButton pending={create.pending}>
              Add installment
            </SubmitButton>
            <Button
              disabled={remaining.isZero() || create.pending}
              onClick={() => {
                setAmount(remaining.toFixed(4));
                setPercentage(
                  percentageFromAmount(
                    document.totalTtc,
                    remaining.toString(),
                  ) ?? "",
                );
                setBasis("FIXED_AMOUNT");
                setLabel("Remaining balance");
              }}
              type="button"
              variant="outline"
            >
              Add remaining installment
            </Button>
          </div>
          <ActionFeedback state={create.state} />
        </form>
      ) : null}

      {canEdit ? (
        <form
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={receipt.onSubmit}
        >
          <input name="billingDocumentId" type="hidden" value={document.id} />
          <Field
            error={receipt.state.fieldErrors?.amount}
            label={`Receipt amount (${document.currencyCode})`}
            required
          >
            <MoneyInput
              name="amount"
              onValueChange={setReceiptAmount}
              required
              value={receiptAmount}
            />
          </Field>
          <Field
            error={receipt.state.fieldErrors?.receivedAt}
            label="Actual receipt date"
            required
          >
            <input
              className={inputClassName}
              name="receivedAt"
              onChange={(event) => setReceivedAt(event.target.value)}
              required
              type="date"
              value={receivedAt}
            />
          </Field>
          <Field
            error={receipt.state.fieldErrors?.installmentId}
            label="Installment attribution"
          >
            <select
              className={inputClassName}
              name="installmentId"
              onChange={(event) => setInstallmentId(event.target.value)}
              value={installmentId}
            >
              <option value="">Billing level (no installment)</option>
              {ownedInstallments.map((installment) => (
                <option key={installment.id} value={installment.id}>
                  {installment.label} ·{" "}
                  {formatMoney(
                    installment.scheduledAmount,
                    installment.currencyCode,
                  )}
                </option>
              ))}
            </select>
          </Field>
          <Field error={receipt.state.fieldErrors?.reference} label="Reference">
            <input
              className={inputClassName}
              name="reference"
              onChange={(event) => setReference(event.target.value)}
              value={reference}
            />
          </Field>
          <Field
            error={receipt.state.fieldErrors?.fxRate}
            label="Actual FX rate"
          >
            <input
              className={inputClassName}
              inputMode="decimal"
              name="fxRate"
              onChange={(event) => setFxRate(event.target.value)}
              value={fxRate}
            />
          </Field>
          <Field error={receipt.state.fieldErrors?.notes} label="Notes">
            <input
              className={inputClassName}
              name="notes"
              onChange={(event) => setReceiptNotes(event.target.value)}
              value={receiptNotes}
            />
          </Field>
          <div className="flex items-end gap-3 lg:col-span-3">
            <SubmitButton pending={receipt.pending}>
              Record receipt
            </SubmitButton>
            <ActionFeedback state={receipt.state} />
          </div>
        </form>
      ) : null}

      {document.receipts.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2">Receipt date</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Attribution</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {document.receipts.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    {formatDateOnly(item.receivedAt)}
                  </td>
                  <td className="px-3 py-2">{item.reference ?? "—"}</td>
                  <td className="px-3 py-2">
                    {ownedInstallments.find(
                      (installment) => installment.id === item.installmentId,
                    )?.label ?? "Billing level"}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.amount, document.currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
