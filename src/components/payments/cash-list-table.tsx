"use client";
import { trashSelectedAction } from "@/app/(app)/settings/trash/actions";
import {
  BulkActionBar,
  SelectionHeader,
  SelectionCell,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import type { CashRecordKind } from "@/lib/related-records/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";
import { ListEmptyState } from "@/components/listing/empty-state";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { CashListRow } from "@/lib/payments/cash-list";

export function CashListTable({
  items,
  title,
  kind,
  canEdit,
}: {
  items: CashListRow[];
  title: string;
  kind: CashRecordKind;
  canEdit: boolean;
}) {
  const router = useRouter();
  const selection = useBulkSelection(items.map((row) => row.id));
  return (
    <section className={tableContainerClassName}>
      {canEdit && (
        <BulkActionBar
          action={trashSelectedAction.bind(null, kind)}
          clearSelection={selection.clear}
          entityName="record"
          scope="Move the selected records and their dependents to Trash. Cash reporting will update, and you can restore the group from Settings."
          selectedIds={selection.selectedIds}
        />
      )}
      <div
        className="max-h-[70svh] overflow-auto"
        role="region"
        aria-label={title + " table"}
        tabIndex={0}
      >
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className={tableHeaderClassName}>
            <tr>
              {canEdit && (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={!items.length}
                  onChange={selection.toggleAll}
                />
              )}
              {[
                "Reference",
                "Project",
                "Counterparty",
                "Order / Billing",
                "Date",
                "Amount",
                "Status",
              ].map((label) => (
                <th
                  key={label}
                  className={
                    "px-4 py-3 " + (label === "Amount" ? "text-right" : "")
                  }
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-muted/30 cursor-pointer"
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest("a,button,input"))
                    router.push(row.href);
                }}
              >
                {canEdit && (
                  <SelectionCell
                    checked={selection.isSelected(row.id)}
                    onChange={() => selection.toggle(row.id)}
                    label={row.reference}
                  />
                )}
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={row.href}>
                    {row.reference}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.project}</td>
                <td className="px-4 py-3">{row.counterparty}</td>
                <td className="px-4 py-3">{row.document}</td>
                <td className="px-4 py-3">{formatDateOnly(row.date)}</td>
                <td className="financial-figure px-4 py-3 text-right">
                  {formatMoney(row.amount, row.currency)}
                </td>
                <td className="px-4 py-3">{formatEnumLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <ListEmptyState entity={title} />}
    </section>
  );
}
