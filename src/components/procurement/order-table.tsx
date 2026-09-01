"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  deleteSelectedOrdersAction,
  updateOrderInlineAction,
} from "@/app/(app)/orders/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineDateInput,
  InlineEditActions,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import {
  dateOnlyToEuropeanInput,
  europeanInputToDateOnly,
  formatDateOnly,
} from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";

export type OrderViewMode =
  "general" | "financial" | "supplier-payment" | "delivery";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function serverDate(value: string): string {
  if (!value.trim()) return "";
  return europeanInputToDateOnly(value) ?? value;
}

function OrderRow({
  canEdit,
  isSelected,
  onSelect,
  order,
  statuses,
  view,
}: {
  canEdit: boolean;
  isSelected: boolean;
  onSelect: () => void;
  order: OrderSummary;
  statuses: readonly string[];
  view: OrderViewMode;
}) {
  const initial = () => ({
    expectedDeliveryDate: dateOnlyToEuropeanInput(order.expectedDeliveryDate),
    expectedReadyDate: dateOnlyToEuropeanInput(order.expectedReadyDate),
    orderNumber: order.orderNumber,
    status: order.status,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const cost = order.costs;
  const set = (field: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = () => {
    const data = new FormData();
    data.set("id", order.id);
    data.set("orderNumber", draft.orderNumber);
    data.set("status", draft.status);
    data.set("expectedReadyDate", serverDate(draft.expectedReadyDate));
    data.set("expectedDeliveryDate", serverDate(draft.expectedDeliveryDate));
    startTransition(async () => {
      const result = await updateOrderInlineAction(data);
      setFeedback(result.message ?? "");
      if (result.status === "success" && result.values) {
        const next = {
          expectedDeliveryDate: dateOnlyToEuropeanInput(
            result.values.expectedDeliveryDate,
          ),
          expectedReadyDate: dateOnlyToEuropeanInput(
            result.values.expectedReadyDate,
          ),
          orderNumber: result.values.orderNumber,
          status: result.values.status,
        };
        setSaved(next);
        setDraft(next);
        setEditing(false);
      }
    });
  };
  const selectionCell = canEdit ? (
    <SelectionCell
      checked={isSelected}
      label={`Order ${saved.orderNumber}`}
      onChange={onSelect}
    />
  ) : null;
  if (view === "financial") {
    const other = [cost.customsDuties, cost.miscellaneous]
      .filter((value): value is string => value !== null)
      .reduce((sum, value) => sum.plus(value), new Decimal(0));
    return (
      <tr className="hover:bg-muted/25 align-top">
        {selectionCell}
        <td className="px-4 py-3 font-mono text-xs">
          <Link href={`/orders/${order.id}`}>{order.orderNumber}</Link>
        </td>
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3">{order.project.name}</td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(cost.purchaseCost, order.orderCurrencyCode)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(cost.freight, order.orderCurrencyCode)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(other.toString(), order.orderCurrencyCode)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            cost.reportingEconomicLandedCost,
            order.project.reportingCurrencyCode,
          )}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            cost.reportingSellingRevenue,
            order.project.reportingCurrencyCode,
          )}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.billing.quotedAllocated,
            order.project.reportingCurrencyCode,
          )}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.billing.invoicedAllocated,
            order.project.reportingCurrencyCode,
          )}
          {!order.billing.conversionComplete ? (
            <span className="text-destructive block text-[0.6875rem]">
              Missing billing FX
            </span>
          ) : null}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatRate(order.billing.actualMarkupRate ?? cost.markupRate)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatRate(order.billing.actualMarginRate ?? cost.grossMarginRate)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.billing.actualGrossProfit ?? cost.grossProfit,
            order.project.reportingCurrencyCode,
          )}
        </td>
        {canEdit ? <td /> : null}
      </tr>
    );
  }
  if (view === "supplier-payment") {
    return (
      <tr className="hover:bg-muted/25 align-top">
        {selectionCell}
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3 font-mono text-xs">
          <Link href={`/orders/${order.id}`}>{order.orderNumber}</Link>
        </td>
        <td className="px-4 py-3">{order.project.name}</td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.supplierPayment.totalPayable,
            order.orderCurrencyCode,
          )}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.supplierPayment.scheduled,
            order.orderCurrencyCode,
          )}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(order.supplierPayment.paid, order.orderCurrencyCode)}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(
            order.supplierPayment.outstanding,
            order.orderCurrencyCode,
          )}
        </td>
        <td className="px-4 py-3">
          {formatDateOnly(order.supplierPayment.nextDueDate)}
        </td>
        <td className="px-4 py-3">
          {order.supplierPayment.status.replaceAll("_", " ")}
        </td>
        {canEdit ? <td /> : null}
      </tr>
    );
  }
  if (view === "delivery") {
    return (
      <tr className="hover:bg-muted/25 align-top">
        {selectionCell}
        <td className="px-4 py-3 font-mono text-xs">
          <Link href={`/orders/${order.id}`}>{order.orderNumber}</Link>
        </td>
        <td className="px-4 py-3">{saved.status.replaceAll("_", " ")}</td>
        <td className="px-4 py-3">{formatDateOnly(order.expectedReadyDate)}</td>
        <td className="px-4 py-3">
          {formatDateOnly(order.expectedDeliveryDate)}
        </td>
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3">{order.project.name}</td>
        {canEdit ? <td /> : null}
      </tr>
    );
  }
  return (
    <tr className="hover:bg-muted/25 align-top">
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={`Order ${saved.orderNumber}`}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3 font-mono text-xs">
        {editing ? (
          <InlineTextInput
            ariaLabel={`Internal reference for ${saved.orderNumber}`}
            onChange={(value) => set("orderNumber", value)}
            value={draft.orderNumber}
          />
        ) : (
          <Link
            className="hover:text-primary underline-offset-4 hover:underline"
            href={`/orders/${order.id}`}
          >
            {saved.orderNumber}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 font-medium">
        {order.packageName}
        <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
          Buy {order.orderCurrencyCode} · sell {order.sellingCurrencyCode}
        </span>
      </td>
      <td className="px-4 py-3">{order.project.name}</td>
      <td className="px-4 py-3">{order.supplier.displayName}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineSelect
            ariaLabel={`Status for ${saved.orderNumber}`}
            onChange={(value) => set("status", value)}
            value={draft.status}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </InlineSelect>
        ) : (
          saved.status.replaceAll("_", " ")
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineDateInput
            ariaLabel={`Expected ready date for ${saved.orderNumber}`}
            onChange={(value) => set("expectedReadyDate", value)}
            value={draft.expectedReadyDate}
          />
        ) : (
          formatDateOnly(europeanInputToDateOnly(saved.expectedReadyDate))
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineDateInput
            ariaLabel={`Expected delivery date for ${saved.orderNumber}`}
            onChange={(value) => set("expectedDeliveryDate", value)}
            value={draft.expectedDeliveryDate}
          />
        ) : (
          formatDateOnly(europeanInputToDateOnly(saved.expectedDeliveryDate))
        )}
      </td>
      <td className="text-muted-foreground max-w-48 truncate px-4 py-3">
        {order.buildings.join(", ") || "—"}
      </td>
      <td className="financial-figure px-4 py-3 text-right">
        {formatMoney(
          cost.reportingEconomicLandedCost,
          order.project.reportingCurrencyCode,
        )}
      </td>
      <td className="financial-figure px-4 py-3 text-right">
        {formatMoney(
          cost.reportingSellingRevenue,
          order.project.reportingCurrencyCode,
        )}
        {cost.outputVat ? (
          <span className="text-muted-foreground block text-xs">
            {cost.outputVat.treatment.replaceAll("_", " ")}
          </span>
        ) : null}
      </td>
      <td className="financial-figure px-4 py-3 text-right font-medium">
        {formatRate(cost.grossMarginRate)}
      </td>
      <td className="text-muted-foreground px-4 py-3 text-xs">
        {dateLabel(order.updatedAt)}
      </td>
      {canEdit ? (
        <td className="px-4 py-3">
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

export function OrderTable({
  canEdit,
  orders,
  statuses,
  view,
}: {
  canEdit: boolean;
  orders: OrderSummary[];
  statuses: readonly string[];
  view: OrderViewMode;
}) {
  const selection = useBulkSelection(orders.map((order) => order.id));
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      {canEdit ? (
        <BulkActionBar
          action={deleteSelectedOrdersAction}
          clearSelection={selection.clear}
          entityName="Order"
          scope="Deleting the selected Orders will also permanently delete all related Supplier Payment and Client Receipt schedules, settlements, quote-import history, VAT and cost records, Building links, and other Order-owned data. Suppliers, Projects, and Clients are preserved."
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[74rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  disabled={orders.length === 0}
                  onChange={selection.toggleAll}
                />
              ) : null}
              {view === "general" ? (
                <>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expected ready</th>
                  <th className="px-4 py-3">Expected delivery</th>
                  <th className="px-4 py-3">Buildings</th>
                  <th className="px-4 py-3 text-right">Economic landed cost</th>
                  <th className="px-4 py-3 text-right">Selling revenue</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3">Updated</th>
                </>
              ) : view === "financial" ? (
                <>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3 text-right">Purchase HT</th>
                  <th className="px-4 py-3 text-right">Freight HT</th>
                  <th className="px-4 py-3 text-right">Other costs</th>
                  <th className="px-4 py-3 text-right">Economic cost</th>
                  <th className="px-4 py-3 text-right">Planned sell</th>
                  <th className="px-4 py-3 text-right">Quoted allocated</th>
                  <th className="px-4 py-3 text-right">Invoiced allocated</th>
                  <th className="px-4 py-3 text-right">Markup</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-right">Gross profit</th>
                </>
              ) : view === "supplier-payment" ? (
                <>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Order reference</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3 text-right">Payable</th>
                  <th className="px-4 py-3 text-right">Scheduled</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3">Payment status</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expected ready</th>
                  <th className="px-4 py-3">Expected delivery</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Project</th>
                </>
              )}
              {canEdit ? <th className="px-4 py-3 text-right">Edit</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => (
              <OrderRow
                canEdit={canEdit}
                isSelected={selection.isSelected(order.id)}
                key={order.id}
                onSelect={() => selection.toggle(order.id)}
                order={order}
                statuses={statuses}
                view={view}
              />
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No procurement orders yet.
        </p>
      ) : null}
    </section>
  );
}
