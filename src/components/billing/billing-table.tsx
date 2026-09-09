"use client";
import { trashSelectedAction } from "@/app/(app)/settings/trash/actions";
import {
  BulkActionBar,
  SelectionHeader,
  SelectionCell,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { ListEmptyState } from "@/components/listing/empty-state";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateClientBillingInlineAction } from "@/app/(app)/billing/actions";
import {
  InlineEditActions,
  InlineTextInput,
  InlineSelect,
} from "@/components/inline-editing/inline-edit";
import { DateInput } from "@/components/forms/date-input";
import { SortHeader } from "@/components/listing/sort-header";
import { useRouter } from "next/navigation";

import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { ClientBillingView } from "@/lib/billing/billing";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";

function BillingRow({
  canEdit,
  document,
  selected,
  onSelect,
}: {
  canEdit: boolean;
  document: ClientBillingView;
  selected: boolean;
  onSelect: () => void;
  view?: "commercial" | "collection";
}) {
  const router = useRouter();
  const href = `/billing/${document.id}`;
  const initial = () => ({
    reference: document.reference,
    dueDate: document.dueDate ?? "",
    isCancelled: String(document.isCancelled),
    notes: document.notes ?? "",
  });
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const save = () =>
    startTransition(async () => {
      const data = new FormData();
      data.set("id", document.id);
      Object.entries(draft).forEach(([key, value]) => data.set(key, value));
      const result = await updateClientBillingInlineAction(data);
      setFeedback(result.message ?? "");
      if (result.status === "success") {
        setEditing(false);
        router.refresh();
      }
    });
  return (
    <tr
      className="hover:bg-muted/30 cursor-pointer align-top"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, form")) return;
        router.push(href);
      }}
    >
      {canEdit && (
        <SelectionCell
          checked={selected}
          onChange={onSelect}
          label={document.reference}
        />
      )}
      <td className="px-3 py-3 font-mono text-xs">
        {editing ? (
          <InlineTextInput
            ariaLabel="Reference"
            value={draft.reference}
            disabled={pending}
            onChange={(reference) => setDraft({ ...draft, reference })}
          />
        ) : (
          <Link className="underline-offset-2 hover:underline" href={href}>
            {document.reference}
          </Link>
        )}
        <span className="text-muted-foreground mt-1 block font-sans">
          {document.documentType === "QUOTE" ? "Quote / Devis" : "Invoice"}
          {document.isCancelled ? " · Cancelled" : ""}
        </span>
      </td>
      <td className="px-3 py-3">
        {document.client.displayName}
        <span className="text-muted-foreground mt-1 block text-xs">
          {document.project.name}
        </span>
      </td>

      <td className="px-3 py-3">
        {editing ? (
          <DateInput
            aria-label="Due date"
            value={draft.dueDate}
            disabled={pending}
            onChange={(event) =>
              setDraft({ ...draft, dueDate: event.target.value })
            }
          />
        ) : (
          formatDateOnly(document.dueDate)
        )}
      </td>

      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.totalHt, document.currencyCode)}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.totalTtc, document.currencyCode)}
      </td>

      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.paid, document.currencyCode)}
      </td>

      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.outstanding, document.currencyCode)}
      </td>
      <td className="px-3 py-3">
        {formatEnumLabel(document.status)}
        {editing && (
          <InlineSelect
            ariaLabel="Record status"
            value={draft.isCancelled}
            disabled={pending}
            onChange={(isCancelled) => setDraft({ ...draft, isCancelled })}
          >
            <option value="false">Active</option>
            <option value="true">Cancelled</option>
          </InlineSelect>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {canEdit ? (
          <InlineEditActions
            editing={editing}
            pending={pending}
            feedback={feedback}
            onEdit={() => {
              setDraft(initial());
              setFeedback("");
              setEditing(true);
            }}
            onCancel={() => {
              setDraft(initial());
              setEditing(false);
              setFeedback("");
            }}
            onSave={save}
          />
        ) : null}
      </td>
    </tr>
  );
}

export function BillingTable({
  canEdit,
  documents,
}: {
  canEdit: boolean;
  documents: ClientBillingView[];
  view?: "commercial" | "collection";
}) {
  const selection = useBulkSelection(documents.map((row) => row.id));
  return (
    <section className={tableContainerClassName}>
      {canEdit && (
        <BulkActionBar
          action={trashSelectedAction.bind(null, "billing")}
          clearSelection={selection.clear}
          entityName="Billing record"
          scope="Move the selected Billing records, their installments and linked receipts to Trash. Financial reports will be recalculated. Related records are restored together from Settings."
          selectedIds={selection.selectedIds}
        />
      )}
      <div
        className="max-h-[70svh] overflow-auto"
        role="region"
        aria-label="Billing table"
        tabIndex={0}
      >
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className={tableHeaderClassName}>
            <tr>
              {canEdit && (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={!documents.length}
                  onChange={selection.toggleAll}
                />
              )}
              <SortHeader
                className="px-3 py-3"
                label="Reference"
                field="reference"
                defaultSort="updated"
                defaultDirection="desc"
              />
              <th className="px-3 py-3">Client / Project</th>

              <SortHeader
                className="px-3 py-3"
                label="Due"
                field="dueDate"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <th className="px-3 py-3 text-right">HT</th>

              <th className="px-3 py-3 text-right">TTC</th>

              <th className="px-3 py-3 text-right">Received</th>

              <th className="px-3 py-3 text-right">Outstanding</th>

              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((document) => (
              <BillingRow
                canEdit={canEdit}
                document={document}
                selected={selection.isSelected(document.id)}
                onSelect={() => selection.toggle(document.id)}
                key={document.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {documents.length === 0 ? (
        <ListEmptyState entity="Billing documents" />
      ) : null}
    </section>
  );
}
