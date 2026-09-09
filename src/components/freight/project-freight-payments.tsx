import { getDatabase } from "@/lib/db";
import { freightPaymentBalance } from "@/domain/finance/project-control";
import { dateToDateOnly, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import {
  FreightDueDate,
  FreightPaymentEditor,
  FreightPaymentsTable,
} from "./freight-payment-form";

export async function ProjectFreightPayments({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const project = await getDatabase().project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      reportingCurrencyCode: true,
      freightExpenses: {
        orderBy: { expenseDate: "desc" },
        include: { payments: { orderBy: [{ paidAt: "asc" }, { id: "asc" }] } },
      },
    },
  });
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Freight payments</h2>
      <p className="text-muted-foreground text-xs">
        Actual payments against Project freight expenses. Undated balances
        appear in all remaining commitments, not the 30-day total.
      </p>
      {project.freightExpenses.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Add a Project freight expense to record its payments.
        </p>
      )}
      {project.freightExpenses.map((expense) => {
        const balance = freightPaymentBalance(
          expense.costAmountHt.toString(),
          expense.vatAmount?.toString() ?? null,
          expense.vatTreatment,
          expense.payments.map((row) => row.amount.toString()),
        );
        return (
          <article key={expense.id} className="space-y-3 rounded-lg border p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                {expense.reference ?? expense.description}
              </h3>
              {canEdit && (
                <FreightPaymentEditor
                  expenseId={expense.id}
                  currency={expense.currencyCode}
                  reportingCurrency={project.reportingCurrencyCode}
                />
              )}
            </header>
            <p className="financial-figure text-sm">
              Payable {formatMoney(balance.payable, expense.currencyCode)} ·
              Paid {formatMoney(balance.paid, expense.currencyCode)} ·
              Outstanding{" "}
              {formatMoney(balance.outstanding, expense.currencyCode)}
            </p>
            {canEdit ? (
              <FreightDueDate
                expenseId={expense.id}
                dueDate={expense.dueDate ? dateToDateOnly(expense.dueDate) : ""}
              />
            ) : (
              <p>
                Due:{" "}
                {expense.dueDate
                  ? formatDateOnly(dateToDateOnly(expense.dueDate))
                  : "Not scheduled"}
              </p>
            )}
            <FreightPaymentsTable
              expenseId={expense.id}
              currency={expense.currencyCode}
              reportingCurrency={project.reportingCurrencyCode}
              canEdit={canEdit}
              payments={expense.payments.map((row) => ({
                id: row.id,
                amount: row.amount.toString(),
                paidAt: dateToDateOnly(row.paidAt),
                fxRate: row.fxRateToReporting?.toString() ?? null,
                reference: row.reference,
                notes: row.notes,
              }))}
            />
          </article>
        );
      })}
    </section>
  );
}
