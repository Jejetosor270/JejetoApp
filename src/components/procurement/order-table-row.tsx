"use client";
import type { ReactNode } from "react";
import { saveTableCellAction } from "@/app/(app)/cell-actions";
import { saveRecordStatusAction } from "@/app/(app)/payments/record-status-actions";
import {
  EditableCell,
  SourceCell,
} from "@/components/inline-editing/editable-cell";
import { SelectionCell } from "@/components/bulk-actions/bulk-selection";
import { tableRowClassName } from "@/components/listing/table-styles";
import {
  orderViewColumns,
  orderSortLabels,
  orderNumericColumns,
  type OrderViewMode,
  type OrderSort,
} from "@/config/order-list";
import { carriers, carrierName } from "@/config/carriers";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import {
  recordPaymentStatusLabel,
  manualPaymentStatuses,
} from "@/domain/payments/record-status";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { CellEditInput } from "@/domain/listing/cell-edit";
import type { OrderSummary } from "@/lib/procurement/orders";

export interface OrderTableOptions {
  projects: {
    id: string;
    name: string;
    orderPackages: { id: string; name: string; isActive: boolean }[];
  }[];
  suppliers: { id: string; displayName: string }[];
}
export function OrderRow({
  canEdit,
  isSelected,
  onSelect,
  order,
  statuses,
  view,
  options = { projects: [], suppliers: [] },
}: {
  canEdit: boolean;
  isSelected: boolean;
  onSelect: () => void;
  order: OrderSummary;
  statuses: readonly string[];
  view: OrderViewMode;
  options?: OrderTableOptions;
}) {
  const editable = canEdit && order.status !== "CANCELLED";
  const recordHref = `/orders/${order.id}`;
  const editorHref = `${recordHref}?edit=1`;
  const paymentsHref = `${recordHref}?tab=related#payments`;
  type Field = Extract<CellEditInput, { kind: "order" }>["field"];
  function cell(
    field: Field,
    label: string,
    value: string | null | undefined,
    display: ReactNode,
    extra: Partial<
      Pick<
        React.ComponentProps<typeof EditableCell>,
        "type" | "options" | "href" | "hint"
      >
    > = {},
  ) {
    return (
      <EditableCell
        label={`${label} for ${order.orderNumber}`}
        value={value ?? ""}
        display={display}
        canEdit={editable}
        onSave={(next, previous) =>
          saveTableCellAction({
            kind: "order",
            id: order.id,
            field,
            value: next,
            previous,
          })
        }
        {...extra}
      />
    );
  }
  const source = (field: OrderSort, content: ReactNode, href = editorHref) => (
    <SourceCell
      label={`${orderSortLabels[field]} for ${order.orderNumber}`}
      href={href}
      canEdit={editable}
    >
      {content}
    </SourceCell>
  );
  function content(field: OrderSort) {
    const money = (value: string | null, currency = order.orderCurrencyCode) =>
      formatMoney(value, currency);
    switch (field) {
      case "reference":
        return cell(
          "orderNumber",
          "Reference",
          order.orderNumber,
          order.orderNumber,
          { href: recordHref },
        );
      case "project":
        return cell(
          "projectId",
          "Project",
          order.project.id,
          order.project.name,
          {
            type: "select",
            options: options.projects.map((project) => ({
              value: project.id,
              label: project.name,
            })),
            hint: "Changing Project can change inherited pricing. Existing linked records must be reconciled first.",
          },
        );
      case "supplier":
        return cell(
          "supplierId",
          "Supplier",
          order.supplier.id,
          order.supplier.displayName,
          {
            type: "select",
            options: options.suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.displayName,
            })),
          },
        );
      case "package":
        return cell(
          "packageId",
          "Package",
          order.packageId,
          order.orderPackage?.name ?? "Unassigned",
          {
            type: "select",
            options: [
              { value: "", label: "Unassigned" },
              ...(
                options.projects.find(
                  (project) => project.id === order.project.id,
                )?.orderPackages ?? []
              )
                .filter((item) => item.isActive || item.id === order.packageId)
                .map((item) => ({ value: item.id, label: item.name })),
            ],
          },
        );
      case "status":
        return cell(
          "status",
          "Delivery status",
          order.status,
          formatEnumLabel(order.status),
          {
            type: "select",
            options: statuses
              .filter((status) => status !== "CANCELLED")
              .map((status) => ({
                value: status,
                label: formatEnumLabel(status),
              })),
          },
        );
      case "invoiceDate":
        return cell(
          "invoiceDate",
          "Invoice date",
          order.invoiceDate,
          formatDateOnly(order.invoiceDate),
          { type: "date" },
        );
      case "expectedReady":
        return cell(
          "expectedReadyDate",
          "Expected ready",
          order.expectedReadyDate,
          formatDateOnly(order.expectedReadyDate),
          { type: "date" },
        );
      case "expectedDelivery":
        return cell(
          "expectedDeliveryDate",
          "Expected delivery",
          order.expectedDeliveryDate,
          formatDateOnly(order.expectedDeliveryDate),
          { type: "date" },
        );
      case "tracking":
        return cell(
          "trackingReference",
          "Tracking reference",
          order.trackingReference,
          order.trackingReference || "—",
        );
      case "carrier":
        return (
          <div className="space-y-1">
            {cell(
              "carrierCode",
              "Carrier",
              order.carrierCode,
              carrierName(order.carrierCode, order.carrierOtherName),
              {
                type: "select",
                options: [
                  { value: "", label: "Not selected" },
                  ...carriers.map((carrier) => ({
                    value: carrier.code,
                    label: carrier.name,
                  })),
                  { value: "OTHER", label: "Other" },
                ],
              },
            )}
            {order.carrierCode === "OTHER" ? (
              cell(
                "carrierOtherName",
                "Other carrier name",
                order.carrierOtherName,
                order.carrierOtherName || "Enter name",
              )
            ) : (
              <SourceCell
                href={editorHref}
                label="Other carrier details"
                canEdit={editable}
              >
                <span className="text-muted-foreground text-xs">
                  Other carrier…
                </span>
              </SourceCell>
            )}
          </div>
        );
      case "purchase":
        return cell(
          "purchaseCost",
          "Purchase HT",
          order.costs.purchaseCost,
          money(order.costs.purchaseCost),
          {
            type: "money",
            hint: "Updates costs and calculated pricing. Existing payment terms and input VAT stay unchanged.",
          },
        );
      case "economicCost":
        return source(
          field,
          money(
            order.costs.reportingEconomicLandedCost,
            order.project.reportingCurrencyCode,
          ),
        );
      case "sell":
        return source(
          field,
          money(
            order.costs.reportingSellingRevenue,
            order.project.reportingCurrencyCode,
          ),
        );
      case "markup":
        return source(field, formatRate(order.costs.markupRate));
      case "payable":
        return source(field, money(order.supplierPayment.totalPayable));
      case "scheduled":
        return source(
          field,
          money(order.supplierPayment.scheduled),
          paymentsHref,
        );
      case "paid":
        return source(field, money(order.supplierPayment.paid), paymentsHref);
      case "outstanding":
        return source(
          field,
          money(order.supplierPayment.outstanding),
          paymentsHref,
        );
      case "dueDate":
        return source(
          field,
          formatDateOnly(order.supplierPayment.nextDueDate),
          paymentsHref,
        );
      case "paymentStatus":
        return (
          <EditableCell
            label={`Payment status for ${order.orderNumber}`}
            value={order.paymentStatusOverride ?? "AUTO"}
            display={recordPaymentStatusLabel(
              order.supplierPayment.status,
              order.paymentStatusOverride,
              order.status === "CANCELLED",
            )}
            canEdit={editable}
            type="select"
            options={[
              {
                value: "AUTO",
                label: `Automatic · ${recordPaymentStatusLabel(order.supplierPayment.status)}`,
              },
              ...manualPaymentStatuses.map((status) => ({
                value: status,
                label: `${formatEnumLabel(status)} (manual)`,
              })),
            ]}
            hint="Manual status changes the label only, not cash or balances."
            onSave={async (value) => {
              const result = await saveRecordStatusAction({
                kind: "order",
                id: order.id,
                value,
              });
              return {
                status: result.status === "success" ? "success" : "error",
                ...(result.message ? { message: result.message } : {}),
              };
            }}
          />
        );
      default:
        return null;
    }
  }
  return (
    <tr className={tableRowClassName}>
      {canEdit && (
        <SelectionCell
          checked={isSelected}
          label={`Order ${order.orderNumber}`}
          onChange={onSelect}
        />
      )}
      {orderViewColumns[view].map((field) => (
        <td
          key={field}
          className={`px-4 py-3 ${orderNumericColumns.includes(field) ? "financial-figure text-right" : ""} ${field === "reference" ? "font-mono text-xs" : ""}`}
        >
          {content(field)}
        </td>
      ))}
    </tr>
  );
}
