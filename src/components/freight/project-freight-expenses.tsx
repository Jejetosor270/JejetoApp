"use client";

import { useActionState } from "react";
import { deleteProjectFreightExpenseAction } from "@/app/(app)/projects/[projectId]/actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { ConfirmSubmit } from "@/components/forms/confirm-submit";
import { RecordSectionHeading } from "@/components/layout/record-presentation";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import { ActionFeedback } from "@/components/master-data/form-ui";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import {
  FreightExpenseForm,
  type FreightExpenseFormOptions,
  type FreightExpenseView,
} from "./freight-expense-form";

function DeleteExpense({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    deleteProjectFreightExpenseAction,
    initialMasterDataActionState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="id" type="hidden" value={id} />
      <ConfirmSubmit
        disabled={pending}
        title="Delete this freight expense?"
        description="This moves the Project freight expense, VAT and payments to recoverable Trash. Financial reports will be recalculated from the remaining records."
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function ProjectFreightExpenses({
  canEdit,
  expenses,
  ...formOptions
}: FreightExpenseFormOptions & {
  canEdit: boolean;
  expenses: FreightExpenseView[];
}) {
  return (
    <section className="bg-card rounded-lg border p-4">
      <RecordSectionHeading title="Project freight expenses" />
      <p className="text-muted-foreground mt-1 text-xs">
        Freight not already recorded on an Order.
      </p>
      {canEdit ? (
        <EditorDrawer title="Add freight expense">
          <FreightExpenseForm {...formOptions} />
        </EditorDrawer>
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
              <tr
                key={expense.id}
                id={`freight-${expense.id}`}
                className="scroll-mt-6"
              >
                <td className="px-3 py-2">
                  {formatDateOnly(expense.expenseDate)}
                </td>
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
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-3">
                      <EditorDrawer title="Edit expense">
                        <FreightExpenseForm
                          initial={expense}
                          {...formOptions}
                        />
                      </EditorDrawer>
                      <DeleteExpense id={expense.id} />
                    </div>
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
