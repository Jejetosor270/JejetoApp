"use client";
import { financialLabels } from "@/domain/presentation/labels";
import {
  EditableCell,
  SourceCell,
} from "@/components/inline-editing/editable-cell";
import { saveTableCellAction } from "@/app/(app)/cell-actions";
import { BillingStatusControl } from "./billing-status";
import type { CellEditInput } from "@/domain/listing/cell-edit";
import type { ComponentProps, ReactNode } from "react";
import { trashSelectedAction } from "@/app/(app)/settings/trash/actions";
import {
  BulkActionBar,
  SelectionHeader,
  SelectionCell,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { ListEmptyState } from "@/components/listing/empty-state";

import { SortHeader } from "@/components/listing/sort-header";

import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";
import {
  tableContainerClassName,
  tableBodyClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";

export interface BillingTableOptions {
  clients: { id: string; displayName: string }[];
  projects: { id: string; clientId: string; name: string }[];
}
function BillingRow({
  canEdit,
  document,
  selected,
  onSelect,
  options,
}: {
  canEdit: boolean;
  document: ClientBillingView;
  selected: boolean;
  onSelect: () => void;
  options: BillingTableOptions;
}) {
  const editable = canEdit && !document.isCancelled;
  const href = `/billing/${document.id}`;
  type Field = Extract<CellEditInput, { kind: "billing" }>["field"];
  const cell = (
    field: Field,
    label: string,
    value: string | null,
    display: ReactNode,
    extra: Partial<
      Pick<
        ComponentProps<typeof EditableCell>,
        "type" | "options" | "href" | "hint"
      >
    > = {},
  ) => (
    <EditableCell
      label={`${label} for ${document.reference}`}
      value={value ?? ""}
      display={display}
      canEdit={editable}
      onSave={(next, previous) =>
        saveTableCellAction({
          kind: "billing",
          id: document.id,
          field,
          value: next,
          previous,
        })
      }
      {...extra}
    />
  );
  return (
    <tr className="hover:bg-muted/30 align-top">
      {canEdit && (
        <SelectionCell
          checked={selected}
          onChange={onSelect}
          label={document.reference}
        />
      )}
      <td className="px-3 py-3 text-sm font-medium">
        {cell(
          "reference",
          "Reference",
          document.reference,
          document.reference,
          { href },
        )}
        <span className="text-muted-foreground mt-1 block text-xs font-normal">
          {cell(
            "shortDescription",
            "Short description",
            document.shortDescription,
            document.shortDescription || (editable ? "Add description" : ""),
          )}
          {document.isCancelled ? " · Cancelled" : ""}
        </span>
      </td>
      <td className="px-3 py-3">
        {cell(
          "projectId",
          "Client / Project",
          document.projectId,
          <span>
            {document.client.displayName}
            <span className="text-muted-foreground mt-1 block text-xs">
              {document.project.name}
            </span>
          </span>,
          {
            type: "select",
            options: options.projects.map((project) => ({
              value: project.id,
              label: `${options.clients.find((client) => client.id === project.clientId)?.displayName ?? "Client"} · ${project.name}`,
            })),
            hint: "Select the Project and its Client together. Existing allocations or payments must be reconciled first.",
          },
        )}
      </td>
      <td className="px-3 py-3">
        {cell(
          "documentDate",
          "Invoice date",
          document.documentDate,
          formatDateOnly(document.documentDate),
          { type: "date" },
        )}
      </td>
      <td className="px-3 py-3">
        {cell(
          "dueDate",
          "Due date",
          document.dueDate,
          formatDateOnly(document.dueDate),
          {
            type: "date",
            hint: "Updates the earliest unpaid term only; uses the document due date when no unpaid term exists.",
          },
        )}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        {cell(
          "totalHt",
          "HT",
          document.totalHt,
          formatMoney(document.totalHt, document.currencyCode),
          {
            type: "money",
            hint: "VAT amount is preserved; TTC and percentage allocations recalculate. Use Details to change VAT. Payment limits are checked.",
          },
        )}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        <SourceCell
          href={`${href}?tab=related#schedule`}
          label={`Received for ${document.reference}`}
          canEdit={editable}
        >
          {formatMoney(document.paid, document.currencyCode)}
        </SourceCell>
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        <SourceCell
          href={`${href}?tab=related#schedule`}
          label={`Outstanding for ${document.reference}`}
          canEdit={editable}
        >
          {formatMoney(document.outstanding, document.currencyCode)}
        </SourceCell>
      </td>
      <td className="px-3 py-3">
        <BillingStatusControl
          id={document.id}
          status={document.status}
          documentType={document.documentType}
          remaining={document.outstanding}
          currency={document.currencyCode}
          canEdit={canEdit}
        />
      </td>
    </tr>
  );
}

export function BillingTable({
  canEdit,
  documents,
  options = { clients: [], projects: [] },
}: {
  canEdit: boolean;
  documents: ClientBillingView[];
  view?: "commercial" | "collection";
  options?: BillingTableOptions;
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
              <SortHeader
                className="px-3 py-3"
                label="Client / Project"
                field="project"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <SortHeader
                className="px-3 py-3"
                label="Invoice date"
                field="date"
                defaultSort="updated"
                defaultDirection="desc"
              />
              <SortHeader
                className="px-3 py-3"
                label="Due"
                field="dueDate"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <SortHeader
                className="px-3 py-3 text-right"
                label="HT"
                field="totalHt"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <SortHeader
                className="px-3 py-3 text-right"
                label={financialLabels.clientReceived}
                field="paid"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <SortHeader
                className="px-3 py-3 text-right"
                label={financialLabels.remaining}
                field="outstanding"
                defaultSort="updated"
                defaultDirection="desc"
              />

              <SortHeader
                className="px-3 py-3"
                label="Status"
                field="status"
                defaultSort="updated"
                defaultDirection="desc"
              />
            </tr>
          </thead>
          <tbody className={tableBodyClassName}>
            {documents.map((document) => (
              <BillingRow
                options={options}
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
