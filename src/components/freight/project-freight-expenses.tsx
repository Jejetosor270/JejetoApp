"use client";

import { useActionState, useState } from "react";

import {
  createProjectFreightExpenseAction,
  deleteProjectFreightExpenseAction,
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
import { formatMoney, formatRate } from "@/domain/procurement/presentation";

interface ExpenseView {
  costAmountHt: string;
  currencyCode: string;
  description: string;
  expenseDate: string;
  freightMarkupOverrideRate: string | null;
  fxRate: string | null;
  id: string;
  notes: string | null;
  reference: string | null;
  supplier: { displayName: string } | null;
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
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <section className="bg-card rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Project-level freight expenses</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Use this only for freight not already recorded on an Order.
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
                {canEdit ? (
                  <td className="px-3 py-2">
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
