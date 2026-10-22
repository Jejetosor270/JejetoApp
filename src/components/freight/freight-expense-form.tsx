"use client";

import { useState } from "react";
import {
  createProjectFreightExpenseAction,
  updateProjectFreightExpenseAction,
} from "@/app/(app)/projects/[projectId]/actions";
import { DateInput } from "@/components/forms/date-input";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { vatTreatments } from "@/config/vat";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";

export interface FreightExpenseView {
  costAmountHt: string;
  currencyCode: string;
  description: string;
  dueDate: string | null;
  editVersion: string;
  expenseDate: string;
  freightMarkupOverrideRate: string | null;
  fxRate: string | null;
  hasPayments: boolean;
  id: string;
  notes: string | null;
  recoverability: string | null;
  recoverableRate: string | null;
  reference: string | null;
  supplierId: string | null;
  supplier: { displayName: string } | null;
  vatAmount: string | null;
  vatAmountIsManual: boolean;
  vatRate: string | null;
  vatTreatment: string | null;
}

export interface FreightExpenseFormOptions {
  currencies: readonly { code: string; name: string }[];
  projectId: string;
  reportingCurrencyCode: string;
  suppliers: readonly { displayName: string; id: string }[];
}

export function FreightExpenseForm({
  initial,
  currencies,
  projectId,
  reportingCurrencyCode,
  suppliers,
}: FreightExpenseFormOptions & { initial?: FreightExpenseView }) {
  // Freeze the opening values and version, including across Server Component refreshes.
  const [snapshot] = useState(initial);
  const [currencyCode, setCurrencyCode] = useState(
    snapshot?.currencyCode ?? reportingCurrencyCode,
  );
  const [treatment, setTreatment] = useState(snapshot?.vatTreatment ?? "");
  const { state, onSubmit, pending } = usePersistentActionState(
    snapshot
      ? updateProjectFreightExpenseAction
      : createProjectFreightExpenseAction,
    initialMasterDataActionState,
  );
  const errors = state.fieldErrors ?? {};
  const recoverabilityApplies = inputVatRecoverabilityApplies(treatment);
  const lockedCashContext = snapshot?.hasPayments ?? false;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
      <input name="projectId" type="hidden" value={projectId} />
      {snapshot ? (
        <>
          <input name="id" type="hidden" value={snapshot.id} />
          <input
            name="expectedVersion"
            type="hidden"
            value={snapshot.editVersion}
          />
        </>
      ) : null}
      <Field error={errors.description} label="Description" required>
        <input
          className={inputClassName}
          defaultValue={snapshot?.description ?? ""}
          name="description"
          required
          maxLength={200}
        />
      </Field>
      <Field error={errors.reference} label="Reference">
        <input
          className={inputClassName}
          defaultValue={snapshot?.reference ?? ""}
          name="reference"
          maxLength={120}
        />
      </Field>
      <Field error={errors.supplierId} label="Supplier">
        {lockedCashContext ? (
          <input
            type="hidden"
            name="supplierId"
            value={snapshot?.supplierId ?? ""}
          />
        ) : null}
        <select
          className={inputClassName}
          defaultValue={snapshot?.supplierId ?? ""}
          disabled={lockedCashContext}
          name={lockedCashContext ? undefined : "supplierId"}
        >
          <option value="">No supplier selected</option>
          {snapshot?.supplierId &&
          !suppliers.some((supplier) => supplier.id === snapshot.supplierId) ? (
            <option value={snapshot.supplierId}>
              {snapshot.supplier?.displayName ?? "Current Supplier"}
            </option>
          ) : null}
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field error={errors.expenseDate} label="Expense date" required>
        <DateInput
          className={inputClassName}
          defaultValue={snapshot?.expenseDate ?? ""}
          name="expenseDate"
          required
        />
      </Field>
      <Field error={errors.dueDate} label="Payment due">
        <DateInput
          className={inputClassName}
          defaultValue={snapshot?.dueDate ?? ""}
          name="dueDate"
        />
      </Field>
      <Field error={errors.currencyCode} label="Currency" required>
        {lockedCashContext ? (
          <input type="hidden" name="currencyCode" value={currencyCode} />
        ) : null}
        <select
          className={inputClassName}
          disabled={lockedCashContext}
          name={lockedCashContext ? undefined : "currencyCode"}
          onChange={(event) => setCurrencyCode(event.target.value)}
          value={currencyCode}
        >
          {!currencies.some((currency) => currency.code === currencyCode) ? (
            <option value={currencyCode}>{currencyCode}</option>
          ) : null}
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </Field>
      <Field error={errors.costAmountHt} label="Freight cost HT" required>
        <MoneyInput
          defaultValue={snapshot?.costAmountHt ?? ""}
          name="costAmountHt"
          required
        />
      </Field>
      <Field
        error={errors.fxRate}
        label={`FX to ${reportingCurrencyCode}`}
        required={currencyCode !== reportingCurrencyCode}
      >
        <input
          className={inputClassName}
          defaultValue={snapshot?.fxRate ?? ""}
          disabled={currencyCode === reportingCurrencyCode}
          inputMode="decimal"
          name="fxRate"
          required={currencyCode !== reportingCurrencyCode}
        />
      </Field>
      <Field error={errors.freightMarkupOverrideRate} label="Freight markup %">
        <PercentageInput
          defaultValue={rateToPercentInput(
            snapshot?.freightMarkupOverrideRate ?? null,
          )}
          name="freightMarkupOverrideRate"
          placeholder="Project default"
        />
      </Field>
      <Field error={errors.vatTreatment} label="VAT treatment">
        <select
          className={inputClassName}
          name="vatTreatment"
          onChange={(event) => setTreatment(event.target.value)}
          value={treatment}
        >
          <option value="">No VAT recorded</option>
          {vatTreatments.map((value) => (
            <option key={value} value={value}>
              {formatEnumLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field error={errors.vatRate} label="VAT rate %">
        <PercentageInput
          defaultValue={rateToPercentInput(snapshot?.vatRate ?? null)}
          disabled={!treatment}
          name="vatRate"
          placeholder="20.00"
        />
      </Field>
      <Field error={errors.vatAmount} label="VAT amount override">
        <MoneyInput
          defaultValue={snapshot?.vatAmountIsManual ? snapshot.vatAmount : ""}
          disabled={!treatment}
          name="vatAmount"
        />
      </Field>
      <Field
        error={errors.vatRecoverableRate}
        label="Recoverability %"
        required={recoverabilityApplies}
      >
        <PercentageInput
          defaultValue={rateToPercentInput(snapshot?.recoverableRate ?? null)}
          disabled={!recoverabilityApplies}
          name="vatRecoverableRate"
          placeholder="100.00"
          required={recoverabilityApplies}
        />
      </Field>
      <Field error={errors.notes} label="Notes">
        <textarea
          className={inputClassName}
          defaultValue={snapshot?.notes ?? ""}
          name="notes"
          maxLength={4000}
        />
      </Field>
      {lockedCashContext ? (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Supplier and currency stay fixed while payments exist. Expense FX does
          not change actual payment FX.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>
          {snapshot ? "Save expense" : "Add freight expense"}
        </SubmitButton>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
