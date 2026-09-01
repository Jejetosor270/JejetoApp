"use client";

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
  InlineEditActions,
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

interface PaymentInstallmentRow {
  actualDate: string | null;
  clientName: string;
  currencyCode: string;
  direction: "CLIENT_RECEIPT" | "SUPPLIER_PAYMENT";
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
  const cashOut = installment.direction === "SUPPLIER_PAYMENT";
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
    <tr className="align-top">
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={`${cashOut ? "Supplier payment" : "Client receipt"} ${saved.label}`}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-3 py-2">
        <Badge variant={cashOut ? "destructive" : "default"}>
          {cashOut ? "CASH OUT" : "CASH IN"}
        </Badge>
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <InlineDateInput
            ariaLabel={`Due date for ${saved.label}`}
            onChange={(value) => set("dueDate", value)}
            value={draft.dueDate}
          />
        ) : (
          formatDateOnly(europeanInputToDateOnly(saved.dueDate))
        )}
      </td>
      <td className="px-3 py-2">{formatDateOnly(installment.actualDate)}</td>
      <td className="px-3 py-2">
        <Link
          className="font-medium hover:underline"
          href={`/orders/${installment.orderId}#payments`}
        >
          {installment.projectName}
        </Link>
        <p className="text-muted-foreground font-mono text-xs">
          {installment.orderNumber}
        </p>
      </td>
      <td className="px-3 py-2">
        {cashOut ? installment.supplierName : installment.clientName}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="grid gap-1">
            <InlineTextInput
              ariaLabel={`Installment label for ${installment.orderNumber}`}
              onChange={(value) => set("label", value)}
              value={draft.label}
            />
            <InlineTextInput
              ariaLabel={`Notes for ${saved.label}`}
              className="w-48"
              onChange={(value) => set("notes", value)}
              value={draft.notes}
            />
          </div>
        ) : (
          <>
            {saved.label}
            {saved.notes ? (
              <p className="text-muted-foreground mt-0.5 max-w-48 truncate text-xs">
                {saved.notes}
              </p>
            ) : null}
          </>
        )}
      </td>
      <td className="financial-figure px-3 py-2 text-right">
        {editing ? (
          <InlineMoneyInput
            ariaLabel={`Scheduled amount for ${saved.label}`}
            onChange={(value) => set("scheduledAmount", value)}
            value={draft.scheduledAmount}
          />
        ) : (
          formatMoney(saved.scheduledAmount, installment.currencyCode)
        )}
      </td>
      <td className="financial-figure px-3 py-2 text-right">
        {formatMoney(installment.paidAmount, installment.currencyCode)}
      </td>
      <td className="financial-figure px-3 py-2 text-right">
        {formatMoney(saved.outstandingAmount, installment.currencyCode)}
      </td>
      <td className="px-3 py-2">
        <Badge variant={saved.status === "OVERDUE" ? "destructive" : "outline"}>
          {saved.status.replaceAll("_", " ")}
        </Badge>
      </td>
      {canEdit ? (
        <td className="px-3 py-2">
          <InlineEditActions
            editing={editing}
            feedback={feedback}
            onCancel={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(false);
            }}
            onEdit={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(true);
            }}
            onSave={save}
            pending={pending}
          />
        </td>
      ) : null}
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
          scope="Deleting the selected payment or receipt installments will also permanently delete all associated settlement and payment-history records."
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[86rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  disabled={installments.length === 0}
                  onChange={selection.toggleAll}
                />
              ) : null}
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Project / Order</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Installment / notes</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2 text-right">Paid / Received</th>
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
                  colSpan={canEdit ? 12 : 10}
                >
                  No payment installments match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
