"use client";
import { RecordPaymentStatus } from "@/components/payments/record-payment-status";

import { carriers, carrierName } from "@/config/carriers";
import Link from "next/link";
import { useState, useTransition } from "react";
import { updateOrderInlineAction } from "@/app/(app)/orders/actions";
import { SelectionCell } from "@/components/bulk-actions/bulk-selection";
import {
  InlineDateInput,
  InlineEditActions,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { tableRowClassName } from "@/components/listing/table-styles";
import {
  dateOnlyToEuropeanInput,
  europeanInputToDateOnly,
  formatDateOnly,
} from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { OrderViewMode } from "./order-table";

function serverDate(value: string): string {
  if (!value.trim()) return "";
  return europeanInputToDateOnly(value) ?? value;
}

export function OrderRow({
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
    carrierCode: order.carrierCode ?? "",
    carrierOtherName: order.carrierOtherName ?? "",
    trackingReference: order.trackingReference ?? "",
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
    if (pending) return;
    const data = new FormData();
    data.set("id", order.id);
    data.set("orderNumber", draft.orderNumber);
    data.set("status", draft.status);
    data.set("expectedReadyDate", serverDate(draft.expectedReadyDate));
    data.set("expectedDeliveryDate", serverDate(draft.expectedDeliveryDate));
    if (view === "delivery") {
      data.set("carrierCode", draft.carrierCode);
      data.set(
        "carrierOtherName",
        draft.carrierCode === "OTHER" ? draft.carrierOtherName : "",
      );
      data.set("trackingReference", draft.trackingReference);
    }
    startTransition(async () => {
      const result = await updateOrderInlineAction(data);
      setFeedback(result.message ?? "");
      if (result.status === "success" && result.values) {
        const next = {
          carrierCode: result.values.carrierCode ?? "",
          carrierOtherName: result.values.carrierOtherName ?? "",
          trackingReference: result.values.trackingReference ?? "",
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
  const reference = editing ? (
    <InlineTextInput
      disabled={pending}
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
  );
  const status = editing ? (
    <InlineSelect
      disabled={pending}
      ariaLabel={`Delivery status for ${saved.orderNumber}`}
      onChange={(value) => set("status", value)}
      value={draft.status}
    >
      {statuses
        .filter(
          (status) => status !== "CANCELLED" || saved.status === "CANCELLED",
        )
        .map((status) => (
          <option key={status} value={status}>
            {formatEnumLabel(status)}
          </option>
        ))}
    </InlineSelect>
  ) : (
    formatEnumLabel(saved.status)
  );
  const readyDate = editing ? (
    <InlineDateInput
      ariaLabel={`Expected ready date for ${saved.orderNumber}`}
      disabled={pending}
      onChange={(value) => set("expectedReadyDate", value)}
      value={draft.expectedReadyDate}
    />
  ) : (
    formatDateOnly(europeanInputToDateOnly(saved.expectedReadyDate))
  );
  const deliveryDate = editing ? (
    <InlineDateInput
      ariaLabel={`Expected delivery date for ${saved.orderNumber}`}
      disabled={pending}
      onChange={(value) => set("expectedDeliveryDate", value)}
      value={draft.expectedDeliveryDate}
    />
  ) : (
    formatDateOnly(europeanInputToDateOnly(saved.expectedDeliveryDate))
  );
  const actionsCell = canEdit ? (
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
  ) : null;
  const extraFields = editing ? (
    <div className="mt-3 grid gap-2 font-sans text-xs font-normal">
      <label className="grid gap-1">Delivery status{status}</label>
      <label className="grid gap-1">Ready date{readyDate}</label>
      <label className="grid gap-1">Delivery date{deliveryDate}</label>
    </div>
  ) : null;
  const selectionCell = canEdit ? (
    <SelectionCell
      checked={isSelected}
      label={`Order ${saved.orderNumber}`}
      onChange={onSelect}
    />
  ) : null;
  if (view === "financial") {
    return (
      <tr className={tableRowClassName}>
        {selectionCell}
        <td className="px-4 py-3 font-mono text-xs">
          {reference}
          {extraFields}
        </td>
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3">{order.project.name}</td>
        <td className="px-4 py-3">
          {order.orderPackage?.name ?? "Unassigned"}
        </td>
        <td className="financial-figure px-4 py-3 text-right">
          {formatMoney(cost.purchaseCost, order.orderCurrencyCode)}
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
          {formatRate(cost.markupRate)}
        </td>
        {actionsCell}
      </tr>
    );
  }
  if (view === "supplier-payment") {
    return (
      <tr className={tableRowClassName}>
        {selectionCell}
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3 font-mono text-xs">
          {reference}
          {extraFields}
        </td>
        <td className="px-4 py-3">{order.project.name}</td>
        <td className="px-4 py-3">
          {order.orderPackage?.name ?? "Unassigned"}
        </td>
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
          <RecordPaymentStatus
            key={`${order.id}:${order.paymentStatusOverride}:${order.status}`}
            kind="order"
            id={order.id}
            automatic={order.supplierPayment.status}
            override={order.paymentStatusOverride}
            cancelled={order.status === "CANCELLED"}
            canEdit={canEdit && !editing}
          />
        </td>
        {actionsCell}
      </tr>
    );
  }
  if (view === "delivery") {
    return (
      <tr className={tableRowClassName}>
        {selectionCell}
        <td className="px-4 py-3 font-mono text-xs">{reference}</td>
        <td className="px-4 py-3">{status}</td>
        <td className="px-4 py-3">{readyDate}</td>
        <td className="px-4 py-3">{deliveryDate}</td>
        <td className="px-4 py-3">{order.supplier.displayName}</td>
        <td className="px-4 py-3">{order.project.name}</td>
        <td className="px-4 py-3">
          {order.orderPackage?.name ?? "Unassigned"}
        </td>
        <td className="min-w-44 px-4 py-3">
          {editing ? (
            <div className="grid gap-2">
              <InlineSelect
                disabled={pending}
                ariaLabel={`Carrier for ${saved.orderNumber}`}
                value={draft.carrierCode}
                onChange={(value) => set("carrierCode", value)}
              >
                <option value="">Not selected</option>
                {carriers.map((carrier) => (
                  <option key={carrier.code} value={carrier.code}>
                    {carrier.name}
                  </option>
                ))}
                <option value="OTHER">Other</option>
              </InlineSelect>
              {draft.carrierCode === "OTHER" && (
                <InlineTextInput
                  disabled={pending}
                  ariaLabel={`Other carrier name for ${saved.orderNumber}`}
                  value={draft.carrierOtherName}
                  onChange={(value) => set("carrierOtherName", value)}
                />
              )}
            </div>
          ) : (
            carrierName(saved.carrierCode, saved.carrierOtherName)
          )}
        </td>
        <td className="min-w-44 px-4 py-3 break-all">
          {editing ? (
            <InlineTextInput
              disabled={pending}
              ariaLabel={`Tracking reference for ${saved.orderNumber}`}
              value={draft.trackingReference}
              onChange={(value) => set("trackingReference", value)}
            />
          ) : (
            saved.trackingReference || "—"
          )}
        </td>
        {actionsCell}
      </tr>
    );
  }
  return (
    <tr className={tableRowClassName}>
      {selectionCell}
      <td className="px-4 py-3 font-mono text-xs">{reference}</td>
      <td className="px-4 py-3">{order.project.name}</td>
      <td className="px-4 py-3">{order.orderPackage?.name ?? "Unassigned"}</td>
      <td className="px-4 py-3">{order.supplier.displayName}</td>
      <td className="px-4 py-3">{status}</td>
      <td className="financial-figure px-4 py-3 text-right">
        {formatMoney(cost.purchaseCost, order.orderCurrencyCode)}
      </td>
      <td className="px-4 py-3">
        <RecordPaymentStatus
          key={`${order.id}:${order.paymentStatusOverride}:${order.status}`}
          kind="order"
          id={order.id}
          automatic={order.supplierPayment.status}
          override={order.paymentStatusOverride}
          cancelled={order.status === "CANCELLED"}
          canEdit={canEdit && !editing}
        />
      </td>
      <td className="px-4 py-3">{formatDateOnly(order.invoiceDate)}</td>
      <td className="px-4 py-3">
        {formatDateOnly(order.supplierPayment.nextDueDate)}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs">
              Ready date
              {readyDate}
            </label>
            <label className="grid gap-1 text-xs">
              Delivery date
              {deliveryDate}
            </label>
          </div>
        ) : (
          formatDateOnly(europeanInputToDateOnly(saved.expectedDeliveryDate))
        )}
      </td>
      {actionsCell}
    </tr>
  );
}
