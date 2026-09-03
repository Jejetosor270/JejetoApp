"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createClientBillingInstallmentAction,
  recordClientReceiptAction,
} from "@/app/(app)/billing/actions";
import { BillingInstallmentEditor } from "@/components/billing/billing-installment-editor";
import { BillingReceiptEditor } from "@/components/billing/billing-receipt-editor";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

const initialState: BillingActionState = { message: "", status: "idle" };

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="financial-figure mt-1 font-semibold">{value}</dd>
    </div>
  );
}

export function BillingScheduleManager({
  canEdit,
  document,
}: {
  canEdit: boolean;
  document: ClientBillingView;
}) {
  const router = useRouter();
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"FIXED_AMOUNT" | "PERCENTAGE">(
    "FIXED_AMOUNT",
  );
  const [dueDate, setDueDate] = useState(document.dueDate ?? "");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [percentage, setPercentage] = useState("");
  const [createState, setCreateState] =
    useState<BillingActionState>(initialState);
  const [createPending, startCreate] = useTransition();
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [receiptState, setReceiptState] =
    useState<BillingActionState>(initialState);
  const [receiptPending, startReceipt] = useTransition();
  const activeInstallments = document.paymentInstallments.filter(
    (installment) => !installment.isCancelled,
  );
  const scheduled = activeInstallments.reduce(
    (total, installment) => total.plus(installment.scheduledAmount),
    new Decimal(0),
  );
  const remaining = Decimal.max(
    new Decimal(document.totalTtc).minus(scheduled),
    0,
  );
  const ownedInstallments = activeInstallments.filter(
    (installment) => installment.billingDocumentId === document.id,
  );
  const nextDue = activeInstallments
    .filter((installment) => {
      const received = installment.receipts.reduce(
        (total, item) => total.plus(item.amount),
        new Decimal(0),
      );
      return received.lessThan(installment.scheduledAmount);
    })
    .toSorted((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const needsFx =
    document.currencyCode !== document.project.reportingCurrencyCode;

  return (
    <section className="bg-card rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Payment Schedule & Receipts</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Planned Client cash dates and authoritative actual receipts.
        </p>
      </div>

      <dl className="bg-muted/20 mt-4 grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        <SummaryValue
          label="Document TTC"
          value={formatMoney(document.totalTtc, document.currencyCode)}
        />
        <SummaryValue
          label="Scheduled TTC"
          value={formatMoney(scheduled.toString(), document.currencyCode)}
        />
        <SummaryValue
          label="Received TTC"
          value={formatMoney(document.paid, document.currencyCode)}
        />
        <SummaryValue
          label="Outstanding TTC"
          value={formatMoney(document.outstanding, document.currencyCode)}
        />
        <SummaryValue
          label="Next due"
          value={nextDue ? formatDateOnly(nextDue.dueDate) : "—"}
        />
      </dl>

      <div className="mt-5 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Installments</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Scheduled TTC:{" "}
              {formatMoney(scheduled.toString(), document.currencyCode)} ·
              Unscheduled:{" "}
              {formatMoney(remaining.toString(), document.currencyCode)}
            </p>
          </div>
          {canEdit && !document.matchedInstallmentId ? (
            <Button
              onClick={() => {
                setCreateState(initialState);
                setShowInstallmentForm((current) => !current);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {showInstallmentForm ? "Close" : "Add installment"}
            </Button>
          ) : null}
        </div>

        {showInstallmentForm && canEdit && !document.matchedInstallmentId ? (
          <form
            className="mt-3 grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startCreate(async () => {
                const result = await createClientBillingInstallmentAction(
                  initialState,
                  formData,
                );
                setCreateState(result);
                if (result.status !== "success") return;
                setShowInstallmentForm(false);
                setAmount("");
                setBasis("FIXED_AMOUNT");
                setLabel("");
                setNotes("");
                setPercentage("");
                router.refresh();
              });
            }}
          >
            <input name="basis" type="hidden" value={basis} />
            <input name="billingDocumentId" type="hidden" value={document.id} />
            <Field
              error={createState.fieldErrors?.label}
              label="Label"
              required
            >
              <input
                className={inputClassName}
                name="label"
                onChange={(event) => setLabel(event.target.value)}
                required
                value={label}
              />
            </Field>
            <Field
              error={createState.fieldErrors?.dueDate}
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
              error={createState.fieldErrors?.percentageRate}
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
              error={createState.fieldErrors?.scheduledAmount}
              label={`Scheduled TTC (${document.currencyCode})`}
              required
            >
              <MoneyInput
                name="scheduledAmount"
                onValueChange={(value) => {
                  setAmount(value);
                  setBasis("FIXED_AMOUNT");
                  setPercentage(
                    percentageFromAmount(document.totalTtc, value) ??
                      percentage,
                  );
                }}
                required
                value={amount}
              />
            </Field>
            <Field error={createState.fieldErrors?.notes} label="Notes">
              <input
                className={inputClassName}
                name="notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <SubmitButton pending={createPending}>
                Save installment
              </SubmitButton>
              <Button
                disabled={remaining.isZero() || createPending}
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
                variant="ghost"
              >
                Use remaining
              </Button>
            </div>
            <ActionFeedback state={createState} />
          </form>
        ) : null}

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {document.paymentInstallments.map((installment) => (
            <BillingInstallmentEditor
              billingDocumentId={document.id}
              canEdit={canEdit}
              installment={installment}
              key={installment.id}
            />
          ))}
          {document.paymentInstallments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payment schedule is attached.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Receipts</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Actual Client cash received against this Billing Event.
            </p>
          </div>
          {canEdit ? (
            <Button
              onClick={() => {
                setReceiptState(initialState);
                setShowReceiptForm((current) => !current);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {showReceiptForm ? "Close" : "Record receipt"}
            </Button>
          ) : null}
        </div>

        {showReceiptForm && canEdit ? (
          <form
            className="mt-3 grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startReceipt(async () => {
                const result = await recordClientReceiptAction(
                  initialState,
                  formData,
                );
                setReceiptState(result);
                if (result.status !== "success") return;
                setShowReceiptForm(false);
                setReceiptAmount("");
                setReceivedAt("");
                setReference("");
                setReceiptNotes("");
                setFxRate("");
                setInstallmentId("");
                router.refresh();
              });
            }}
          >
            <input name="billingDocumentId" type="hidden" value={document.id} />
            <Field
              error={receiptState.fieldErrors?.receivedAt}
              label="Receipt date"
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
              error={receiptState.fieldErrors?.amount}
              label={`Amount (${document.currencyCode})`}
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
              error={receiptState.fieldErrors?.installmentId}
              label="Apply to installment (optional)"
            >
              <select
                className={inputClassName}
                name="installmentId"
                onChange={(event) => setInstallmentId(event.target.value)}
                value={installmentId}
              >
                <option value="">Billing level</option>
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
            <Field
              error={receiptState.fieldErrors?.reference}
              label="Reference"
            >
              <input
                className={inputClassName}
                name="reference"
                onChange={(event) => setReference(event.target.value)}
                value={reference}
              />
            </Field>
            {needsFx ? (
              <Field
                error={receiptState.fieldErrors?.fxRate}
                label={`FX: 1 ${document.currencyCode} in ${document.project.reportingCurrencyCode}`}
                required
              >
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  name="fxRate"
                  onChange={(event) => setFxRate(event.target.value)}
                  required
                  value={fxRate}
                />
              </Field>
            ) : (
              <input name="fxRate" type="hidden" value="" />
            )}
            <Field error={receiptState.fieldErrors?.notes} label="Notes">
              <input
                className={inputClassName}
                name="notes"
                onChange={(event) => setReceiptNotes(event.target.value)}
                value={receiptNotes}
              />
            </Field>
            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
              <SubmitButton pending={receiptPending}>Save receipt</SubmitButton>
              <ActionFeedback state={receiptState} />
            </div>
          </form>
        ) : null}

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {document.receipts.map((item) => (
            <BillingReceiptEditor
              billingDocumentId={document.id}
              canEdit={canEdit}
              currencyCode={document.currencyCode}
              installments={ownedInstallments}
              key={item.id}
              receipt={item}
              reportingCurrencyCode={document.project.reportingCurrencyCode}
            />
          ))}
          {document.receipts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No receipts recorded for this Billing Event.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
