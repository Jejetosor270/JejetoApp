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
  InlineMoneyInput,
} from "@/components/inline-editing/inline-edit";
import { editRelatedFinancialRowAction } from "@/app/(app)/related-records/inline-actions";
import { trashSelectedAction } from "@/app/(app)/settings/trash/actions";

const PAGE_SIZE = 10;

export function RelatedRecordTable({
  table,
  actions,
  rowActions,
  firstCells,
  onRemoved,
  onEdited,
  pageSize = PAGE_SIZE,
}: {
  table: RelatedTableData;
  actions?: ReactNode;
  rowActions?: Record<string, ReactNode>;
  firstCells?: Record<string, ReactNode>;
  onRemoved?: (ids: string[]) => void;
  onEdited?: (id: string, fields: Record<string, string>) => void;
  pageSize?: number;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [fieldDraft, setFieldDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    if (!table.editKind || !editingId || pending) return;
    const kind = table.editKind;
    const data = new FormData();
    data.set("id", editingId);
    data.set("value", draft);
    for (const [name, value] of Object.entries(fieldDraft))
      data.set(name, value);
    startTransition(async () => {
      try {
        const result = table.rows.find((row) => row.id === editingId)
          ?.editFields
          ? await editRelatedFinancialRowAction(kind, table.editParentId, data)
          : await editRelatedNameAction(kind, data);
        setFeedback(result.message ?? "");
        if (result.status === "success") {
          onEdited?.(editingId, fieldDraft);
          setEditingId(null);
          router.refresh();
        }
      } catch {
        setFeedback("The row could not be saved. Your draft is retained.");
      }
    });
  };
  const lastPage = Math.max(0, Math.ceil(table.rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = table.rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
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
        {(table.removal || table.trashKind) && (
          <BulkActionBar
            unlink={!table.trashKind}
            action={
              table.trashKind
                ? trashSelectedAction.bind(null, table.trashKind)
                : (table.removal &&
                    (table.removal.kind === "payment" ||
                    table.removal.kind === "receipt"
                      ? unassignCashAction.bind(null, table.removal.kind)
                      : removeOptionalLinksAction.bind(null, table.removal))) ||
                  (async () => ({
                    status: "error" as const,
                    message: "No action is available.",
                  }))
            }
            clearSelection={() => {
              onRemoved?.(selection.selectedIds);
              selection.clear();
            }}
            entityName="record"
            selectedIds={selection.selectedIds}
            scope={
              table.trashKind
                ? "Move the selected records and their dependents to recoverable Trash. Reporting will update."
                : table.removal?.kind === "payment" ||
                    table.removal?.kind === "receipt"
                  ? "Clear the cash assignment. The former document and Project balances will update; the original cash remains in Unassigned cash records."
                  : "Remove only these connections. The records remain available, with these relationships unassigned."
            }
          />
        )}
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{table.title}</caption>
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              {(table.removal || table.trashKind) && (
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
                {(table.removal || table.trashKind) && (
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
                    {editingId === row.id &&
                    row.editFields?.some((field) => field.column === index) ? (
                      row.editFields
                        .filter((field) => field.column === index)
                        .map((field) =>
                          field.type === "money" ? (
                            <span
                              key={field.name}
                              className="inline-flex items-center gap-1"
                            >
                              <InlineMoneyInput
                                ariaLabel={table.columns[index] ?? field.name}
                                value={fieldDraft[field.name] ?? ""}
                                disabled={pending}
                                onChange={(value) =>
                                  setFieldDraft((current) => ({
                                    ...current,
                                    [field.name]: value,
                                  }))
                                }
                              />
                              {field.currency ? (
                                <span className="text-muted-foreground text-xs">
                                  {field.currency}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <input
                              key={field.name}
                              type="date"
                              aria-label={table.columns[index]}
                              className="border-input bg-background rounded border px-2 py-1"
                              value={fieldDraft[field.name] ?? ""}
                              disabled={pending}
                              onChange={(event) =>
                                setFieldDraft((current) => ({
                                  ...current,
                                  [field.name]: event.target.value,
                                }))
                              }
                            />
                          ),
                        )
                    ) : index === 0 &&
                      editingId === row.id &&
                      !table.editKind?.startsWith("allocation") ? (
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
                          setDraft(row.editValue ?? row.cells[0] ?? "");
                          setFieldDraft(
                            Object.fromEntries(
                              (row.editFields ?? []).map((field) => [
                                field.name,
                                field.value,
                              ]),
                            ),
                          );
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
                    (table.removal || table.trashKind ? 1 : 0)
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
