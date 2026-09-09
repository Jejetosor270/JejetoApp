"use client";

import { SortHeader } from "@/components/listing/sort-header";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/master-data/form-ui";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  deleteSelectedInstallmentsAction,
  updateInstallmentInlineAction,
} from "@/app/(app)/payments/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineDateInput,
  InlineMoneyInput,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { Badge } from "@/components/ui/badge";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import {
  dateOnlyToEuropeanInput,
  europeanInputToDateOnly,
  formatDateOnly,
} from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { tableHeaderClassName } from "@/components/listing/table-styles";

interface PaymentInstallmentRow {
  actualDate: string | null;
  currencyCode: string;
  dueDate: string;
  id: string;
  label: string;
  notes: string | null;
  orderId: string;
  orderNumber: string;
  outstandingAmount: string;
  paidAmount: string;
  projectName: string;
  scheduledAmount: string;
  settlementCount: number;
  status: DerivedPaymentStatus;
  supplierName: string;
}

function serverDate(value: string): string {
  if (!value.trim()) return "";
  return europeanInputToDateOnly(value) ?? value;
}

function InstallmentRow({
  canEdit,
  installment,
  isSelected,
  onSelect,
}: {
  canEdit: boolean;
  installment: PaymentInstallmentRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const initial = () => ({
    dueDate: dateOnlyToEuropeanInput(installment.dueDate),
    label: installment.label,
    notes: installment.notes ?? "",
    outstandingAmount: installment.outstandingAmount,
    scheduledAmount: installment.scheduledAmount,
    status: installment.status,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (field: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = () => {
    const data = new FormData();
    data.set("id", installment.id);
    data.set("dueDate", serverDate(draft.dueDate));
    data.set("label", draft.label);
    data.set("notes", draft.notes);
    data.set("scheduledAmount", draft.scheduledAmount);
    startTransition(async () => {
      const result = await updateInstallmentInlineAction(data);
      setFeedback(result.message);
      if (result.status === "success" && result.values) {
        const next = {
          dueDate: dateOnlyToEuropeanInput(result.values.dueDate),
          label: result.values.label,
          notes: result.values.notes ?? "",
          outstandingAmount: result.values.outstandingAmount,
          scheduledAmount: result.values.scheduledAmount,
          status: result.values.status,
        };
        setSaved(next);
        setDraft(next);
        setEditing(false);
      }
    });
  };
  return (
    <tr className="hover:bg-muted/40 align-top">
      {canEdit && (
        <SelectionCell
          checked={isSelected}
          label={saved.label}
          onChange={onSelect}
        />
      )}
      <td className="px-3 py-3">
        {formatDateOnly(europeanInputToDateOnly(saved.dueDate))}
      </td>
      <td className="px-3 py-3">{formatDateOnly(installment.actualDate)}</td>
      <td className="px-3 py-3">
        <Link
          className="font-medium hover:underline"
          href={`/orders/${installment.orderId}?tab=payments`}
        >
          {installment.projectName}
        </Link>
        <p className="text-muted-foreground text-xs">
          {installment.orderNumber}
        </p>
      </td>
      <td className="px-3 py-3">{installment.supplierName}</td>
      <td className="px-3 py-3">
        {saved.label}
        <p className="text-muted-foreground max-w-48 truncate text-xs">
          {saved.notes}
        </p>
      </td>
      {[
        saved.scheduledAmount,
        installment.paidAmount,
        saved.outstandingAmount,
      ].map((value, index) => (
        <td key={index} className="financial-figure px-3 py-3 text-right">
          {formatMoney(value, installment.currencyCode)}
        </td>
      ))}
      <td className="px-3 py-3">
        <Badge variant={saved.status === "OVERDUE" ? "destructive" : "outline"}>
          {formatEnumLabel(saved.status)}
        </Badge>
      </td>
      {canEdit && (
        <td className="px-3 py-3">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(true);
            }}
          >
            Edit
          </Button>
          {editing && (
            <EditorDrawer
              open
              title="Edit Supplier installment"
              onOpenChange={(open) => {
                if (!open) {
                  setDraft(saved);
                  setFeedback("");
                  setEditing(false);
                }
              }}
            >
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <p className="text-sm">
                  {installment.orderNumber} · {installment.supplierName}
                </p>
                <p className="bg-muted rounded-md p-3 text-sm">
                  Already paid:{" "}
                  {formatMoney(
                    installment.paidAmount,
                    installment.currencyCode,
                  )}
                  . Recorded settlements keep their own dates and FX.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Due date">
                    <InlineDateInput
                      ariaLabel="Due date"
                      onChange={(value) => set("dueDate", value)}
                      value={draft.dueDate}
                    />
                  </Field>
                  <Field
                    label={`Scheduled amount (${installment.currencyCode})`}
                  >
                    <InlineMoneyInput
                      ariaLabel="Scheduled amount"
                      onChange={(value) => set("scheduledAmount", value)}
                      value={draft.scheduledAmount}
                    />
                  </Field>
                  <Field label="Label">
                    <InlineTextInput
                      ariaLabel="Installment label"
                      onChange={(value) => set("label", value)}
                      value={draft.label}
                    />
                  </Field>
                  <Field label="Notes">
                    <InlineTextInput
                      ariaLabel="Notes"
                      onChange={(value) => set("notes", value)}
                      value={draft.notes}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save installment"}
                </Button>
                {feedback && (
                  <p role="alert" className="text-destructive text-sm">
                    {feedback}
                  </p>
                )}
              </form>
            </EditorDrawer>
          )}
        </td>
      )}
    </tr>
  );
}

export function PaymentInstallmentTable({
  canEdit,
  installments,
}: {
  canEdit: boolean;
  installments: PaymentInstallmentRow[];
}) {
  const selection = useBulkSelection(installments.map((item) => item.id));
  const affectedSettlementCount = installments
    .filter((item) => selection.selectedIds.includes(item.id))
    .reduce((total, item) => total + item.settlementCount, 0);
  return (
    <div className="overflow-hidden rounded-lg border">
      {canEdit ? (
        <BulkActionBar
          action={deleteSelectedInstallmentsAction}
          clearSelection={selection.clear}
          entityName="installment"
          impactSummary={`${affectedSettlementCount} recorded settlement${affectedSettlementCount === 1 ? "" : "s"} will also be deleted.`}
          scope="The selected records and their dependent business records will move to Trash. Their financial effects will be removed until the group is restored from Settings."
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div
        className="max-h-[70svh] overflow-auto"
        role="region"
        aria-label="Supplier Payments table"
        tabIndex={0}
      >
        <table className="w-full min-w-[76rem] text-left text-sm">
          <thead className={tableHeaderClassName}>
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={installments.length === 0}
                  onChange={selection.toggleAll}
                />
              ) : null}
              <SortHeader
                className="px-3 py-2"
                label="Due"
                field="dueDate"
                defaultSort="dueDate"
                directionKey="sortDirection"
              />
              <th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Project / Order</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Installment / notes</th>
              <SortHeader
                className="px-3 py-2 text-right"
                label="Scheduled"
                field="amount"
                defaultSort="dueDate"
                directionKey="sortDirection"
              />
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Status</th>
              {canEdit ? <th className="px-3 py-2 text-right">Edit</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {installments.map((installment) => (
              <InstallmentRow
                canEdit={canEdit}
                installment={installment}
                isSelected={selection.isSelected(installment.id)}
                key={installment.id}
                onSelect={() => selection.toggle(installment.id)}
              />
            ))}
            {installments.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center"
                  colSpan={canEdit ? 11 : 9}
                >
                  No Supplier Payment installments match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
