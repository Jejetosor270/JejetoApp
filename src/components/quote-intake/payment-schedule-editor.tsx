"use client";

import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import {
  reconcileQuoteScheduleDraft,
  type QuoteScheduleDraftLine,
} from "@/domain/quote-intake/payment-schedule";
import type { QuotePaymentProposal } from "@/domain/quote-intake/extraction";
import { formatMoney } from "@/domain/procurement/presentation";
import { dateOnlyToEuropeanInput } from "@/domain/payments/dates";

interface EditablePayment extends QuoteScheduleDraftLine {
  dueDate: string;
  id: string;
  label: string;
  timingDescription: string;
}

function editablePayment(
  payment: QuotePaymentProposal,
  index: number,
): EditablePayment {
  return {
    basis: payment.basis === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE",
    dueDate: dateOnlyToEuropeanInput(payment.dueDate),
    fixedAmount: payment.fixedAmount ?? "",
    id: `extracted-${index}`,
    label: payment.label,
    percentagePercent:
      payment.percentageRate === null
        ? ""
        : new Decimal(payment.percentageRate).times(100).toString(),
    timingDescription: payment.timingDescription ?? "",
  };
}

function percentageInput(value: string): string | null {
  const normalized = value.trim();
  return /^(?:\d{0,3})(?:\.\d{0,4})?$/.test(normalized) ? normalized : null;
}

function errorClass(error: string | undefined): string {
  return `${inputClassName}${error ? " border-destructive focus-visible:border-destructive" : ""}`;
}

export function PaymentScheduleEditor({
  currencyCode,
  fieldErrors = {},
  initialPayments,
  supplierPayable,
}: {
  currencyCode: string;
  fieldErrors?: Record<string, string> | undefined;
  initialPayments: QuotePaymentProposal[];
  supplierPayable: string;
}) {
  const [payments, setPayments] = useState<EditablePayment[]>(() =>
    initialPayments.map(editablePayment),
  );
  const [approveSchedule, setApproveSchedule] = useState(false);
  const [nextId, setNextId] = useState(initialPayments.length + 1);
  const summary = reconcileQuoteScheduleDraft(supplierPayable, payments);
  const updatePayment = (index: number, update: Partial<EditablePayment>) => {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...update } : payment,
      ),
    );
  };
  const addPayment = () => {
    setPayments((current) => [
      ...current,
      {
        basis: "PERCENTAGE",
        dueDate: "",
        fixedAmount: "",
        id: `manual-${nextId}`,
        label: `Installment ${current.length + 1}`,
        percentagePercent: "",
        timingDescription: "",
      },
    ]);
    setNextId((current) => current + 1);
  };

  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Supplier payment proposal</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Edit, add, remove, or split installments freely. Nothing is saved until
        the approval checkbox is selected and the reviewed quote is confirmed.
      </p>

      <div className="bg-background mt-4 grid gap-3 rounded-md border p-3 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <p className="text-muted-foreground text-xs">Supplier payable</p>
          <p className="mt-1 font-medium tabular-nums">
            {formatMoney(supplierPayable, currencyCode)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Total scheduled percentage
          </p>
          <p className="mt-1 font-medium tabular-nums">
            {summary.scheduledPercentage === null
              ? "—"
              : `${summary.scheduledPercentage}%`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Total scheduled amount
          </p>
          <p className="mt-1 font-medium tabular-nums">
            {formatMoney(summary.scheduled, currencyCode)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Remaining unscheduled</p>
          <p className="mt-1 font-medium tabular-nums">
            {formatMoney(summary.unscheduled, currencyCode)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Over-allocated</p>
          <p className="mt-1 font-medium tabular-nums">
            {formatMoney(summary.overallocated, currencyCode)}
          </p>
        </div>
        <p
          className={`text-sm sm:col-span-2 xl:col-span-5 ${
            summary.isReconciled
              ? "text-positive"
              : new Decimal(summary.overallocated).greaterThan(0)
                ? "text-destructive"
                : "text-warning-foreground"
          }`}
          role="status"
        >
          {summary.isReconciled
            ? "Schedule reconciled exactly to the Supplier payable."
            : new Decimal(summary.overallocated).greaterThan(0)
              ? "The schedule is over-allocated. Adjust the entered installments before approval."
              : summary.invalidLineCount > 0
                ? "Complete each installment basis value to reconcile the schedule."
                : "The schedule is under-allocated; the remaining amount is shown above."}
        </p>
      </div>

      <input name="paymentCount" type="hidden" value={payments.length} />
      <div className="mt-4 space-y-3">
        {payments.map((payment, index) => {
          const prefix = `payments.${index}`;
          const labelError = fieldErrors[`${prefix}.label`];
          const percentageError = fieldErrors[`${prefix}.percentageRate`];
          const fixedError = fieldErrors[`${prefix}.fixedAmount`];
          const dueDateError = fieldErrors[`${prefix}.dueDate`];
          return (
            <div
              className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-5"
              key={payment.id}
            >
              <Field
                error={labelError}
                label="Label"
                required={approveSchedule}
              >
                <input
                  aria-invalid={Boolean(labelError) || undefined}
                  className={errorClass(labelError)}
                  name={`payment.${index}.label`}
                  onChange={(event) =>
                    updatePayment(index, { label: event.target.value })
                  }
                  value={payment.label}
                  required={approveSchedule}
                />
              </Field>
              <Field label="Basis">
                <select
                  className={inputClassName}
                  name={`payment.${index}.basis`}
                  onChange={(event) =>
                    updatePayment(index, {
                      basis: event.target.value as EditablePayment["basis"],
                      fixedAmount: "",
                      percentagePercent: "",
                    })
                  }
                  value={payment.basis}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED_AMOUNT">Fixed amount</option>
                </select>
              </Field>
              <Field
                error={percentageError}
                label="Percentage %"
                required={approveSchedule && payment.basis === "PERCENTAGE"}
              >
                <PercentageInput
                  className={errorClass(percentageError)}
                  disabled={payment.basis !== "PERCENTAGE"}
                  invalid={Boolean(percentageError)}
                  name={`payment.${index}.percentageRate`}
                  onValueChange={(value) => {
                    const nextValue = percentageInput(value);
                    if (nextValue !== null) {
                      updatePayment(index, { percentagePercent: nextValue });
                    }
                  }}
                  value={payment.percentagePercent}
                  required={approveSchedule && payment.basis === "PERCENTAGE"}
                />
              </Field>
              <Field
                error={fixedError}
                label="Fixed amount"
                required={approveSchedule && payment.basis === "FIXED_AMOUNT"}
              >
                <MoneyInput
                  disabled={payment.basis !== "FIXED_AMOUNT"}
                  invalid={Boolean(fixedError)}
                  name={`payment.${index}.fixedAmount`}
                  onValueChange={(fixedAmount) =>
                    updatePayment(index, { fixedAmount })
                  }
                  required={approveSchedule && payment.basis === "FIXED_AMOUNT"}
                  value={payment.fixedAmount}
                />
              </Field>
              <Field
                error={dueDateError}
                label="Due date"
                required={approveSchedule}
              >
                <input
                  aria-invalid={Boolean(dueDateError) || undefined}
                  className={errorClass(dueDateError)}
                  inputMode="numeric"
                  maxLength={10}
                  name={`payment.${index}.dueDate`}
                  onChange={(event) =>
                    updatePayment(index, { dueDate: event.target.value })
                  }
                  pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                  placeholder="DD/MM/YYYY"
                  required={approveSchedule}
                  title="Enter a date as DD/MM/YYYY"
                  type="text"
                  value={payment.dueDate}
                />
              </Field>
              <Field label="Timing wording">
                <input
                  className={inputClassName}
                  name={`payment.${index}.timingDescription`}
                  onChange={(event) =>
                    updatePayment(index, {
                      timingDescription: event.target.value,
                    })
                  }
                  value={payment.timingDescription}
                />
              </Field>
              <div className="flex items-end md:col-span-1 xl:col-span-4 xl:justify-end">
                <Button
                  onClick={() =>
                    setPayments((current) =>
                      current.filter(
                        (_, paymentIndex) => paymentIndex !== index,
                      ),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 data-icon="inline-start" /> Remove
                </Button>
              </div>
            </div>
          );
        })}
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No installments. Add one to prepare a schedule.
          </p>
        ) : null}
      </div>
      <Button
        className="mt-3"
        onClick={addPayment}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus data-icon="inline-start" /> Add installment
      </Button>
      <label className="mt-4 flex items-start gap-2 text-sm font-medium">
        <input
          checked={approveSchedule}
          className="mt-0.5"
          name="approveSchedule"
          onChange={(event) => setApproveSchedule(event.target.checked)}
          type="checkbox"
        />
        <span>
          I approve creating these supplier-payment installments with the
          reviewed amounts, percentages, and due dates.
        </span>
      </label>
      {fieldErrors.payments ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {fieldErrors.payments}
        </p>
      ) : null}
    </section>
  );
}
