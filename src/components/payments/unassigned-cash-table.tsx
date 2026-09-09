"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  editUnassignedCashAction,
  trashUnassignedCashAction,
} from "@/app/(app)/unassigned-cash/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineEditActions,
  InlineMoneyInput,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { DateInput } from "@/components/forms/date-input";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatFxRate } from "@/domain/procurement/presentation";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";
import { ListEmptyState } from "@/components/listing/empty-state";

export interface UnassignedCashRow {
  id: string;
  reference: string;
  direction: string;
  date: string;
  amount: string;
  currency: string;
  reportingCurrency: string;
  fxRate: string | null;
}
function CashRow({
  row,
  canEdit,
  selected,
  onSelect,
}: {
  row: UnassignedCashRow;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const data = new FormData();
      data.set("id", row.id);
      data.set("amount", draft.amount);
      data.set("reference", draft.reference);
      data.set("settledAt", draft.date);
      const result = await editUnassignedCashAction(data);
      setFeedback(result.message ?? "");
      if (result.status === "success") {
        setEditing(false);
        router.refresh();
      }
    });
  return (
    <tr className="border-t">
      {canEdit && (
        <SelectionCell
          checked={selected}
          onChange={onSelect}
          label={row.reference || "Unassigned cash"}
        />
      )}
      <td className="p-3">
        {editing ? (
          <InlineTextInput
            ariaLabel="Reference"
            value={draft.reference}
            disabled={pending}
            onChange={(reference) => setDraft({ ...draft, reference })}
          />
        ) : (
          row.reference || "Unassigned cash"
        )}
      </td>
      <td className="p-3">
        {row.direction === "SUPPLIER_PAYMENT"
          ? "Supplier payment"
          : "Client receipt"}
      </td>
      <td className="p-3">
        {editing ? (
          <DateInput
            aria-label="Cash date"
            value={draft.date}
            disabled={pending}
            onChange={(event) =>
              setDraft({ ...draft, date: event.target.value })
            }
          />
        ) : (
          formatDateOnly(row.date)
        )}
      </td>
      <td className="p-3 text-right tabular-nums">
        {editing ? (
          <>
            <InlineMoneyInput
              ariaLabel="Amount"
              value={draft.amount}
              disabled={pending}
              onChange={(amount) => setDraft({ ...draft, amount })}
            />{" "}
            {row.currency}
          </>
        ) : (
          formatMoney(row.amount, row.currency)
        )}
      </td>
      <td className="p-3">
        {row.currency === row.reportingCurrency
          ? "1"
          : row.fxRate
            ? formatFxRate(row.fxRate)
            : "Missing"}{" "}
        {row.currency} → {row.reportingCurrency}
      </td>
      {canEdit && (
        <td className="p-3">
          <InlineEditActions
            editing={editing}
            pending={pending}
            feedback={feedback}
            onEdit={() => {
              setDraft(row);
              setFeedback("");
              setEditing(true);
            }}
            onCancel={() => {
              setDraft(row);
              setEditing(false);
              setFeedback("");
            }}
            onSave={save}
          />
        </td>
      )}
    </tr>
  );
}
export function UnassignedCashTable({
  rows,
  canEdit,
}: {
  rows: UnassignedCashRow[];
  canEdit: boolean;
}) {
  const selection = useBulkSelection(rows.map((row) => row.id));
  return (
    <section className={tableContainerClassName}>
      {canEdit && (
        <BulkActionBar
          action={trashUnassignedCashAction}
          clearSelection={selection.clear}
          entityName="cash record"
          selectedIds={selection.selectedIds}
          scope="Move these unassigned cash records to recoverable Trash."
        />
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className={tableHeaderClassName}>
            <tr>
              {canEdit && (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={!rows.length}
                  onChange={selection.toggleAll}
                />
              )}
              {[
                "Reference",
                "Type",
                "Date",
                "Amount",
                "Original FX",
                ...(canEdit ? ["Actions"] : []),
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CashRow
                key={row.id}
                row={row}
                canEdit={canEdit}
                selected={selection.isSelected(row.id)}
                onSelect={() => selection.toggle(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <ListEmptyState entity="Unassigned cash records" />}
    </section>
  );
}
