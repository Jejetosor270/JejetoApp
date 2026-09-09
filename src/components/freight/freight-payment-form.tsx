"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveFreightPaymentAction,
  removeFreightPaymentAction,
  setFreightDueDateAction,
  unassignFreightPaymentAction,
} from "@/app/(app)/projects/freight-payment-actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { ConfirmSubmit } from "@/components/forms/confirm-submit";
import { Button } from "@/components/ui/button";
import {
  Field,
  MoneyInput,
  inputClassName,
  SubmitButton,
  ActionFeedback,
} from "@/components/master-data/form-ui";
import { DateInput } from "@/components/forms/date-input";
import { businessToday } from "@/domain/payments/dates";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";

type Payment = {
  id: string;
  amount: string;
  paidAt: string;
  fxRate: string | null;
  reference: string | null;
  notes: string | null;
};
type Props = {
  expenseId: string;
  currency: string;
  reportingCurrency: string;
  payment?: Payment;
};
function PaymentForm({
  expenseId,
  currency,
  reportingCurrency,
  payment,
  onSaved,
}: Props & { onSaved: () => void }) {
  const { state, onSubmit, pending } = usePersistentActionState(
    saveFreightPaymentAction,
    initialMasterDataActionState,
  );
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state, onSaved]);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="id" value={payment?.id ?? ""} />
      <Field label={`Amount paid (${currency})`} required>
        <MoneyInput
          name="amount"
          defaultValue={payment?.amount ?? ""}
          required
        />
      </Field>
      <Field label="Payment date" required>
        <DateInput
          name="paidAt"
          defaultValue={payment?.paidAt ?? businessToday()}
          required
        />
      </Field>
      {currency !== reportingCurrency && (
        <Field label={`Actual FX to ${reportingCurrency}`} required>
          <input
            name="fxRate"
            className={inputClassName}
            inputMode="decimal"
            defaultValue={payment?.fxRate ?? ""}
            required
          />
        </Field>
      )}
      <Field label="Reference">
        <input
          name="reference"
          className={inputClassName}
          defaultValue={payment?.reference ?? ""}
        />
      </Field>
      <Field label="Notes">
        <input
          name="notes"
          className={inputClassName}
          defaultValue={payment?.notes ?? ""}
        />
      </Field>
      <ActionFeedback state={state} />
      <SubmitButton pending={pending}>Save payment</SubmitButton>
    </form>
  );
}
export function FreightPaymentEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const title = props.payment ? "Edit freight payment" : "Add freight payment";
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {title}
      </Button>
      <EditorDrawer title={title} open={open} onOpenChange={setOpen}>
        {open && (
          <PaymentForm
            {...props}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </EditorDrawer>
    </>
  );
}
export function FreightPaymentRemove({ id }: { id: string }) {
  const { state, onSubmit, pending } = usePersistentActionState(
    removeFreightPaymentAction,
    initialMasterDataActionState,
  );
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmit
        disabled={pending}
        title="Delete freight payment?"
        description="Move this payment to Trash and recalculate Project cash."
      />
      <ActionFeedback state={state} />
    </form>
  );
}
export function FreightDueDate({
  expenseId,
  dueDate,
}: {
  expenseId: string;
  dueDate: string;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    setFreightDueDateAction,
    initialMasterDataActionState,
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <Field label="Payment due date">
        <DateInput name="dueDate" defaultValue={dueDate} />
      </Field>
      <SubmitButton pending={pending}>Save due date</SubmitButton>
      <ActionFeedback state={state} />
    </form>
  );
}

export function FreightPaymentsTable({
  payments,
  canEdit,
  ...props
}: Omit<Props, "payment"> & { payments: Payment[]; canEdit: boolean }) {
  const formId = useId();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const { state, onSubmit, pending } = usePersistentActionState(
    unassignFreightPaymentAction,
    initialMasterDataActionState,
  );
  return (
    <div className="space-y-3">
      {canEdit && (
        <form id={formId} onSubmit={onSubmit}>
          <ConfirmSubmit
            disabled={
              pending || !payments.some((row) => selected.includes(row.id))
            }
            title="Remove payment relationships?"
            description="Selected payments will remain in Unassigned cash records with their original amounts, dates and FX. The expense will become outstanding again."
            label="Remove links"
          />
          <ActionFeedback state={state} />
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              {canEdit && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all freight payments"
                    checked={
                      payments.length > 0 &&
                      payments.every((row) => selected.includes(row.id))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? payments.map((row) => row.id)
                          : [],
                      )
                    }
                  />
                </th>
              )}
              <th>Date</th>
              <th>Reference</th>
              <th className="text-right">Paid</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {payments.map((row) => (
              <tr key={row.id} className="border-t">
                {canEdit && (
                  <td>
                    <input
                      form={formId}
                      name="ids"
                      value={row.id}
                      type="checkbox"
                      aria-label={`Select payment ${row.reference ?? row.id}`}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, row.id]
                            : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                )}
                {editing === row.id ? (
                  <td colSpan={4} className="p-3">
                    <PaymentForm
                      {...props}
                      payment={row}
                      onSaved={() => {
                        setEditing(null);
                        router.refresh();
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </td>
                ) : (
                  <>
                    <td>{formatDateOnly(row.paidAt)}</td>
                    <td>{row.reference ?? "—"}</td>
                    <td className="financial-figure text-right">
                      {formatMoney(row.amount, props.currency)}
                    </td>
                    {canEdit && (
                      <td className="py-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setEditing(row.id)}
                        >
                          Edit
                        </Button>
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
