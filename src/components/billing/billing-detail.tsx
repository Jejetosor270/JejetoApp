"use client";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";

import {
  RelatedRecords,
  RelatedRecordTable,
} from "@/components/layout/related-records";
import {
  relatedHref,
  type RelatedTableData,
} from "@/lib/related-records/types";
import { MoneyInput } from "@/components/master-data/form-ui";

import { BillingFreightEditor } from "@/components/billing/billing-freight-editor";
import { revenueParts } from "@/domain/finance/project-control";
import { freightCoverageBreakdown } from "@/domain/billing/freight-coverage";
import { AllocationInputs } from "@/components/billing/allocation-inputs";
import {
  BillingAllocationEditor,
  type SavedBillingAllocation,
} from "@/components/billing/billing-allocation-editor";
import { DateInput } from "@/components/forms/date-input";

import Decimal from "decimal.js";
import Link from "next/link";
import {
  RecordFields,
  RecordSummary,
  RecordSectionHeading,
} from "@/components/layout/record-presentation";
import { RecordWorkspace } from "@/components/layout/record-workspace";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { SheetClose } from "@/components/ui/sheet";
import { useEffect, useMemo, useRef, useState } from "react";

import { updateClientBillingDocumentAction } from "@/app/(app)/billing/actions";
import { BillingScheduleManager } from "@/components/billing/billing-schedule-manager";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/layout/detail-page-header";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  addAllocationAmount,
  allocationReconciliation,
  calculateClientBillingAmounts,
  orderSellingBasisInBillingCurrency,
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import { amountIncludingVat } from "@/domain/finance/calculations";
import {
  businessToday,
  formatDateOnly,
  formatTimestamp,
} from "@/domain/payments/dates";
import {
  formatFxRate,
  formatMoney,
  formatRate,
} from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { normalizeDecimalInput } from "@/domain/validation/numeric";
import type { ClientBillingView } from "@/lib/billing/billing";

interface BillingDetailOptions {
  clients: { displayName: string; id: string }[];
  currencies: { code: string; name: string }[];
  orders: {
    id: string;
    orderNumber: string;
    sellingReporting?: string | null;
    projectId: string;
    supplier: { displayName: string };
  }[];
  projects: {
    clientId: string;
    code: string;
    id: string;
    name: string;
    reportingCurrencyCode: string;
  }[];
}

interface OrderFinancialView {
  actualMarkupRate: string | null;
  id: string;
  plannedSell: string | null;
  reportingCurrencyCode: string;
}

type AllocationDraft = {
  freightCoverageHt?: string;
  otherCoverageHt?: string;
  amount: string;
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  orderId: string;
  percentage: string;
};

type BillingDraft = {
  freightCoverageHt: string;
  otherCoverageHt: string;
  allocations: AllocationDraft[];
  clientId: string;
  currencyCode: string;
  documentDate: string;
  documentType: "QUOTE" | "INVOICE";
  dueDate: string;
  fxRate: string;
  isCancelled: boolean;
  isProjectRemainderApproved: boolean;
  notes: string;
  projectId: string;
  reference: string;
  totalHt: string;
  totalTtc: string;
  vatAmount: string;
  vatRate: string;
  vatTreatment: string;
};

const initialState: BillingActionState = { message: "", status: "idle" };

function decimal(value: string): string {
  try {
    const normalized = normalizeDecimalInput(value, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    return normalized ? new Decimal(normalized).toFixed(4) : value;
  } catch {
    return value;
  }
}

function calculationDecimal(value: string): string {
  const normalized = decimal(value);
  try {
    return new Decimal(normalized || 0).toFixed(4);
  } catch {
    return "0.0000";
  }
}

function initialDraft(document: ClientBillingView): BillingDraft {
  return {
    allocations: document.allocations.map((item) => ({
      freightCoverageHt: item.freightCoverageHt ?? "0",
      otherCoverageHt: item.otherCoverageHt ?? "0",
      amount: item.allocatedAmount,
      basis: item.basis,
      orderId: item.orderId,
      percentage:
        percentageFromAmount(document.totalHt, item.allocatedAmount) ?? "",
    })),
    clientId: document.clientId,
    currencyCode: document.currencyCode,
    documentDate: document.documentDate,
    documentType: document.documentType,
    dueDate: document.dueDate ?? "",
    fxRate: document.fxRate ?? "",
    isCancelled: document.isCancelled,
    isProjectRemainderApproved: document.isProjectRemainderApproved,
    notes: document.notes ?? "",
    projectId: document.projectId,
    reference: document.reference,
    freightCoverageHt: document.freightCoverageHt ?? "0",
    otherCoverageHt: document.otherCoverageHt ?? "0",
    totalHt: document.totalHt,
    totalTtc: document.totalTtc,
    vatAmount: document.vatAmount,
    vatRate: document.vatRate
      ? new Decimal(document.vatRate).times(100).toString()
      : "",
    vatTreatment: document.vatTreatment ?? "",
  };
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-sm tabular-nums">{value}</dd>
    </div>
  );
}

export function BillingDetail({
  relatedTables = [],
  canEdit,
  document,
  options,
  orderFinancials,
  startEditing,
}: {
  relatedTables?: RelatedTableData[];
  canEdit: boolean;
  document: ClientBillingView;
  options: BillingDetailOptions;
  orderFinancials: OrderFinancialView[];
  startEditing: boolean;
}) {
  const [editing, setEditing] = useState(canEdit && startEditing);
  const [saved, setSaved] = useState(() => initialDraft(document));
  const [draft, setDraft] = useState(() => initialDraft(document));
  const { onSubmit, pending, state } = usePersistentActionState(
    updateClientBillingDocumentAction,
    initialState,
  );
  const submittedDraft = useRef(draft);
  useEffect(() => {
    if (state.status !== "success") return;
    setSaved(submittedDraft.current);
    setEditing(false);
  }, [state]);
  const availableProjects = options.projects.filter(
    (project) => project.clientId === draft.clientId,
  );
  const availableOrders = options.orders.filter(
    (order) => order.projectId === draft.projectId,
  );
  const reconciliation = useMemo(
    () =>
      allocationReconciliation(
        calculationDecimal(draft.totalHt),
        draft.allocations.map((item) => calculationDecimal(item.amount)),
      ),
    [draft.allocations, draft.totalHt],
  );
  const orderById = new Map(options.orders.map((order) => [order.id, order]));
  const financialByOrder = new Map(
    orderFinancials.map((order) => [order.id, order]),
  );
  const savedClient = options.clients.find(
    (item) => item.id === saved.clientId,
  );
  const savedProject = options.projects.find(
    (item) => item.id === saved.projectId,
  );
  const collection = calculateClientBillingAmounts({
    documentType: saved.documentType,
    dueDate: saved.dueDate || null,
    isCancelled: saved.isCancelled,
    paidAmounts: [document.paid],
    today: businessToday(),
    totalTtc: calculationDecimal(saved.totalTtc),
  });
  const savedReconciliation = allocationReconciliation(
    calculationDecimal(saved.totalHt),
    saved.allocations.map((allocation) =>
      calculationDecimal(allocation.amount),
    ),
  );
  const freightBreakdown = freightCoverageBreakdown(
    saved.totalHt,
    saved.freightCoverageHt,
    saved.allocations.map((item) => ({
      allocatedAmount: item.amount,
      freightCoverageHt: item.freightCoverageHt ?? "0",
      otherCoverageHt: item.otherCoverageHt ?? "0",
    })),
    saved.otherCoverageHt,
  );
  const saveAllocation = (allocation: SavedBillingAllocation) => {
    const update = (current: BillingDraft): BillingDraft => ({
      ...current,
      isProjectRemainderApproved: allocation.isProjectRemainderApproved,
      allocations: [
        ...current.allocations.filter(
          (item) => item.orderId !== allocation.orderId,
        ),
        {
          freightCoverageHt: allocation.freightCoverageHt ?? "0",
          otherCoverageHt: allocation.otherCoverageHt ?? "0",
          amount: decimal(allocation.amount),
          basis: "FIXED_AMOUNT",
          orderId: allocation.orderId,
          percentage: "",
        },
      ],
    });
    setSaved(update);
    setDraft(update);
  };
  const allocationEditor = (allocation?: AllocationDraft) => (
    <BillingAllocationEditor
      {...(allocation ? { allocation } : {})}
      billing={{ ...saved, id: document.id }}
      availableHt={
        allocationReconciliation(
          calculationDecimal(saved.totalHt),
          saved.allocations
            .filter((item) => item.orderId !== allocation?.orderId)
            .map((item) => calculationDecimal(item.amount)),
        ).remaining
      }
      orders={options.orders
        .filter((order) => order.projectId === saved.projectId)
        .filter((order) =>
          allocation
            ? order.id === allocation.orderId
            : !saved.allocations.some((item) => item.orderId === order.id),
        )
        .map((order) => ({
          id: order.id,
          label: `${order.orderNumber} · ${order.supplier.displayName}`,
          sellingBasisHt: orderSellingBasisInBillingCurrency({
            billingCurrencyCode: saved.currencyCode,
            billingFxRateToReporting: saved.fxRate || null,
            orderSellingReporting:
              order.sellingReporting ??
              financialByOrder.get(order.id)?.plannedSell ??
              null,
            reportingCurrencyCode:
              savedProject?.reportingCurrencyCode ??
              document.project.reportingCurrencyCode,
          }),
        }))}
      onSaved={saveAllocation}
    />
  );
  const fieldErrors = state.fieldErrors ?? {};
  const updateFinancialTotals = (next: Partial<BillingDraft>) => {
    setDraft((current) => {
      const totalHt = next.totalHt ?? current.totalHt;
      const vatAmount = next.vatAmount ?? current.vatAmount;
      let totalTtc = current.totalTtc;
      try {
        totalTtc = amountIncludingVat(
          calculationDecimal(totalHt),
          calculationDecimal(vatAmount),
        ).toFixed(4);
      } catch {
        totalTtc = "";
      }
      const allocations =
        next.totalHt === undefined
          ? current.allocations
          : current.allocations.map((allocation) =>
              allocation.basis === "PERCENTAGE"
                ? {
                    ...allocation,
                    amount:
                      amountFromPercentage(totalHt, allocation.percentage) ??
                      allocation.amount,
                  }
                : allocation,
            );
      return { ...current, ...next, allocations, totalTtc };
    });
  };
  const serializedAllocations = draft.allocations.map((item) => ({
    freightCoverageHt: decimal(item.freightCoverageHt ?? "0"),
    otherCoverageHt: decimal(item.otherCoverageHt ?? "0"),
    allocatedAmount: decimal(item.amount),
    basis: item.basis,
    orderId: item.orderId,
    ...(item.basis === "PERCENTAGE"
      ? {
          percentageRate:
            humanPercentageToFraction(item.percentage, {
              maximumPercent: "100",
            }) ?? item.percentage,
        }
      : {}),
  }));

  return (
    <div className="space-y-5">
      <DetailPageHeader
        actions={
          canEdit && !editing ? (
            <Button onClick={() => setEditing(true)} type="button">
              Edit
            </Button>
          ) : undefined
        }
        backHref="/billing"
        backLabel="Back to Billing"
        eyebrow="Billing Event"
        meta={
          <>
            {savedClient?.displayName ?? document.client.displayName} ·{" "}
            {savedProject?.name ?? document.project.name}
          </>
        }
        status={saved.isCancelled ? "CANCELLED" : saved.documentType}
        title={saved.reference}
      />

      {editing ? (
        <EditorDrawer
          open={editing}
          wide
          title="Edit Billing"
          onOpenChange={(open) => {
            setEditing(open);
            if (!open) setDraft(saved);
          }}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              submittedDraft.current = draft;
              onSubmit(event);
            }}
          >
            <input name="id" type="hidden" value={document.id} />
            <input
              name="allocations"
              type="hidden"
              value={JSON.stringify(serializedAllocations)}
            />

            <>
              <section className="bg-card rounded-lg border p-4">
                <h2 className="text-sm font-semibold">General & financial</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  <Field error={fieldErrors.clientId} label="Client">
                    <select
                      className={inputClassName}
                      name="clientId"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          clientId: event.target.value,
                          projectId: "",
                        }))
                      }
                      value={draft.clientId}
                    >
                      {options.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field error={fieldErrors.projectId} label="Project">
                    <select
                      className={inputClassName}
                      name="projectId"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          projectId: event.target.value,
                        }))
                      }
                      value={draft.projectId}
                    >
                      <option value="">Choose</option>
                      {availableProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} · {project.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field error={fieldErrors.documentType} label="Document type">
                    <select
                      className={inputClassName}
                      name="documentType"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          documentType: event.target.value as
                            "QUOTE" | "INVOICE",
                        }))
                      }
                      value={draft.documentType}
                    >
                      <option value="QUOTE">Quote / Devis</option>
                      <option value="INVOICE">Invoice</option>
                    </select>
                  </Field>
                  <Field error={fieldErrors.isCancelled} label="Status">
                    <select
                      name="recordStatus"
                      className={inputClassName}
                      value={draft.isCancelled ? "CANCELLED" : "ACTIVE"}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          isCancelled: event.target.value === "CANCELLED",
                        }))
                      }
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                    <input
                      type="hidden"
                      name="isCancelled"
                      value={draft.isCancelled ? "on" : ""}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Payment status is calculated from receipts and due dates.
                    </p>
                  </Field>
                  <Field error={fieldErrors.reference} label="Reference">
                    <input
                      className={inputClassName}
                      name="reference"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          reference: event.target.value,
                        }))
                      }
                      required
                      value={draft.reference}
                    />
                  </Field>
                  <Field error={fieldErrors.documentDate} label="Document date">
                    <DateInput
                      className={inputClassName}
                      name="documentDate"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          documentDate: event.target.value,
                        }))
                      }
                      required

                      value={draft.documentDate}
                    />
                  </Field>
                  <Field error={fieldErrors.dueDate} label="Due date">
                    <DateInput
                      className={inputClassName}
                      name="dueDate"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          dueDate: event.target.value,
                        }))
                      }

                      value={draft.dueDate}
                    />
                  </Field>
                  <Field error={fieldErrors.currencyCode} label="Currency">
                    <select
                      className={inputClassName}
                      name="currencyCode"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          currencyCode: event.target.value,
                        }))
                      }
                      value={draft.currencyCode}
                    >
                      {options.currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code} · {currency.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    error={fieldErrors.fxRate}
                    label="FX to Project reporting"
                  >
                    <input
                      className={inputClassName}
                      inputMode="decimal"
                      name="fxRate"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          fxRate: event.target.value,
                        }))
                      }
                      value={draft.fxRate}
                    />
                  </Field>
                  <Field
                    label="Of total: freight coverage HT"
                    error={fieldErrors.freightCoverageHt}
                  >
                    <MoneyInput
                      name="freightCoverageHt"
                      value={draft.freightCoverageHt}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          freightCoverageHt: value,
                        }))
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Included in total HT. Freight not assigned to Orders stays
                      at Project level.
                    </p>
                  </Field>
                  <Field
                    label="Of total: Other/services revenue HT"
                    error={fieldErrors.otherCoverageHt}
                  >
                    <MoneyInput
                      name="otherCoverageHt"
                      value={draft.otherCoverageHt}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          otherCoverageHt: value,
                        }))
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      Included in total HT. Other/services not assigned to
                      Orders stays at Project level.
                    </p>
                  </Field>
                  <Field
                    error={fieldErrors.totalHt}
                    label={`HT (${draft.currencyCode})`}
                  >
                    <MoneyInput
                      className={inputClassName}

                      name="totalHt"
                      onValueChange={(nextValue) =>
                        updateFinancialTotals({ totalHt: nextValue })
                      }
                      required
                      value={draft.totalHt}
                    />
                  </Field>
                  <Field error={fieldErrors.vatTreatment} label="VAT treatment">
                    <select
                      className={inputClassName}
                      name="vatTreatment"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          vatTreatment: event.target.value,
                        }))
                      }
                      value={draft.vatTreatment}
                    >
                      <option value="">Not classified</option>
                      <option value="DOMESTIC">Domestic</option>
                      <option value="INTRA_EU_SUPPLY">Intra-EU supply</option>
                      <option value="INTRA_EU_ACQUISITION">
                        Intra-EU acquisition
                      </option>
                      <option value="IMPORT">Import</option>
                      <option value="EXPORT">Export</option>
                      <option value="REVERSE_CHARGE">Reverse charge</option>
                      <option value="EXEMPT">Exempt</option>
                      <option value="OUT_OF_SCOPE">Out of scope</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </Field>
                  <Field error={fieldErrors.vatRate} label="VAT rate (%)">
                    <PercentageInput
                      className={inputClassName}
                      onValueChange={(vatRate) => {
                        const vatAmount =
                          amountFromPercentage(draft.totalHt, vatRate) ??
                          draft.vatAmount;
                        updateFinancialTotals({ vatAmount, vatRate });
                      }}
                      value={draft.vatRate}
                    />
                    <input
                      name="vatRate"
                      type="hidden"
                      value={
                        humanPercentageToFraction(draft.vatRate, {
                          maximumPercent: "100",
                        }) ?? draft.vatRate
                      }
                    />
                  </Field>
                  <Field
                    error={fieldErrors.vatAmount}
                    label={`VAT (${draft.currencyCode})`}
                  >
                    <MoneyInput
                      className={inputClassName}

                      name="vatAmount"
                      onValueChange={(nextValue) =>
                        updateFinancialTotals({ vatAmount: nextValue })
                      }
                      required
                      value={draft.vatAmount}
                    />
                  </Field>
                  <Field
                    error={fieldErrors.totalTtc}
                    label={`TTC (${draft.currencyCode})`}
                  >
                    <input
                      className={`${inputClassName} bg-muted/40`}
                      name="totalTtc"
                      readOnly
                      value={draft.totalTtc}
                    />
                  </Field>
                </div>
                <Field error={fieldErrors.notes} label="Notes">
                  <textarea
                    className={`${inputClassName} mt-3 min-h-24 py-2`}
                    name="notes"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    value={draft.notes}
                  />
                </Field>
              </section>

              <section className="bg-card rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Linked Orders</h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Attribute this Billing HT without creating additional
                      revenue.
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        allocations: [
                          ...current.allocations,
                          {
                            amount: "",
                            basis: "FIXED_AMOUNT",
                            orderId: "",
                            percentage: "",
                          },
                        ],
                      }))
                    }
                    type="button"
                    variant="outline"
                  >
                    Add Order
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {draft.allocations.map((allocation, index) => (
                    <div
                      className="grid gap-2 rounded-md border p-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                      key={`${index}-${allocation.orderId}`}
                    >
                      <Field
                        error={fieldErrors[`allocations.${index}.orderId`]}
                        label="Order"
                      >
                        <select
                          className={inputClassName}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              allocations: current.allocations.map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, orderId: event.target.value }
                                    : item,
                              ),
                            }))
                          }
                          value={allocation.orderId}
                        >
                          <option value="">Choose Order</option>
                          {availableOrders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.orderNumber} · {order.supplier.displayName}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <AllocationInputs
                        freightCoverageHt={allocation.freightCoverageHt ?? "0"}
                        onFreightChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map((item, i) =>
                              i === index
                                ? { ...item, freightCoverageHt: value }
                                : item,
                            ),
                          }))
                        }
                        otherCoverageHt={allocation.otherCoverageHt ?? "0"}
                        onOtherChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map((item, i) =>
                              i === index
                                ? { ...item, otherCoverageHt: value }
                                : item,
                            ),
                          }))
                        }
                        amount={allocation.amount}
                        billingTotalHt={draft.totalHt}
                        currencyCode={draft.currencyCode}
                        name={`allocation.${index}.amount`}
                        orderSellHt={orderSellingBasisInBillingCurrency({
                          billingCurrencyCode: draft.currencyCode,
                          billingFxRateToReporting:
                            decimal(draft.fxRate) || null,
                          orderSellingReporting:
                            orderById.get(allocation.orderId)
                              ?.sellingReporting ??
                            financialByOrder.get(allocation.orderId)
                              ?.plannedSell ??
                            null,
                          reportingCurrencyCode:
                            options.projects.find(
                              (project) => project.id === draft.projectId,
                            )?.reportingCurrencyCode ?? "",
                        })}
                        error={
                          fieldErrors[`allocations.${index}.allocatedAmount`]
                        }
                        onAmountChange={(amount) =>
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      amount,
                                      basis: "FIXED_AMOUNT",
                                      percentage: "",
                                    }
                                  : item,
                            ),
                          }))
                        }
                      />
                      <Button
                        className="self-end"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                        type="button"
                        variant="outline"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/30 mt-4 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-4">
                  <p>
                    Billing HT: {formatMoney(draft.totalHt, draft.currencyCode)}
                  </p>
                  <p>
                    Allocated:{" "}
                    {formatMoney(reconciliation.allocated, draft.currencyCode)}
                  </p>
                  <p>
                    Project remainder:{" "}
                    {formatMoney(reconciliation.remaining, draft.currencyCode)}
                  </p>
                  <p
                    className={
                      new Decimal(reconciliation.overallocated).greaterThan(0)
                        ? "text-destructive"
                        : ""
                    }
                  >
                    Over-allocation:{" "}
                    {formatMoney(
                      reconciliation.overallocated,
                      draft.currencyCode,
                    )}
                  </p>
                </div>
                {draft.allocations.length > 0 &&
                new Decimal(reconciliation.remaining).greaterThan(0) ? (
                  <Button
                    className="mt-3"
                    onClick={() =>
                      setDraft((current) => {
                        const lastIndex = current.allocations.length - 1;
                        return {
                          ...current,
                          allocations: current.allocations.map(
                            (allocation, index) => {
                              if (index !== lastIndex) return allocation;
                              const amount = addAllocationAmount(
                                allocation.amount,
                                reconciliation.remaining,
                              );
                              return {
                                ...allocation,
                                amount,
                                percentage:
                                  percentageFromAmount(
                                    current.totalHt,
                                    amount,
                                  ) ?? allocation.percentage,
                              };
                            },
                          ),
                        };
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Allocate remaining to last Order
                  </Button>
                ) : null}
                {new Decimal(reconciliation.remaining).greaterThan(0) ? (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      checked={draft.isProjectRemainderApproved}
                      name="isProjectRemainderApproved"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          isProjectRemainderApproved: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    Approve the remainder as Project-level Billing
                  </label>
                ) : null}
              </section>
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton pending={pending}>
                  Save Billing Event
                </SubmitButton>
                <SheetClose asChild>
                  <Button disabled={pending} type="button" variant="outline">
                    Cancel
                  </Button>
                </SheetClose>
                <ActionFeedback state={state} />
              </div>
            </>
          </form>
        </EditorDrawer>
      ) : null}
      <RecordWorkspace
        label="Billing workspace"
        sections={[
          {
            id: "connections",
            group: "related",
            label: "Project & Client",
            content: (
              <RelatedRecords
                tables={relatedTables.filter(
                  (table) =>
                    !["client-installments", "receipts"].includes(table.id),
                )}
              />
            ),
          },
          {
            id: "overview",
            group: "details",
            label: "Overview",
            content: (
              <>
                <RecordSummary
                  values={[
                    {
                      label: "Total TTC",
                      value: formatMoney(saved.totalTtc, saved.currencyCode),
                    },
                    {
                      label: "Received",
                      value: formatMoney(collection.paid, saved.currencyCode),
                    },
                    {
                      label: "Outstanding",
                      value: formatMoney(
                        collection.outstanding,
                        saved.currencyCode,
                      ),
                    },
                  ]}
                />
                <section
                  aria-label="Details"
                  className="grid gap-3 lg:grid-cols-2"
                >
                  <article className="bg-card rounded-lg border p-4">
                    <RecordSectionHeading title="Amounts & VAT" />
                    <RecordFields
                      values={[
                        {
                          label: "HT",
                          value: formatMoney(saved.totalHt, saved.currencyCode),
                        },
                        {
                          label: "VAT",
                          value: formatMoney(
                            saved.vatAmount,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "VAT rate",
                          value: saved.vatRate
                            ? formatRate(
                                humanPercentageToFraction(saved.vatRate, {
                                  maximumPercent: "100",
                                }),
                              )
                            : "—",
                        },
                        {
                          label: "VAT treatment",
                          value: saved.vatTreatment
                            ? formatEnumLabel(saved.vatTreatment)
                            : "—",
                        },
                        {
                          label: "FX to reporting",
                          value: saved.fxRate
                            ? formatFxRate(saved.fxRate)
                            : saved.currencyCode ===
                                savedProject?.reportingCurrencyCode
                              ? "1 · same currency"
                              : "Missing",
                        },
                      ]}
                    />
                  </article>
                  <article className="bg-card rounded-lg border p-4">
                    <RecordSectionHeading
                      title="Allocation & freight"
                      description="Commercial Billing HT attribution, separate from cash received."
                    />
                    <RecordFields
                      values={[
                        {
                          label: "Unallocated Billing HT",
                          value: formatMoney(
                            savedReconciliation.remaining,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "Other/services HT (included)",
                          value: formatMoney(
                            saved.otherCoverageHt,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "Merchandise HT",
                          value: formatMoney(
                            revenueParts(
                              saved.totalHt,
                              saved.freightCoverageHt,
                              saved.otherCoverageHt,
                            ).merchandise,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "Total freight HT (included)",
                          value: formatMoney(
                            saved.freightCoverageHt,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "Freight allocated to Orders HT",
                          value: formatMoney(
                            freightBreakdown.allocatedFreightHt,
                            saved.currencyCode,
                          ),
                        },
                        {
                          label: "Freight remaining at Project level HT",
                          value: formatMoney(
                            freightBreakdown.projectFreightHt,
                            saved.currencyCode,
                          ),
                        },
                      ]}
                    />
                  </article>
                </section>
                <section className="bg-card rounded-lg border p-4">
                  <RecordSectionHeading title="Status & dates" />
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailValue
                      label="Status"
                      value={saved.isCancelled ? "Cancelled" : "Active"}
                    />
                    <DetailValue
                      label="Payment status"
                      value={formatEnumLabel(collection.status)}
                    />
                    <DetailValue
                      label="Document date"
                      value={formatDateOnly(saved.documentDate)}
                    />
                    <DetailValue
                      label="Due date"
                      value={formatDateOnly(saved.dueDate)}
                    />
                  </dl>
                </section>
                <article className="bg-card rounded-lg border p-4">
                  <RecordSectionHeading title="Notes" />
                  <p className="text-muted-foreground mt-3 text-sm whitespace-pre-wrap">
                    {saved.notes || "No notes."}
                  </p>
                  {document.paymentTermsRaw ? (
                    <p className="mt-3 border-t pt-3 text-xs">
                      <span className="font-medium">Payment terms:</span>{" "}
                      {document.paymentTermsRaw}
                    </p>
                  ) : null}
                </article>
              </>
            ),
          },
          {
            id: "schedule",
            group: "related",
            label: "Schedule & receipts",
            content: (
              <div className="space-y-4">
                <RelatedRecords
                  actions={
                    canEdit
                      ? {
                          "client-installments": (
                            <RelatedCashCreate
                              scope={{ kind: "billing", id: document.id }}
                              kind="client-installment"
                            />
                          ),
                          receipts: (
                            <RelatedCashCreate
                              scope={{ kind: "billing", id: document.id }}
                              kind="receipt"
                            />
                          ),
                        }
                      : {}
                  }
                  tables={relatedTables.filter((table) =>
                    ["client-installments", "receipts"].includes(table.id),
                  )}
                />
                {canEdit ? (
                  <EditorDrawer title="Manage installments & receipts" wide>
                    <BillingScheduleManager
                      canEdit={canEdit}
                      document={document}
                    />
                  </EditorDrawer>
                ) : null}
              </div>
            ),
          },
          {
            id: "allocations",
            group: "related",
            label: "Linked Orders",
            content: (
              <RelatedRecordTable
                onRemoved={(ids) =>
                  setSaved((current) => ({
                    ...current,
                    allocations: current.allocations.filter(
                      (row) => !ids.includes(row.orderId),
                    ),
                  }))
                }
                onEdited={(id, fields) =>
                  setSaved((current) => ({
                    ...current,
                    allocations: current.allocations.map((row) =>
                      row.orderId === id
                        ? {
                            ...row,
                            amount: fields.amount ?? row.amount,
                            freightCoverageHt:
                              fields.freight ?? row.freightCoverageHt ?? "0",
                            basis: "FIXED_AMOUNT",
                            percentage: "",
                          }
                        : row,
                    ),
                  }))
                }
                table={{
                  id: "orders",
                  ...(canEdit
                    ? {
                        removal: {
                          kind: "billing-orders" as const,
                          parentId: document.id,
                        },
                        editKind: "allocation" as const,
                        editParentId: document.id,
                      }
                    : {}),
                  title: "Linked Orders",
                  description:
                    "Commercial attribution only. Client receipts remain separate cash records.",
                  columns: [
                    "Order",
                    "Supplier",
                    "Allocated HT",
                    "Of which freight HT",
                    "% of Billing",
                    "Planned sell HT",
                    "Effective markup",
                  ],
                  numericColumns: [2, 3, 4, 5, 6],
                  rows: saved.allocations.map((allocation) => {
                    const order = orderById.get(allocation.orderId);
                    const financial = financialByOrder.get(allocation.orderId);
                    return {
                      id: allocation.orderId,
                      editFields: [
                        {
                          column: 2,
                          name: "amount",
                          type: "money",
                          value: allocation.amount,
                          currency: saved.currencyCode,
                        },
                        {
                          column: 3,
                          name: "freight",
                          type: "money",
                          value: allocation.freightCoverageHt ?? "0",
                          currency: saved.currencyCode,
                        },
                      ],
                      href: relatedHref("order", allocation.orderId),
                      cells: [
                        order?.orderNumber ?? allocation.orderId,
                        order?.supplier.displayName ?? "—",
                        formatMoney(allocation.amount, saved.currencyCode),
                        formatMoney(
                          allocation.freightCoverageHt ?? "0",
                          saved.currencyCode,
                        ),
                        formatRate(
                          humanPercentageToFraction(
                            percentageFromAmount(
                              saved.totalHt,
                              allocation.amount,
                            ) ?? "",
                            { maximumPercent: "100" },
                          ),
                        ),
                        formatMoney(
                          financial?.plannedSell ?? null,
                          financial?.reportingCurrencyCode ??
                            savedProject?.reportingCurrencyCode ??
                            document.project.reportingCurrencyCode,
                        ),
                        formatRate(financial?.actualMarkupRate ?? null),
                      ],
                    };
                  }),
                }}
                actions={
                  canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <BillingFreightEditor
                        billingId={document.id}
                        totalHt={saved.totalHt}
                        currencyCode={saved.currencyCode}
                        freightCoverageHt={saved.freightCoverageHt}
                        allocatedFreightHt={freightBreakdown.allocatedFreightHt}
                        onSaved={(amount) => {
                          setSaved((current) => ({
                            ...current,
                            freightCoverageHt: amount,
                          }));
                          setDraft((current) => ({
                            ...current,
                            freightCoverageHt: amount,
                          }));
                        }}
                      />
                      {allocationEditor()}
                    </div>
                  ) : null
                }
                {...(canEdit
                  ? {
                      rowActions: Object.fromEntries(
                        saved.allocations.map((allocation) => [
                          allocation.orderId,
                          allocationEditor(allocation),
                        ]),
                      ),
                    }
                  : {})}
              />
            ),
          },
          {
            id: "history",
            label: "Document history",
            group: "related",
            content: (
              <RelatedRecordTable
                table={{
                  id: "history",
                  title: "Document history",
                  description:
                    "Reviewed Billing imports. Source documents are not retained.",
                  columns: [
                    "Processed",
                    "Action",
                    "File name",
                    "Provider / model",
                    "Employee",
                  ],
                  rows: document.imports.map((item) => ({
                    id: item.id,
                    cells: [
                      formatTimestamp(item.processedAt),
                      formatEnumLabel(item.action),
                      item.originalFilename,
                      item.extractionProvider + " / " + item.extractionModel,
                      item.processedByName ?? "Historical user",
                    ],
                  })),
                }}
                actions={
                  canEdit ? (
                    <Link
                      className="text-primary text-xs underline"
                      href="/admin/activity?entityType=BILLING_DOCUMENT"
                    >
                      Activity history
                    </Link>
                  ) : null
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}
