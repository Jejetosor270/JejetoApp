"use client";

import { useActionState, useState } from "react";

import {
  createProjectFreightExpenseAction,
  deleteProjectFreightExpenseAction,
  updateProjectFreightExpenseAction,
} from "@/app/(app)/projects/[projectId]/actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
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
import {
  formatMoney,
  formatRate,
  rateToPercentInput,
} from "@/domain/procurement/presentation";
import { vatTreatments } from "@/config/vat";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";

interface ExpenseView {
  costAmountHt: string;
  currencyCode: string;
  description: string;
  expenseDate: string;
  freightMarkupOverrideRate: string | null;
  fxRate: string | null;
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

function vatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function VatFields({
  errors,
  initial,
  onTreatmentChange,
  treatment,
}: {
  errors: Record<string, string>;
  initial?: ExpenseView | undefined;
  onTreatmentChange: (value: string) => void;
  treatment: string;
}) {
  const recoverabilityApplies = inputVatRecoverabilityApplies(treatment);
  return (
    <>
      <Field error={errors.vatTreatment} label="VAT treatment">
        <select
          className={inputClassName}
          name="vatTreatment"
          onChange={(event) => onTreatmentChange(event.target.value)}
          value={treatment}
        >
          <option value="">No VAT recorded</option>
          {vatTreatments.map((value) => (
            <option key={value} value={value}>
              {vatLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field error={errors.vatRate} label="VAT rate %">
        <PercentageInput
          defaultValue={rateToPercentInput(initial?.vatRate ?? null)}
          disabled={!treatment}
          name="vatRate"
          placeholder="20.00"
        />
      </Field>
      <Field error={errors.vatAmount} label="VAT amount override">
        <MoneyInput
          defaultValue={initial?.vatAmountIsManual ? initial.vatAmount : ""}
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
          defaultValue={rateToPercentInput(initial?.recoverableRate ?? null)}
          disabled={!recoverabilityApplies}
          name="vatRecoverableRate"
          placeholder="100.00"
          required={recoverabilityApplies}
        />
      </Field>
    </>
  );
}

function DeleteExpense({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    deleteProjectFreightExpenseAction,
    initialMasterDataActionState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="id" type="hidden" value={id} />
      <Button disabled={pending} size="xs" type="submit" variant="ghost">
        Delete
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

function EditExpenseVat({
  expense,
  projectId,
}: {
  expense: ExpenseView;
  projectId: string;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    updateProjectFreightExpenseAction,
    initialMasterDataActionState,
  );
  const [treatment, setTreatment] = useState(expense.vatTreatment ?? "");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <details>
      <summary className="cursor-pointer text-xs font-medium">Edit VAT</summary>
      <form
        className="mt-3 grid min-w-[36rem] gap-3 sm:grid-cols-2"
        onSubmit={onSubmit}
      >
        <input name="id" type="hidden" value={expense.id} />
        <input name="projectId" type="hidden" value={projectId} />
        <VatFields
          errors={fieldErrors}
          initial={expense}
          onTreatmentChange={setTreatment}
          treatment={treatment}
        />
        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton pending={pending}>Save VAT</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </details>
  );
}

export function ProjectFreightExpenses({
  canEdit,
  currencies,
  expenses,
  projectId,
  reportingCurrencyCode,
  suppliers,
}: {
  canEdit: boolean;
  currencies: readonly { code: string; name: string }[];
  expenses: ExpenseView[];
  projectId: string;
  reportingCurrencyCode: string;
  suppliers: readonly { displayName: string; id: string }[];
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    createProjectFreightExpenseAction,
    initialMasterDataActionState,
  );
  const [currencyCode, setCurrencyCode] = useState(reportingCurrencyCode);
  const [vatTreatment, setVatTreatment] = useState("");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Project-level freight expenses</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Use this only for freight not already recorded on a Supplier Order.
      </p>
      {canEdit ? (
        <form
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={onSubmit}
        >
          <input name="projectId" type="hidden" value={projectId} />
          <Field error={fieldErrors.description} label="Description" required>
            <input className={inputClassName} name="description" required />
          </Field>
          <Field error={fieldErrors.reference} label="Reference">
            <input className={inputClassName} name="reference" />
          </Field>
          <Field error={fieldErrors.supplierId} label="Supplier">
            <select className={inputClassName} name="supplierId">
              <option value="">No supplier selected</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field error={fieldErrors.expenseDate} label="Expense date" required>
            <input
              className={inputClassName}
              name="expenseDate"
              required
              type="date"
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
                  {currency.code} — {currency.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={fieldErrors.costAmountHt}
            label="Freight cost HT"
            required
          >
            <MoneyInput name="costAmountHt" required />
          </Field>
          <Field
            error={fieldErrors.fxRate}
            label={`FX to ${reportingCurrencyCode}`}
            required={currencyCode !== reportingCurrencyCode}
          >
            <input
              className={inputClassName}
              disabled={currencyCode === reportingCurrencyCode}
              inputMode="decimal"
              name="fxRate"
            />
          </Field>
          <Field
            error={fieldErrors.freightMarkupOverrideRate}
            label="Freight markup override %"
          >
            <PercentageInput
              className={inputClassName}
              name="freightMarkupOverrideRate"
              placeholder="Blank uses Project default"
            />
          </Field>
          <VatFields
            errors={fieldErrors}
            onTreatmentChange={setVatTreatment}
            treatment={vatTreatment}
          />
          <Field error={fieldErrors.notes} label="Notes">
            <input className={inputClassName} name="notes" />
          </Field>
          <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
            <SubmitButton pending={pending}>Add freight expense</SubmitButton>
            <ActionFeedback state={state} />
          </div>
        </form>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Supplier / reference</th>
              <th className="px-3 py-2 text-right">Cost HT</th>
              <th className="px-3 py-2 text-right">Markup</th>
              <th className="px-3 py-2 text-right">Input VAT</th>
              {canEdit ? <th className="px-3 py-2">Action</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td className="px-3 py-2">{expense.expenseDate}</td>
                <td className="px-3 py-2">{expense.description}</td>
                <td className="px-3 py-2">
                  {expense.supplier?.displayName ?? "—"}
                  {expense.reference ? ` · ${expense.reference}` : ""}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatMoney(expense.costAmountHt, expense.currencyCode)}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {expense.freightMarkupOverrideRate
                    ? formatRate(expense.freightMarkupOverrideRate)
                    : "Project default"}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {expense.vatAmount
                    ? `${formatMoney(expense.vatAmount, expense.currencyCode)} · ${expense.recoverableRate ? `${formatRate(expense.recoverableRate)} recoverable` : "not deductible"}`
                    : "—"}
                </td>
                {canEdit ? (
                  <td className="flex items-start gap-3 px-3 py-2">
                    <EditExpenseVat expense={expense} projectId={projectId} />
                    <DeleteExpense id={expense.id} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No Project-level freight expenses recorded.
          </p>
        ) : null}
      </div>
    </section>
  );
}
