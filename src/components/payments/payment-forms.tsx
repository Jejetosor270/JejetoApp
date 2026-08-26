"use client";

import { useActionState, useState } from "react";

import {
  applyPaymentPresetAction,
  cancelInstallmentAction,
  createInstallmentAction,
  markInstallmentSettledAction,
  recordSettlementAction,
  removeInstallmentAction,
  removeSettlementAction,
  updateInstallmentAction,
} from "@/app/(app)/payments/actions";
import {
  Field,
  inputClassName,
  MoneyInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
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
    <p
      className={
        state.status === "error"
          ? "text-destructive text-xs"
          : "text-positive text-xs"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function InstallmentForm({
  currencies,
  defaultCurrencyCode,
  direction,
  installment,
  orderId,
  reportingCurrencyCode,
}: {
  currencies: readonly { code: string }[];
  defaultCurrencyCode: string;
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  installment?: PaymentInstallmentView;
  orderId: string;
  reportingCurrencyCode: string;
}) {
  const serverAction = installment
    ? updateInstallmentAction
    : createInstallmentAction;
  const [state, action, pending] = useActionState(
    serverAction,
    initialPaymentActionState,
  );
  const [basis, setBasis] = useState(installment?.basis ?? "PERCENTAGE");
  const [currencyCode, setCurrencyCode] = useState(
    installment?.currencyCode ?? defaultCurrencyCode,
  );
  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-4"
    >
      <input name="direction" type="hidden" value={direction} />
      <input name="orderId" type="hidden" value={orderId} />
      {installment ? (
        <input name="id" type="hidden" value={installment.id} />
      ) : null}
      <Field label="Label">
        <input
          className={inputClassName}
          defaultValue={installment?.label ?? ""}
          name="label"
          placeholder="Deposit"
          required
        />
      </Field>
      <Field label="Entry basis">
        <select
          className={inputClassName}
          name="basis"
          onChange={(event) =>
            setBasis(event.target.value as "PERCENTAGE" | "FIXED_AMOUNT")
          }
          value={basis}
        >
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED_AMOUNT">Fixed amount</option>
        </select>
      </Field>
      <Field label="Percentage %">
        <input
          className={inputClassName}
          defaultValue={rateToPercentInput(installment?.percentageRate ?? null)}
          disabled={basis !== "PERCENTAGE"}
          inputMode="decimal"
          name="percentageRate"
          placeholder="30"
        />
      </Field>
      <Field label="Fixed amount">
        <MoneyInput
          defaultValue={
            basis === "FIXED_AMOUNT" ? installment?.scheduledAmount : ""
          }
          disabled={basis !== "FIXED_AMOUNT"}
          name="fixedAmount"
          placeholder="25000.00"
        />
      </Field>
      <Field label="Currency">
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
      <Field label="Due date">
        <input
          className={inputClassName}
          defaultValue={installment?.dueDate ?? ""}
          name="dueDate"
          required
          type="date"
        />
      </Field>
      <Field label={`Expected FX to ${reportingCurrencyCode}`}>
        <input
          className={inputClassName}
          defaultValue={installment?.expectedFxRate ?? ""}
          disabled={currencyCode === reportingCurrencyCode}
          inputMode="decimal"
          name="expectedFxRate"
          placeholder={
            currencyCode === reportingCurrencyCode
              ? "1 (automatic)"
              : "0.860000"
          }
        />
      </Field>
      <Field label="Notes">
        <input
          className={inputClassName}
          defaultValue={installment?.notes ?? ""}
          name="notes"
        />
      </Field>
      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
        <SubmitButton pending={pending}>
          {installment ? "Save installment" : "Add installment"}
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
  const [state, action, pending] = useActionState(
    applyPaymentPresetAction,
    initialPaymentActionState,
  );
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
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
        <input
          className={inputClassName}
          name="firstDueDate"
          required
          type="date"
        />
      </Field>
      <SubmitButton pending={pending}>Add preset</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function SettlementForm({
  installment,
  today,
}: {
  installment: PaymentInstallmentView;
  today: string;
}) {
  const [state, action, pending] = useActionState(
    recordSettlementAction,
    initialPaymentActionState,
  );
  const wording =
    installment.direction === "SUPPLIER_PAYMENT" ? "payment" : "receipt";
  return (
    <form
      action={action}
      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input name="installmentId" type="hidden" value={installment.id} />
      <Field label={`${wording === "payment" ? "Paid" : "Received"} amount`}>
        <MoneyInput
          defaultValue={installment.outstandingAmount}
          name="amount"
          required
        />
      </Field>
      <Field label="Actual date">
        <input
          className={inputClassName}
          defaultValue={today}
          name="settledAt"
          required
          type="date"
        />
      </Field>
      <Field label={`Actual FX to ${installment.reportingCurrencyCode}`}>
        <input
          className={inputClassName}
          disabled={
            installment.currencyCode === installment.reportingCurrencyCode
          }
          inputMode="decimal"
          name="fxRate"
        />
      </Field>
      <Field label="Reference">
        <input className={inputClassName} name="reference" />
      </Field>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <SubmitButton pending={pending}>Record {wording}</SubmitButton>
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
