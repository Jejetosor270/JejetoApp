"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  confirmClientDocumentAction,
  processClientDocumentAction,
} from "@/app/(app)/billing/actions";
import type {
  BillingActionState,
  ClientDocumentProcessingState,
} from "@/domain/billing/action-state";
import {
  ACCEPTED_CLIENT_DOCUMENT_TYPES,
  MAX_CLIENT_DOCUMENT_LABEL,
} from "@/config/client-document-extraction";
import {
  inputClassName,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { ProcessedClientDocumentReview } from "@/lib/billing/process";
import {
  allocationReconciliation,
  amountFromPercentage,
  percentageFromAmount,
  scheduleReconciliation,
} from "@/domain/billing/calculations";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { normalizeDecimalInput } from "@/domain/validation/numeric";

interface BillingOptions {
  clients: { displayName: string; id: string }[];
  currencies: { code: string; name: string }[];
  installments: {
    billingDocument: {
      clientId: string;
      projectId: string;
      reference: string;
    };
    currencyCode: string;
    dueDate: string;
    id: string;
    label: string;
    scheduledAmount: string;
  }[];
  orders: { id: string; orderNumber: string; projectId: string }[];
  projects: {
    clientId: string;
    code: string;
    id: string;
    name: string;
    reportingCurrencyCode: string;
  }[];
}

const initialProcessing: ClientDocumentProcessingState = {
  message: "",
  status: "idle",
};
const initialConfirmation: BillingActionState = {
  message: "",
  status: "idle",
};

type ScheduleRow = {
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  dueDate: string;
  fixedAmount: string;
  label: string;
  notes: string;
  percentage: string;
};

type AllocationRow = { amount: string; orderId: string };
type AllocationDraftRow = AllocationRow & {
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  percentage: string;
};

function fixedDecimal(value: string): string {
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
  try {
    const normalized = normalizeDecimalInput(value, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    return new Decimal(normalized || 0).toFixed(4);
  } catch {
    return "0.0000";
  }
}

function ReviewField({
  children,
  error,
  label,
  required = false,
}: {
  children: React.ReactNode;
  error?: string | undefined;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function scheduleFromReview(
  review: ProcessedClientDocumentReview,
): ScheduleRow[] {
  return review.proposal.installments.map((item) => ({
    basis: item.basis === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT",
    dueDate: item.dueDate ?? "",
    fixedAmount:
      item.fixedAmount ??
      amountFromPercentage(
        review.proposal.totalTtc ?? "0",
        item.percentageRate
          ? new Decimal(item.percentageRate).times(100).toString()
          : "",
      ) ??
      "",
    label: item.label,
    notes: item.timingDescription ?? "",
    percentage: item.percentageRate
      ? new Decimal(item.percentageRate).times(100).toString()
      : "",
  }));
}

function ClientDocumentReview({
  options,
  review,
}: {
  options: BillingOptions;
  review: ProcessedClientDocumentReview;
}) {
  const proposal = review.proposal;
  const [state, action, pending] = useActionState(
    confirmClientDocumentAction,
    initialConfirmation,
  );
  const [clientId, setClientId] = useState(review.clientSuggestionId ?? "");
  const [projectId, setProjectId] = useState(review.projectSuggestionId ?? "");
  const [documentType, setDocumentType] = useState(
    proposal.documentType ?? "QUOTE",
  );
  const [reference, setReference] = useState(proposal.reference ?? "");
  const [documentDate, setDocumentDate] = useState(proposal.documentDate ?? "");
  const [dueDate, setDueDate] = useState(proposal.dueDate ?? "");
  const [currencyCode, setCurrencyCode] = useState(proposal.currencyCode ?? "");
  const [fxRate, setFxRate] = useState("");
  const [totalHt, setTotalHt] = useState(proposal.totalHt ?? "");
  const [vatAmount, setVatAmount] = useState(proposal.vatAmount ?? "0");
  const [vatRate, setVatRate] = useState(
    proposal.vatRate ? new Decimal(proposal.vatRate).times(100).toString() : "",
  );
  const [totalTtc, setTotalTtc] = useState(proposal.totalTtc ?? "");
  const [notes, setNotes] = useState(proposal.notes ?? "");
  const [schedule, setSchedule] = useState(() => scheduleFromReview(review));
  const [allocations, setAllocations] = useState<AllocationDraftRow[]>([]);
  const [existingDocumentId, setExistingDocumentId] = useState("");
  const [matchedInstallmentId, setMatchedInstallmentId] = useState("");
  const [vatTreatment, setVatTreatment] = useState("");
  const [replaceSchedule, setReplaceSchedule] = useState(false);
  const [isProjectRemainderApproved, setProjectRemainderApproved] =
    useState(false);
  const project = options.projects.find((item) => item.id === projectId);
  const projects = options.projects.filter(
    (item) => item.clientId === clientId,
  );
  const orders = options.orders.filter((item) => item.projectId === projectId);
  const matchable = options.installments.filter(
    (item) =>
      item.billingDocument.clientId === clientId &&
      item.billingDocument.projectId === projectId,
  );
  const allocation = useMemo(
    () =>
      allocationReconciliation(
        calculationDecimal(totalHt),
        allocations.map((item) => calculationDecimal(item.amount)),
      ),
    [allocations, totalHt],
  );
  const scheduled = useMemo(
    () =>
      scheduleReconciliation(
        calculationDecimal(totalTtc),
        schedule.map((item) => calculationDecimal(item.fixedAmount)),
      ),
    [schedule, totalTtc],
  );
  const serializedSchedule = (matchedInstallmentId ? [] : schedule).map(
    (item) => ({
      basis: item.basis,
      dueDate: item.dueDate,
      fixedAmount: item.basis === "FIXED_AMOUNT" ? item.fixedAmount : undefined,
      label: item.label,
      notes: item.notes || undefined,
      percentageRate:
        item.basis === "PERCENTAGE" && item.percentage
          ? (humanPercentageToFraction(item.percentage, {
              maximumPercent: "100",
            }) ?? item.percentage)
          : undefined,
    }),
  );
  const serializedAllocations = allocations.map((item) => ({
    allocatedAmount: fixedDecimal(item.amount),
    basis: item.basis,
    orderId: item.orderId,
    percentageRate:
      item.basis === "PERCENTAGE"
        ? (humanPercentageToFraction(item.percentage, {
            maximumPercent: "100",
          }) ?? item.percentage)
        : undefined,
  }));
  const scheduleOverallocated = new Decimal(
    scheduled.overallocated,
  ).greaterThan(0);
  const allocationOverallocated = new Decimal(
    allocation.overallocated,
  ).greaterThan(0);

  if (state.status === "success" && state.recordId) {
    return (
      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold">Client billing saved</h2>
        <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
        <Button asChild className="mt-4">
          <Link href="/billing">Open Client Billing</Link>
        </Button>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input
        name="action"
        type="hidden"
        value={existingDocumentId ? "UPDATE" : "CREATE"}
      />
      <input
        name="existingDocumentId"
        type="hidden"
        value={existingDocumentId}
      />
      <input name="provider" type="hidden" value={review.provider} />
      <input name="model" type="hidden" value={review.model} />
      <input
        name="originalFilename"
        type="hidden"
        value={review.originalFilename}
      />
      <input
        name="duplicateWarning"
        type="hidden"
        value={String(review.duplicateCandidates.length > 0)}
      />
      <input
        name="allocations"
        type="hidden"
        value={JSON.stringify(serializedAllocations)}
      />
      <input
        name="installments"
        type="hidden"
        value={JSON.stringify(serializedSchedule)}
      />
      <input
        name="matchedInstallmentId"
        type="hidden"
        value={matchedInstallmentId}
      />
      <input
        name="paymentTermsRaw"
        type="hidden"
        value={proposal.paymentTermsRaw ?? ""}
      />
      <section className="bg-card rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Review extracted document</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {review.originalFilename} · {review.provider} / {review.model}
            </p>
          </div>
          <span className="text-positive text-xs">Source PDF released</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3 text-sm">
            <span className="text-muted-foreground text-xs">
              Extracted Client
            </span>
            <p className="mt-1">
              {review.extraction.clientName.value ?? "Missing"}
            </p>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <span className="text-muted-foreground text-xs">
              Extracted Project
            </span>
            <p className="mt-1">
              {review.extraction.projectReference.value ?? "Missing"}
            </p>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <span className="text-muted-foreground text-xs">
              Document classification
            </span>
            <p className="mt-1">{proposal.documentType ?? "Missing"}</p>
          </div>
        </div>
        {proposal.warnings.length ? (
          <ul className="bg-warning-muted mt-4 list-disc rounded-md border p-3 pl-8 text-xs">
            {proposal.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {review.duplicateCandidates.length ? (
        <section className="border-warning bg-warning-muted rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Possible duplicate document</h2>
          <p className="mt-1 text-xs">
            This warning does not block creation. Choose one record only when
            you explicitly intend to update it.
          </p>
          <select
            className={`${inputClassName} mt-3 max-w-xl`}
            onChange={(event) => {
              setExistingDocumentId(event.target.value);
              if (!event.target.value) setReplaceSchedule(false);
            }}
            value={existingDocumentId}
          >
            <option value="">Create a new billing document</option>
            {review.duplicateCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                Update {candidate.reference} · HT {candidate.totalHt} →{" "}
                {totalHt || "review value"} ·{" "}
                {candidate.reasons.join(", ") || "possible match"}
              </option>
            ))}
          </select>
          {existingDocumentId ? (
            <label className="mt-3 flex items-center gap-2 text-xs font-medium">
              <input
                checked={replaceSchedule}
                name="replaceSchedule"
                onChange={(event) => setReplaceSchedule(event.target.checked)}
                type="checkbox"
              />
              Replace the existing proposed schedule with the reviewed schedule
            </label>
          ) : null}
        </section>
      ) : null}

      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Required authoritative fields</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          The AI suggestions remain non-authoritative until you save this
          review.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReviewField
            error={state.fieldErrors?.clientId}
            label="Client"
            required
          >
            <select
              className={inputClassName}
              name="clientId"
              onChange={(event) => {
                setClientId(event.target.value);
                setProjectId("");
                setAllocations([]);
                setExistingDocumentId("");
                setMatchedInstallmentId("");
                setReplaceSchedule(false);
              }}
              required
              value={clientId}
            >
              <option value="">Confirm Client</option>
              {options.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </select>
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.projectId}
            label="Project"
            required
          >
            <select
              className={inputClassName}
              name="projectId"
              onChange={(event) => {
                setProjectId(event.target.value);
                setAllocations([]);
                setExistingDocumentId("");
                setMatchedInstallmentId("");
                setReplaceSchedule(false);
              }}
              required
              value={projectId}
            >
              <option value="">Confirm Project</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.documentType}
            label="Document type"
            required
          >
            <select
              className={inputClassName}
              name="documentType"
              onChange={(event) => {
                const next = event.target.value as "QUOTE" | "INVOICE";
                setDocumentType(next);
                if (next !== "INVOICE") setMatchedInstallmentId("");
              }}
              value={documentType}
            >
              <option value="QUOTE">Quote / Devis</option>
              <option value="INVOICE">Invoice</option>
            </select>
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.reference}
            label="Reference / document number"
            required
          >
            <input
              className={inputClassName}
              name="reference"
              onChange={(event) => setReference(event.target.value)}
              required
              value={reference}
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.documentDate}
            label="Document date"
            required
          >
            <input
              className={inputClassName}
              name="documentDate"
              onChange={(event) => setDocumentDate(event.target.value)}
              required
              type="date"
              value={documentDate}
            />
          </ReviewField>
          <ReviewField error={state.fieldErrors?.dueDate} label="Due date">
            <input
              className={inputClassName}
              name="dueDate"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.currencyCode}
            label="Currency"
            required
          >
            <select
              className={inputClassName}
              name="currencyCode"
              onChange={(event) => setCurrencyCode(event.target.value)}
              required
              value={currencyCode}
            >
              <option value="">Confirm currency</option>
              {options.currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code}
                </option>
              ))}
            </select>
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.fxRate}
            label={`FX: 1 ${currencyCode || "transaction currency"} = Project currency`}
            required={Boolean(
              project &&
              currencyCode &&
              currencyCode !== project.reportingCurrencyCode,
            )}
          >
            <input
              className={inputClassName}
              inputMode="decimal"
              name="fxRate"
              onChange={(event) => setFxRate(event.target.value)}
              value={fxRate}
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.totalHt}
            label="Total HT"
            required
          >
            <input
              className={inputClassName}
              inputMode="decimal"
              name="totalHt"
              onChange={(event) => {
                const next = event.target.value;
                setTotalHt(next);
                setAllocations((current) =>
                  current.map((row) =>
                    row.basis === "PERCENTAGE"
                      ? {
                          ...row,
                          amount:
                            amountFromPercentage(next || "0", row.percentage) ??
                            row.amount,
                        }
                      : {
                          ...row,
                          percentage:
                            percentageFromAmount(next || "0", row.amount) ??
                            row.percentage,
                        },
                  ),
                );
              }}
              required
              value={totalHt}
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.vatTreatment}
            label="VAT treatment"
          >
            <select
              className={inputClassName}
              name="vatTreatment"
              onChange={(event) => setVatTreatment(event.target.value)}
              value={vatTreatment}
            >
              <option value="">Confirm separately</option>
              {[
                "DOMESTIC",
                "INTRA_EU_SUPPLY",
                "REVERSE_CHARGE",
                "EXPORT",
                "EXEMPT",
                "OUT_OF_SCOPE",
                "CUSTOM",
              ].map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </ReviewField>
          <ReviewField error={state.fieldErrors?.vatRate} label="VAT rate %">
            <PercentageInput
              className={inputClassName}
              onValueChange={setVatRate}
              value={vatRate}
            />
            <input
              name="vatRate"
              type="hidden"
              value={
                vatRate
                  ? (humanPercentageToFraction(vatRate, {
                      maximumPercent: "100",
                    }) ?? vatRate)
                  : ""
              }
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.vatAmount}
            label="VAT amount"
            required
          >
            <input
              className={inputClassName}
              inputMode="decimal"
              name="vatAmount"
              onChange={(event) => setVatAmount(event.target.value)}
              required
              value={vatAmount}
            />
          </ReviewField>
          <ReviewField
            error={state.fieldErrors?.totalTtc}
            label="Total TTC"
            required
          >
            <input
              className={inputClassName}
              inputMode="decimal"
              name="totalTtc"
              onChange={(event) => {
                const next = event.target.value;
                setTotalTtc(next);
                setSchedule((current) =>
                  current.map((row) =>
                    row.basis === "PERCENTAGE"
                      ? {
                          ...row,
                          fixedAmount:
                            amountFromPercentage(next || "0", row.percentage) ??
                            row.fixedAmount,
                        }
                      : {
                          ...row,
                          percentage:
                            percentageFromAmount(
                              next || "0",
                              row.fixedAmount,
                            ) ?? row.percentage,
                        },
                  ),
                );
              }}
              required
              value={totalTtc}
            />
          </ReviewField>
          <ReviewField error={state.fieldErrors?.notes} label="Notes">
            <input
              className={inputClassName}
              name="notes"
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </ReviewField>
        </div>
      </section>

      {documentType === "INVOICE" ? (
        <section className="bg-card rounded-lg border p-5">
          <h2 className="text-sm font-semibold">Invoice reconciliation</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Choose explicitly whether this Invoice links to a planned Client
            payment. Leaving it blank creates a new billing event.
          </p>
          <div className="mt-3 max-w-2xl">
            <ReviewField label="Planned Client payment">
              <select
                className={inputClassName}
                onChange={(event) =>
                  setMatchedInstallmentId(event.target.value)
                }
                value={matchedInstallmentId}
              >
                <option value="">
                  Create as a new billing event / no match
                </option>
                {matchable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.billingDocument.reference} · {item.label} ·{" "}
                    {item.scheduledAmount} {item.currencyCode} · due{" "}
                    {item.dueDate}
                  </option>
                ))}
              </select>
            </ReviewField>
          </div>
        </section>
      ) : null}

      {matchedInstallmentId ? (
        <section className="bg-card rounded-lg border p-5 text-sm">
          <h2 className="font-semibold">Payment schedule matched</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            This Invoice will use the explicitly selected planned payment. No
            second schedule will be created.
          </p>
        </section>
      ) : (
        <section className="bg-card rounded-lg border p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Proposed Client payment schedule
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Cash installments use TTC and are saved only with this
                confirmation.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSchedule((current) => [
                  ...current,
                  {
                    basis: "FIXED_AMOUNT",
                    dueDate: dueDate,
                    fixedAmount: "",
                    label: `Installment ${current.length + 1}`,
                    notes: "",
                    percentage: "",
                  },
                ])
              }
            >
              Add installment
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {schedule.map((item, index) => (
              <div
                className="grid gap-2 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-6"
                key={index}
              >
                <ReviewField
                  error={state.fieldErrors?.[`installments.${index}.label`]}
                  label="Installment label"
                  required
                >
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      setSchedule((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, label: event.target.value }
                            : row,
                        ),
                      )
                    }
                    value={item.label}
                  />
                </ReviewField>
                <ReviewField
                  error={
                    state.fieldErrors?.[`installments.${index}.percentageRate`]
                  }
                  label="Installment %"
                  required
                >
                  <PercentageInput
                    className={inputClassName}
                    onValueChange={(percentage) => {
                      setSchedule((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                basis: "PERCENTAGE",
                                fixedAmount:
                                  amountFromPercentage(
                                    totalTtc || "0",
                                    percentage,
                                  ) ?? row.fixedAmount,
                                percentage,
                              }
                            : row,
                        ),
                      );
                    }}
                    value={item.percentage}
                  />
                </ReviewField>
                <ReviewField
                  error={
                    state.fieldErrors?.[`installments.${index}.fixedAmount`]
                  }
                  label={`Installment amount (${currencyCode || "currency"})`}
                  required
                >
                  <input
                    className={inputClassName}
                    inputMode="decimal"
                    onChange={(event) => {
                      const fixedAmount = event.target.value;
                      setSchedule((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? {
                                ...row,
                                basis: "FIXED_AMOUNT",
                                fixedAmount,
                                percentage:
                                  percentageFromAmount(
                                    totalTtc || "0",
                                    fixedAmount,
                                  ) ?? row.percentage,
                              }
                            : row,
                        ),
                      );
                    }}
                    value={item.fixedAmount}
                  />
                </ReviewField>
                <ReviewField
                  error={state.fieldErrors?.[`installments.${index}.dueDate`]}
                  label="Due date"
                  required
                >
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      setSchedule((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, dueDate: event.target.value }
                            : row,
                        ),
                      )
                    }
                    type="date"
                    value={item.dueDate}
                  />
                </ReviewField>
                <ReviewField label="Notes">
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      setSchedule((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, notes: event.target.value }
                            : row,
                        ),
                      )
                    }
                    value={item.notes}
                  />
                </ReviewField>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setSchedule((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {schedule.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No schedule will be created unless you add one.
              </p>
            ) : null}
            {schedule.length ? (
              <div className="rounded-md border p-3 text-xs">
                <p>
                  Document TTC: {totalTtc || "—"} {currencyCode}
                </p>
                <p>
                  Scheduled TTC: {scheduled.allocated} {currencyCode}
                </p>
                <p>
                  {scheduleOverallocated
                    ? `Over-allocated: ${scheduled.overallocated}`
                    : `Remaining TTC: ${scheduled.remaining}`}{" "}
                  {currencyCode}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="bg-card rounded-lg border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Optional Supplier Order allocation (HT)
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Project-level billing is valid. Allocations never overwrite
              planned Supplier Order selling prices.
            </p>
          </div>
          <Button
            disabled={!projectId}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setAllocations((current) => [
                ...current,
                {
                  amount: "",
                  basis: "FIXED_AMOUNT",
                  orderId: "",
                  percentage: "",
                },
              ])
            }
          >
            Add allocation
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {allocations.map((item, index) => (
            <div
              className="grid gap-2 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-4"
              key={index}
            >
              <ReviewField
                error={state.fieldErrors?.[`allocations.${index}.orderId`]}
                label="Project Supplier Order"
                required
              >
                <select
                  className={inputClassName}
                  onChange={(event) =>
                    setAllocations((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, orderId: event.target.value }
                          : row,
                      ),
                    )
                  }
                  value={item.orderId}
                >
                  <option value="">Choose Project Supplier Order</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNumber}
                    </option>
                  ))}
                </select>
              </ReviewField>
              <ReviewField
                error={
                  state.fieldErrors?.[`allocations.${index}.percentageRate`]
                }
                label="% of Billing"
                required
              >
                <PercentageInput
                  className={inputClassName}
                  onValueChange={(percentage) => {
                    setAllocations((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              amount:
                                amountFromPercentage(
                                  totalHt || "0",
                                  percentage,
                                ) ?? row.amount,
                              basis: "PERCENTAGE",
                              percentage,
                            }
                          : row,
                      ),
                    );
                  }}
                  value={item.percentage}
                />
              </ReviewField>
              <ReviewField
                error={
                  state.fieldErrors?.[`allocations.${index}.allocatedAmount`]
                }
                label={`Supplier Order allocation HT (${currencyCode || "currency"})`}
                required
              >
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  onChange={(event) => {
                    const amount = event.target.value;
                    setAllocations((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              amount,
                              basis: "FIXED_AMOUNT",
                              percentage:
                                percentageFromAmount(totalHt || "0", amount) ??
                                row.percentage,
                            }
                          : row,
                      ),
                    );
                  }}
                  value={item.amount}
                />
              </ReviewField>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setAllocations((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        {allocations.length ? (
          <div className="mt-3 rounded-md border p-3 text-xs">
            <p>Document HT: {totalHt || "—"}</p>
            <p>Allocated HT: {allocation.allocated}</p>
            <p>
              {allocationOverallocated
                ? `Over-allocated: ${allocation.overallocated}`
                : `Project-level remainder: ${allocation.remaining}`}
            </p>
            {new Decimal(allocation.remaining).greaterThan(0) ? (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input
                  checked={isProjectRemainderApproved}
                  name="isProjectRemainderApproved"
                  onChange={(event) =>
                    setProjectRemainderApproved(event.target.checked)
                  }
                  type="checkbox"
                />
                Leave this remainder unallocated at Project level
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton
          disabled={scheduleOverallocated || allocationOverallocated}
          pending={pending}
        >
          Confirm and save Client billing
        </SubmitButton>
        {state.message ? (
          <p
            className={
              state.status === "error" ? "text-destructive text-sm" : "text-sm"
            }
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ClientDocumentIntake({ options }: { options: BillingOptions }) {
  const [state, action, pending] = useActionState(
    processClientDocumentAction,
    initialProcessing,
  );
  if (state.status === "ready" && state.review) {
    return <ClientDocumentReview options={options} review={state.review} />;
  }
  return (
    <section className="bg-card rounded-lg border p-5">
      <h2 className="font-semibold">Import Client Quote or Invoice</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Upload one temporary PDF. AI proposes structured values; an ADMIN or
        MANAGER must review before anything is saved.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Client PDF
          <input
            accept={ACCEPTED_CLIENT_DOCUMENT_TYPES}
            className="border-input bg-background max-w-xl rounded-lg border px-3 py-2 text-sm"
            name="clientDocument"
            required
            type="file"
          />
          <span className="text-muted-foreground text-xs font-normal">
            PDF only · maximum {MAX_CLIENT_DOCUMENT_LABEL}
          </span>
        </label>
        <SubmitButton pending={pending}>Extract for review</SubmitButton>
      </form>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-destructive mt-3 text-sm"
              : "mt-3 text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
