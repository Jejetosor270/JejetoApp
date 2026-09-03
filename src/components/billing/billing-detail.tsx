"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { updateClientBillingDocumentAction } from "@/app/(app)/billing/actions";
import { BillingInstallmentEditor } from "@/components/billing/billing-installment-editor";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  addAllocationAmount,
  allocationReconciliation,
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import { amountIncludingVat } from "@/domain/finance/calculations";
import { formatDateOnly } from "@/domain/payments/dates";
import {
  formatFxRate,
  formatMoney,
  formatRate,
} from "@/domain/procurement/presentation";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { normalizeDecimalInput } from "@/domain/validation/numeric";
import type { ClientBillingView } from "@/lib/billing/billing";

interface BillingDetailOptions {
  clients: { displayName: string; id: string }[];
  currencies: { code: string; name: string }[];
  orders: {
    id: string;
    orderNumber: string;
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
  amount: string;
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  orderId: string;
  percentage: string;
};

type BillingDraft = {
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
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

export function BillingDetail({
  canEdit,
  document,
  options,
  orderFinancials,
  startEditing,
}: {
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
      <header className="bg-card rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-xs font-medium tracking-wide uppercase">
              Client Billing Event
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{saved.reference}</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {savedClient?.displayName ?? document.client.displayName} ·{" "}
              {savedProject?.name ?? document.project.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/billing">Back to Billing</Link>
            </Button>
            {canEdit && !editing ? (
              <Button onClick={() => setEditing(true)} type="button">
                Edit
              </Button>
            ) : null}
          </div>
        </div>
      </header>

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
        {editing ? (
          <>
            <section className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold">General & financial</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                        documentType: event.target.value as "QUOTE" | "INVOICE",
                      }))
                    }
                    value={draft.documentType}
                  >
                    <option value="QUOTE">Quote / Devis</option>
                    <option value="INVOICE">Invoice</option>
                  </select>
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
                  <input
                    className={inputClassName}
                    name="documentDate"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        documentDate: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={draft.documentDate}
                  />
                </Field>
                <Field error={fieldErrors.dueDate} label="Due date">
                  <input
                    className={inputClassName}
                    name="dueDate"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                    type="date"
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
                  error={fieldErrors.totalHt}
                  label={`HT (${draft.currencyCode})`}
                >
                  <input
                    className={inputClassName}
                    inputMode="decimal"
                    name="totalHt"
                    onChange={(event) =>
                      updateFinancialTotals({ totalHt: event.target.value })
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
                  <input
                    className={inputClassName}
                    inputMode="decimal"
                    name="vatAmount"
                    onChange={(event) =>
                      updateFinancialTotals({ vatAmount: event.target.value })
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
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  checked={draft.isCancelled}
                  name="isCancelled"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      isCancelled: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Cancelled
              </label>
            </section>

            <section className="bg-card rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    Order Reconciliation
                  </h2>
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
                    <Field label="Basis">
                      <select
                        className={inputClassName}
                        onChange={(event) => {
                          const basis = event.target
                            .value as AllocationDraft["basis"];
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index ? { ...item, basis } : item,
                            ),
                          }));
                        }}
                        value={allocation.basis}
                      >
                        <option value="FIXED_AMOUNT">Amount</option>
                        <option value="PERCENTAGE">Percentage</option>
                      </select>
                    </Field>
                    <Field
                      error={fieldErrors[`allocations.${index}.percentageRate`]}
                      label="% of Billing"
                    >
                      <PercentageInput
                        className={inputClassName}
                        disabled={allocation.basis !== "PERCENTAGE"}
                        onValueChange={(percentage) => {
                          const amount =
                            amountFromPercentage(draft.totalHt, percentage) ??
                            "";
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, amount, percentage }
                                  : item,
                            ),
                          }));
                        }}
                        value={allocation.percentage}
                      />
                    </Field>
                    <Field
                      error={
                        fieldErrors[`allocations.${index}.allocatedAmount`]
                      }
                      label={`Allocation HT (${draft.currencyCode})`}
                    >
                      <input
                        className={inputClassName}
                        inputMode="decimal"
                        onChange={(event) => {
                          const amount = event.target.value;
                          const percentage =
                            percentageFromAmount(draft.totalHt, amount) ?? "";
                          setDraft((current) => ({
                            ...current,
                            allocations: current.allocations.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, amount, percentage }
                                  : item,
                            ),
                          }));
                        }}
                        value={allocation.amount}
                      />
                    </Field>
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
                                percentageFromAmount(current.totalHt, amount) ??
                                allocation.percentage,
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
              <SubmitButton pending={pending}>Save Billing Event</SubmitButton>
              <Button
                disabled={pending}
                onClick={() => {
                  setDraft(saved);
                  setEditing(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <ActionFeedback state={state} />
            </div>
          </>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <article className="bg-card rounded-lg border p-4">
                <h2 className="text-sm font-semibold">General</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailValue
                    label="Client"
                    value={
                      savedClient?.displayName ?? document.client.displayName
                    }
                  />
                  <DetailValue
                    label="Project"
                    value={savedProject?.name ?? document.project.name}
                  />
                  <DetailValue
                    label="Document type"
                    value={
                      saved.documentType === "QUOTE"
                        ? "Quote / Devis"
                        : "Invoice"
                    }
                  />
                  <DetailValue label="Reference" value={saved.reference} />
                  <DetailValue
                    label="Document date"
                    value={formatDateOnly(saved.documentDate)}
                  />
                  <DetailValue
                    label="Due date"
                    value={formatDateOnly(saved.dueDate)}
                  />
                  <DetailValue label="Currency" value={saved.currencyCode} />
                  <DetailValue
                    label="FX to reporting"
                    value={
                      (saved.fxRate ? formatFxRate(saved.fxRate) : "") ||
                      (saved.currencyCode ===
                      savedProject?.reportingCurrencyCode
                        ? "1 · same currency"
                        : "Missing")
                    }
                  />
                </dl>
              </article>
              <article className="bg-card rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Financial</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailValue
                    label="HT"
                    value={formatMoney(saved.totalHt, saved.currencyCode)}
                  />
                  <DetailValue
                    label="VAT"
                    value={formatMoney(saved.vatAmount, saved.currencyCode)}
                  />
                  <DetailValue
                    label="VAT rate"
                    value={
                      saved.vatRate
                        ? formatRate(
                            humanPercentageToFraction(saved.vatRate, {
                              maximumPercent: "100",
                            }),
                          )
                        : "—"
                    }
                  />
                  <DetailValue
                    label="TTC"
                    value={formatMoney(saved.totalTtc, saved.currencyCode)}
                  />
                  <DetailValue
                    label="Paid"
                    value={formatMoney(document.paid, saved.currencyCode)}
                  />
                  <DetailValue
                    label="Outstanding"
                    value={formatMoney(
                      document.outstanding,
                      saved.currencyCode,
                    )}
                  />
                  <DetailValue
                    label="Status"
                    value={document.status.replaceAll("_", " ")}
                  />
                  <DetailValue
                    label="VAT treatment"
                    value={
                      saved.vatTreatment
                        ? saved.vatTreatment.replaceAll("_", " ")
                        : "—"
                    }
                  />
                </dl>
              </article>
            </section>
            <section className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Order Reconciliation</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2">Order</th>
                      <th>Supplier</th>
                      <th className="text-right">Allocated HT</th>
                      <th className="text-right">% of Billing</th>
                      <th className="text-right">Planned Sell HT</th>
                      <th className="text-right">Effective markup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {saved.allocations.map((allocation) => {
                      const order = orderById.get(allocation.orderId);
                      const financial = financialByOrder.get(
                        allocation.orderId,
                      );
                      return (
                        <tr key={allocation.orderId}>
                          <td className="py-2">
                            <Link
                              className="font-mono text-xs underline"
                              href={`/orders/${allocation.orderId}`}
                            >
                              {order?.orderNumber ?? allocation.orderId}
                            </Link>
                          </td>
                          <td>{order?.supplier.displayName ?? "—"}</td>
                          <td className="financial-figure text-right">
                            {formatMoney(allocation.amount, saved.currencyCode)}
                          </td>
                          <td className="financial-figure text-right">
                            {formatRate(
                              humanPercentageToFraction(
                                percentageFromAmount(
                                  saved.totalHt,
                                  allocation.amount,
                                ) ?? "",
                                { maximumPercent: "100" },
                              ),
                            )}
                          </td>
                          <td className="financial-figure text-right">
                            {formatMoney(
                              financial?.plannedSell ?? null,
                              financial?.reportingCurrencyCode ??
                                savedProject?.reportingCurrencyCode ??
                                document.project.reportingCurrencyCode,
                            )}
                          </td>
                          <td className="financial-figure text-right">
                            {formatRate(financial?.actualMarkupRate ?? null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-muted/30 mt-3 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
                <p>
                  Billing HT: {formatMoney(saved.totalHt, saved.currencyCode)}
                </p>
                <p>
                  Allocated HT:{" "}
                  {formatMoney(reconciliation.allocated, saved.currencyCode)}
                </p>
                <p>
                  Project-level remainder:{" "}
                  {formatMoney(reconciliation.remaining, saved.currencyCode)}
                </p>
              </div>
            </section>
          </>
        )}
      </form>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Payment Schedule & Receipts</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {document.paymentInstallments.map((installment) => (
            <BillingInstallmentEditor
              billingDocumentId={document.id}
              canEdit={canEdit}
              installment={installment}
              key={installment.id}
            />
          ))}
          {document.paymentInstallments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payment schedule is attached.
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Notes</h2>
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
        <article className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Import metadata</h2>
            {canEdit ? (
              <Link
                className="text-primary text-xs underline"
                href="/admin/activity?entityType=BILLING_DOCUMENT"
              >
                Activity history
              </Link>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {document.imports.map((item) => (
              <p key={item.id}>
                {new Date(item.processedAt).toLocaleString("en-GB", {
                  timeZone: "Europe/Paris",
                })}{" "}
                · {item.action.toLowerCase()} · {item.originalFilename} ·{" "}
                {item.extractionProvider}/{item.extractionModel} ·{" "}
                {item.processedByName ?? "Historical user"}
              </p>
            ))}
            {document.imports.length === 0 ? (
              <p className="text-muted-foreground">No import metadata.</p>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
