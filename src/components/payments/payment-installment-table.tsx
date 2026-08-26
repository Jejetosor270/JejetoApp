"use client";

import Link from "next/link";

import { deleteSelectedInstallmentsAction } from "@/app/(app)/payments/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/domain/payments/dates";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import { formatMoney } from "@/domain/procurement/presentation";

interface PaymentInstallmentRow {
  clientName: string;
  currencyCode: string;
  direction: "CLIENT_RECEIPT" | "SUPPLIER_PAYMENT";
  dueDate: string;
  id: string;
  label: string;
  orderId: string;
  orderNumber: string;
  outstandingAmount: string;
  paidAmount: string;
  projectName: string;
  scheduledAmount: string;
  status: DerivedPaymentStatus;
  supplierName: string;
}

export function PaymentInstallmentTable({
  canEdit,
  installments,
}: {
  canEdit: boolean;
  installments: PaymentInstallmentRow[];
}) {
  const selection = useBulkSelection(installments.map((item) => item.id));
  return (
    <div className="overflow-hidden rounded-lg border">
      {canEdit ? (
        <BulkActionBar
          action={deleteSelectedInstallmentsAction}
          actionLabel="Delete selected"
          clearSelection={selection.clear}
          confirmationVerb="Permanently delete"
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[70rem] text-left text-sm">
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
              <th className="px-3 py-2">Project / Order</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Installment</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2 text-right">Paid / Received</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installments.map((item) => {
              const cashOut = item.direction === "SUPPLIER_PAYMENT";
              return (
                <tr key={item.id}>
                  {canEdit ? (
                    <SelectionCell
                      checked={selection.isSelected(item.id)}
                      label={`${cashOut ? "Supplier payment" : "Client receipt"} ${item.label}`}
                      onChange={() => selection.toggle(item.id)}
                    />
                  ) : null}
                  <td className="px-3 py-2">
                    <Badge variant={cashOut ? "destructive" : "default"}>
                      {cashOut ? "CASH OUT" : "CASH IN"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{formatDateOnly(item.dueDate)}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/orders/${item.orderId}#payments`}
                    >
                      {item.projectName}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {item.orderNumber}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {cashOut ? item.supplierName : item.clientName}
                  </td>
                  <td className="px-3 py-2">{item.label}</td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.scheduledAmount, item.currencyCode)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.paidAmount, item.currencyCode)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.outstandingAmount, item.currencyCode)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        item.status === "OVERDUE" ? "destructive" : "outline"
                      }
                    >
                      {item.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                </tr>
              );
            })}
            {installments.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center"
                  colSpan={canEdit ? 10 : 9}
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
