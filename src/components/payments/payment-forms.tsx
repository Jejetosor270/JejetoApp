"use client";
import { DateInput } from "@/components/forms/date-input";

import { useActionState, useState, useEffect } from "react";

import {
  applyPaymentPresetAction,
  cancelInstallmentAction,
  createInstallmentAction,
  markInstallmentSettledAction,
  recordSettlementAction,
  updateSettlementAction,
  removeInstallmentAction,
  removeSettlementAction,
  updateInstallmentAction,
} from "@/app/(app)/payments/actions";
import {
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import {
  initialPaymentActionState,
  type PaymentActionState,
} from "@/domain/payments/action-state";
import { paymentSchedulePresets } from "@/domain/payments/presets";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import type {
  PaymentInstallmentView,
  PaymentSettlementView,
} from "@/lib/payments/payments";

type PaymentAction = (
  state: PaymentActionState,
  formData: FormData,
) => Promise<PaymentActionState>;

function Feedback({ state }: { state: PaymentActionState }) {
  if (!state.message) return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"}>
      <p
        className={
          state.status === "error"
            ? "text-destructive text-xs"
            : "text-positive text-xs"
        }
      >
        {state.message}
      </p>
      {state.fieldErrors ? (
        <ul className="text-destructive list-disc pl-4 text-xs">
          {Object.entries(state.fieldErrors).map(([field, message]) => (
            <li key={field}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function InstallmentForm({
  action,
  hideExpectedFx = false,
  baseAmount,
  currencies,
  defaultCurrencyCode,
  direction,
  installment,
  orderId,
  reportingCurrencyCode,
  onSaved,
}: {
  action?: PaymentAction;
  hideExpectedFx?: boolean;
  onSaved?: () => void;
  baseAmount: string;
  currencies: readonly { code: string }[];
  defaultCurrencyCode: string;
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  installment?: PaymentInstallmentView;
  orderId: string;
  reportingCurrencyCode: string;
}) {
  const serverAction =
    action ?? (installment ? updateInstallmentAction : createInstallmentAction);
  const { state, onSubmit, pending } = usePersistentActionState(
    serverAction,
    initialPaymentActionState,
  );
  useEffect(() => {
    if (state.status === "success") onSaved?.();
  }, [state, onSaved]);
  const [basis, setBasis] = useState(installment?.basis ?? "PERCENTAGE");
  const [currencyCode, setCurrencyCode] = useState(
    installment?.currencyCode ?? defaultCurrencyCode,
  );
  const [label, setLabel] = useState(installment?.label ?? "");
  const [percentage, setPercentage] = useState(
    rateToPercentInput(
      installment?.percentageRate ?? installment?.impliedPercentageRate ?? null,
    ),
  );
  const [amount, setAmount] = useState(installment?.scheduledAmount ?? "");
  const [dueDate, setDueDate] = useState(installment?.dueDate ?? "");
  const [expectedFxRate, setExpectedFxRate] = useState(
    installment?.expectedFxRate ?? "",
  );
  const [notes, setNotes] = useState(installment?.notes ?? "");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form
      className="grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-2"
      onSubmit={onSubmit}
    >
      <input name="direction" type="hidden" value={direction} />
      <input name="orderId" type="hidden" value={orderId} />
      <input name="basis" type="hidden" value={basis} />
      <input
        name="percentageRate"
        type="hidden"
        value={basis === "PERCENTAGE" ? percentage : ""}
      />
      <input
        name="fixedAmount"
        type="hidden"
        value={basis === "FIXED_AMOUNT" ? amount : ""}
      />
      {installment ? (
        <input name="id" type="hidden" value={installment.id} />
      ) : null}
      <Field error={fieldErrors.label} label="Label" required>
        <input
          className={inputClassName}
          name="label"
          onChange={(event) => setLabel(event.target.value)}
          required
          value={label}
        />
      </Field>
      <Field error={fieldErrors.percentageRate} label="Payment term %" required>
        <PercentageInput
          className={inputClassName}
          onValueChange={(next) => {
            setBasis("PERCENTAGE");
            setPercentage(next);
            const derived = amountFromPercentage(baseAmount, next);
            if (derived !== null) setAmount(derived);
          }}
          required
          value={percentage}
        />
      </Field>
      <Field error={fieldErrors.fixedAmount} label="Term amount" required>
        <MoneyInput
          name="amountDisplay"
          onValueChange={(next) => {
            setBasis("FIXED_AMOUNT");
            setAmount(next);
            const derived = percentageFromAmount(baseAmount, next);
            if (derived !== null) setPercentage(derived);
          }}
          required
          value={amount}
        />
      </Field>
      <Field error={fieldErrors.currencyCode} label="Currency" required>
        <select
          className={inputClassName}
          name="currencyCode"
          onChange={(event) => setCurrencyCode(event.target.value)}
          value={currencyCode}
        >
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code}
            </option>
          ))}
        </select>
      </Field>
      <Field error={fieldErrors.dueDate} label="Due date">
        <DateInput
          className={inputClassName}
          name="dueDate"
          onChange={(event) => setDueDate(event.target.value)}

          value={dueDate}
        />
      </Field>
      {!hideExpectedFx && (
        <Field
          error={fieldErrors.expectedFxRate}
          label={`Expected FX to ${reportingCurrencyCode}`}
          required={currencyCode !== reportingCurrencyCode}
        >
          <input
            className={inputClassName}
            disabled={currencyCode === reportingCurrencyCode}
            inputMode="decimal"
            name="expectedFxRate"
            onChange={(event) => setExpectedFxRate(event.target.value)}
            placeholder={
              currencyCode === reportingCurrencyCode
                ? "1 (automatic)"
                : "0.860000"
            }
            value={expectedFxRate}
          />
        </Field>
      )}
      <Field error={fieldErrors.notes} label="Notes">
        <input
          className={inputClassName}
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </Field>
      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-2">
        <SubmitButton pending={pending}>
          {installment ? "Save payment term" : "Add payment term"}
        </SubmitButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function PresetForm({
  direction,
  orderId,
}: {
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  orderId: string;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    applyPaymentPresetAction,
    initialPaymentActionState,
  );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
      onSubmit={onSubmit}
    >
      <input name="direction" type="hidden" value={direction} />
      <input name="orderId" type="hidden" value={orderId} />
      <Field label="Preset">
        <select className={inputClassName} name="preset">
          {Object.keys(paymentSchedulePresets).map((preset) => (
            <option key={preset} value={preset}>
              {preset.replaceAll("-", " / ")} %
            </option>
          ))}
        </select>
      </Field>
      <Field label="First due date">
        <DateInput className={inputClassName} name="firstDueDate" required />
      </Field>
      <SubmitButton pending={pending}>Add preset</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SettlementForm({
  installment,
  today,
  settlement,
  onSaved,
  initialAmount,
}: {
  initialAmount?: string;
  installment: PaymentInstallmentView;
  today: string;
  settlement?: PaymentSettlementView;
  onSaved?: () => void;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    settlement ? updateSettlementAction : recordSettlementAction,
    initialPaymentActionState,
  );
  useEffect(() => {
    if (state.status === "success") onSaved?.();
  }, [state, onSaved]);
  const wording =
    installment.direction === "SUPPLIER_PAYMENT" ? "payment" : "receipt";
  const [amount, setAmount] = useState(
    settlement?.amount ?? initialAmount ?? installment.outstandingAmount,
  );
  const [settledAt, setSettledAt] = useState(settlement?.settledAt ?? today);
  const [fxRate, setFxRate] = useState(settlement?.fxRate ?? "");
  const [reference, setReference] = useState(settlement?.reference ?? "");
  const [notes, setNotes] = useState(settlement?.notes ?? "");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form
      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-2"
      onSubmit={onSubmit}
    >
      <input name="installmentId" type="hidden" value={installment.id} />
      {settlement && <input name="id" type="hidden" value={settlement.id} />}
      <Field
        error={fieldErrors.amount}
        label={`${wording === "payment" ? "Paid" : "Received"} amount`}
        required
      >
        <MoneyInput
          name="amount"
          onValueChange={setAmount}
          required
          value={amount}
        />
      </Field>
      <Field error={fieldErrors.settledAt} label="Actual payment date" required>
        <DateInput
          className={inputClassName}
          name="settledAt"
          onChange={(event) => setSettledAt(event.target.value)}
          required

          value={settledAt}
        />
      </Field>
      <Field
        error={fieldErrors.fxRate}
        label={`Actual FX to ${installment.reportingCurrencyCode}`}
        required={
          installment.currencyCode !== installment.reportingCurrencyCode
        }
      >
        <input
          className={inputClassName}
          disabled={
            installment.currencyCode === installment.reportingCurrencyCode
          }
          inputMode="decimal"
          name="fxRate"
          onChange={(event) => setFxRate(event.target.value)}
          value={fxRate}
        />
      </Field>
      <Field error={fieldErrors.reference} label="Payment reference">
        <input
          className={inputClassName}
          name="reference"
          onChange={(event) => setReference(event.target.value)}
          value={reference}
        />
      </Field>
      <Field error={fieldErrors.notes} label="Notes">
        <input
          className={inputClassName}
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </Field>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
        <SubmitButton pending={pending}>
          {settlement ? "Save payment" : `Record ${wording}`}
        </SubmitButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function MutationForm({
  action,
  children,
  installmentId,
  variant = "outline",
}: {
  action: PaymentAction;
  children: string;
  installmentId: string;
  variant?: "outline" | "destructive";
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialPaymentActionState,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input name="installmentId" type="hidden" value={installmentId} />
      <Button disabled={pending} size="xs" type="submit" variant={variant}>
        {children}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function InstallmentActions({
  installment,
}: {
  installment: PaymentInstallmentView;
}) {
  const settlementWording =
    installment.direction === "SUPPLIER_PAYMENT"
      ? "Mark as paid"
      : "Mark as received";
  return (
    <div className="flex flex-wrap gap-2">
      {!installment.isCancelled && installment.outstandingAmount !== "0" ? (
        <MutationForm
          action={markInstallmentSettledAction}
          installmentId={installment.id}
        >
          {settlementWording}
        </MutationForm>
      ) : null}
      {!installment.isCancelled ? (
        <MutationForm
          action={cancelInstallmentAction}
          installmentId={installment.id}
        >
          Cancel
        </MutationForm>
      ) : null}
      {installment.settlements.length === 0 ? (
        <MutationForm
          action={removeInstallmentAction}
          installmentId={installment.id}
          variant="destructive"
        >
          Remove
        </MutationForm>
      ) : null}
    </div>
  );
}

export function SettlementCorrection({
  settlement,
}: {
  settlement: PaymentSettlementView;
}) {
  const [state, action, pending] = useActionState(
    removeSettlementAction,
    initialPaymentActionState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="settlementId" type="hidden" value={settlement.id} />
      <Button disabled={pending} size="xs" type="submit" variant="ghost">
        Remove correction
      </Button>
      <Feedback state={state} />
    </form>
  );
}
