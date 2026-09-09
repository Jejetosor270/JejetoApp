"use client";
import { RelatedRecordTable } from "@/components/layout/related-records";
import type { CashRecordKind } from "@/lib/related-records/types";
import type { CashListRow } from "@/lib/payments/cash-list";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";
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
  return (
    <RelatedRecordTable
      pageSize={items.length || 25}
      table={{
        id: kind,
        title,
        description:
          "Select records to manage them, or edit a row and save your changes.",
        ...(canEdit ? { editKind: kind, trashKind: kind } : {}),
        columns: [
          "Reference",
          "Project",
          "Counterparty",
          "Order / Billing",
          "Date",
          "Amount",
          "Status",
        ],
        numericColumns: [5],
        rows: items.map((row) => ({
          id: row.id,
          href: row.href,
          editValue: row.editReference ?? row.reference,
          editFields: [
            { column: 4, name: "date", type: "date", value: row.date },
            {
              column: 5,
              name: "amount",
              type: "money",
              value: row.amount,
              currency: row.currency,
            },
          ],
          cells: [
            row.reference,
            row.project,
            row.counterparty,
            row.document,
            formatDateOnly(row.date),
            formatMoney(row.amount, row.currency),
            formatEnumLabel(row.status),
          ],
        })),
      }}
    />
  );
}
