"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RecordSectionHeading } from "./record-presentation";
import type { RelatedTableData } from "@/lib/related-records/types";
import { unassignCashAction } from "@/app/(app)/unassigned-cash/actions";
import {
  BulkActionBar,
  SelectionHeader,
  SelectionCell,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";

import {
  removeOptionalLinksAction,
  editRelatedNameAction,
} from "@/app/(app)/related-records/actions";
import {
  InlineEditActions,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";

const PAGE_SIZE = 10;

export function RelatedRecordTable({
  table,
  actions,
  rowActions,
  firstCells,
}: {
  table: RelatedTableData;
  actions?: ReactNode;
  rowActions?: Record<string, ReactNode>;
  firstCells?: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    if (!table.editKind || !editingId || pending) return;
    const kind = table.editKind;
    const data = new FormData();
    data.set("id", editingId);
    data.set("value", draft);
    startTransition(async () => {
      try {
        const result = await editRelatedNameAction(kind, data);
        setFeedback(result.message ?? "");
        if (result.status === "success") {
          setEditingId(null);
          router.refresh();
        }
      } catch {
        setFeedback("The row could not be saved. Your draft is retained.");
      }
    });
  };
  const lastPage = Math.max(0, Math.ceil(table.rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = table.rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selection = useBulkSelection(visible.map((row) => row.id));
  return (
    <section className="bg-card rounded-lg border p-4" aria-label={table.title}>
      <RecordSectionHeading
        title={`${table.title} (${table.rows.length})`}
        description={table.description}
        actions={actions}
      />
      <div className="mt-4 overflow-x-auto rounded-md border">
        {table.removal && (
          <BulkActionBar
            unlink
            action={
              table.removal.kind === "payment" ||
              table.removal.kind === "receipt"
                ? unassignCashAction.bind(null, table.removal.kind)
                : removeOptionalLinksAction.bind(null, table.removal)
            }
            clearSelection={selection.clear}
            entityName="record"
            selectedIds={selection.selectedIds}
            scope={
              table.removal.kind === "payment" ||
              table.removal.kind === "receipt"
                ? "Clear the cash assignment. The former document and Project balances will update; the original cash remains in Unassigned cash records."
                : "Remove only these connections. The records remain available, with these relationships unassigned."
            }
          />
        )}
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{table.title}</caption>
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              {table.removal && (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={!visible.length}
                  onChange={selection.toggleAll}
                />
              )}
              {table.columns.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-3 py-2 font-medium ${table.numericColumns?.includes(index) ? "text-right" : ""}`}
                >
                  {label}
                </th>
              ))}
              {rowActions || table.editKind ? (
                <th scope="col" className="px-3 py-2 text-right">
                  Manage
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-muted/25 ${row.href ? "cursor-pointer" : ""}`}
                onClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest("a, button, input, select, textarea")
                  )
                    return;
                  if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    window.getSelection()?.toString()
                  )
                    return;
                  if (row.href) router.push(row.href);
                }}
              >
                {table.removal && (
                  <SelectionCell
                    checked={selection.isSelected(row.id)}
                    onChange={() => selection.toggle(row.id)}
                    label={row.cells[0] ?? "record"}
                  />
                )}
                {row.cells.map((value, index) => (
                  <td
                    key={table.columns[index]}
                    className={`px-3 py-2 ${table.numericColumns?.includes(index) ? "financial-figure text-right" : ""}`}
                  >
                    {index === 0 && editingId === row.id ? (
                      <InlineTextInput
                        ariaLabel={table.columns[0] ?? "Name"}
                        value={draft}
                        disabled={pending}
                        onChange={setDraft}
                      />
                    ) : index === 0 && firstCells?.[row.id] ? (
                      firstCells[row.id]
                    ) : index === 0 && row.href ? (
                      <Link
                        href={row.href}
                        className="font-medium underline underline-offset-2"
                      >
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </td>
                ))}
                {rowActions || table.editKind ? (
                  <td className="px-3 py-2 text-right">
                    {table.editKind && (
                      <InlineEditActions
                        editing={editingId === row.id}
                        pending={
                          pending ||
                          (editingId !== null && editingId !== row.id)
                        }
                        feedback={editingId === row.id ? feedback : ""}
                        onEdit={() => {
                          if (editingId) return;
                          setDraft(row.cells[0] ?? "");
                          setFeedback("");
                          setEditingId(row.id);
                        }}
                        onSave={save}
                        onCancel={() => {
                          setEditingId(null);
                          setFeedback("");
                        }}
                      />
                    )}
                    {rowActions?.[row.id]}
                  </td>
                ) : null}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    table.columns.length +
                    (rowActions || table.editKind ? 1 : 0) +
                    (table.removal ? 1 : 0)
                  }
                  className="text-muted-foreground px-3 py-6 text-center"
                >
                  No related {table.title.toLowerCase()}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {lastPage > 0 ? (
        <nav
          aria-label={`${table.title} pages`}
          className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span>
            Page {currentPage + 1} of {lastPage + 1} · {table.rows.length}{" "}
            records
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 0 || editingId !== null}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === lastPage || editingId !== null}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}

export function RelatedRecords({
  tables,
  actions = {},
}: {
  tables: RelatedTableData[];
  actions?: Record<string, ReactNode>;
}) {
  return (
    <div className="space-y-4">
      {tables.map((table) => (
        <RelatedRecordTable
          key={table.id}
          table={table}
          actions={actions[table.id]}
        />
      ))}
    </div>
  );
}
