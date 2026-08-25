"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  confirmSupplierQuoteAction,
  processSupplierQuoteAction,
} from "@/app/(app)/orders/import/actions";
import {
  ACCEPTED_QUOTE_FILE_TYPES,
  MAX_QUOTE_FILE_LABEL,
} from "@/config/quote-extraction";
import { countries } from "@/config/countries";
import {
  initialQuoteConfirmationState,
  initialQuoteProcessingState,
} from "@/domain/quote-intake/action-state";
import type {
  ExtractionStatus,
  QuotePaymentProposal,
} from "@/domain/quote-intake/extraction";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";
import { Button } from "@/components/ui/button";
import {
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";

function statusLabel(status: ExtractionStatus): string {
  return status.toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function ExtractedFact({
  displayValue,
  label,
  observation,
}: {
  displayValue?: string | undefined;
  label: string;
  observation: {
    diagnostic: string | null;
    status: ExtractionStatus;
    value: unknown;
  };
}) {
  const value =
    displayValue ??
    (typeof observation.value === "string" ? observation.value : "—");
  return (
    <div className="bg-background rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span
          className={
            observation.status === "EXTRACTED"
              ? "bg-positive-muted text-positive rounded-full px-2 py-0.5 text-[11px] font-medium"
              : observation.status === "AMBIGUOUS"
                ? "bg-warning-muted text-warning-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
                : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
          }
        >
          {statusLabel(observation.status)}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
      {observation.diagnostic ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {observation.diagnostic}
        </p>
      ) : null}
    </div>
  );
}

function ApplyField({
  checked,
  children,
  label,
  name,
}: {
  checked: boolean;
  children: React.ReactNode;
  label: string;
  name: string;
}) {
  return (
    <div className="bg-background rounded-md border p-3">
      <label className="mb-2 flex items-center gap-2 text-xs font-medium">
        <input defaultChecked={checked} name={name} type="checkbox" />
        Apply {label}
      </label>
      {children}
    </div>
  );
}

function percentValue(value: string | null): string {
  return value === null ? "" : new Decimal(value).times(100).toString();
}

function PaymentProposalFields({
  index,
  payment,
}: {
  index: number;
  payment: QuotePaymentProposal;
}) {
  const basis =
    payment.basis === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE";
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-5">
      <Field label="Label">
        <input
          className={inputClassName}
          defaultValue={payment.label}
          name={`payment.${index}.label`}
        />
      </Field>
      <Field label="Basis">
        <select
          className={inputClassName}
          defaultValue={basis}
          name={`payment.${index}.basis`}
        >
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED_AMOUNT">Fixed amount</option>
        </select>
      </Field>
      <Field label="Percentage %">
        <input
          className={inputClassName}
          defaultValue={percentValue(payment.percentageRate)}
          inputMode="decimal"
          name={`payment.${index}.percentageRate`}
        />
      </Field>
      <Field label="Fixed amount">
        <input
          className={inputClassName}
          defaultValue={payment.fixedAmount ?? ""}
          inputMode="decimal"
          name={`payment.${index}.fixedAmount`}
        />
      </Field>
      <Field label="Due date">
        <input
          className={inputClassName}
          defaultValue={payment.dueDate ?? ""}
          name={`payment.${index}.dueDate`}
          type="date"
        />
      </Field>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2 xl:col-span-5">
        Extracted timing wording
        <input
          className={inputClassName}
          defaultValue={payment.timingDescription ?? ""}
          name={`payment.${index}.timingDescription`}
        />
      </label>
    </div>
  );
}

function QuoteReview({
  options,
  review,
}: {
  options: QuoteIntakeOptions;
  review: ProcessedQuoteReview;
}) {
  const [actionType, setActionType] = useState<"CREATE" | "UPDATE">("CREATE");
  const [applyBuildings, setApplyBuildings] = useState(true);
  const [state, action, pending] = useActionState(
    confirmSupplierQuoteAction,
    initialQuoteConfirmationState,
  );
  const project = options.projects.find((item) => item.id === review.projectId);
  const suggestedSupplier = review.supplierMatch.suggestedSupplierId ?? "";
  const financial = review.proposal.financial;
  const extraction = review.extraction;
  const extractedCurrency =
    extraction.quote.currencyCode.status === "EXTRACTED"
      ? (extraction.quote.currencyCode.value ?? "Currency unconfirmed")
      : "Currency unconfirmed";
  const moneyDisplay = (observation: {
    status: ExtractionStatus;
    value: string | null;
  }) =>
    observation.status === "EXTRACTED" && observation.value !== null
      ? formatMoney(observation.value, extractedCurrency)
      : undefined;

  if (state.status === "success" && state.orderId) {
    return (
      <section className="bg-card rounded-lg border p-5">
        <h2 className="text-base font-semibold">Quote import saved</h2>
        <p className="text-muted-foreground mt-2 text-sm">{state.message}</p>
        <Button asChild className="mt-4">
          <Link href={`/orders/${state.orderId}`}>Open Procurement Order</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="bg-card rounded-lg border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Extraction review</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {review.originalFilename} · {review.provider} / {review.model}
            </p>
          </div>
          <p className="text-positive text-sm" role="status">
            Source file released after processing
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ExtractedFact
            label="Supplier legal name"
            observation={extraction.supplier.legalName}
          />
          <ExtractedFact
            label="Supplier display name"
            observation={extraction.supplier.displayName}
          />
          <ExtractedFact
            label="Supplier VAT number"
            observation={extraction.supplier.vatNumber}
          />
          <ExtractedFact
            label="Supplier address"
            observation={extraction.supplier.address}
          />
          <ExtractedFact
            label="Supplier email"
            observation={extraction.supplier.email}
          />
          <ExtractedFact
            label="Supplier phone"
            observation={extraction.supplier.phone}
          />
          <ExtractedFact
            label="Quote reference"
            observation={extraction.quote.reference}
          />
          <ExtractedFact
            label="Quote date"
            observation={extraction.quote.quoteDate}
          />
          <ExtractedFact
            label="Validity date"
            observation={extraction.quote.validityDate}
          />
          <ExtractedFact
            label="Currency"
            observation={extraction.quote.currencyCode}
          />
          <ExtractedFact
            label="Lead-time wording"
            observation={extraction.leadTime.raw}
          />
          <ExtractedFact
            label="Production-time wording"
            observation={extraction.leadTime.productionTimeRaw}
          />
          <ExtractedFact
            label="Expected-delivery wording"
            observation={extraction.leadTime.expectedDeliveryRaw}
          />
          <ExtractedFact
            label="Expected-delivery date"
            observation={extraction.leadTime.expectedDeliveryDate}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.goodsSubtotalHt)}
            label="Goods subtotal HT"
            observation={extraction.financials.goodsSubtotalHt}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.freightHt)}
            label="Freight HT"
            observation={extraction.financials.freightHt}
          />
          <ExtractedFact
            label="Freight relationship to total"
            observation={extraction.financials.freightRelationToTotal}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.otherChargesHt)}
            label="Other charges HT"
            observation={extraction.financials.otherChargesHt}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.totalHt)}
            label="Total HT"
            observation={extraction.financials.totalHt}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.totalVat)}
            label="Total VAT"
            observation={extraction.financials.totalVat}
          />
          <ExtractedFact
            displayValue={moneyDisplay(extraction.financials.totalTtc)}
            label="Total TTC"
            observation={extraction.financials.totalTtc}
          />
          <ExtractedFact
            label="Payment terms wording"
            observation={extraction.paymentTerms.raw}
          />
        </div>
        {extraction.financials.vatLines.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Observed VAT lines</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {extraction.financials.vatLines.map((line, index) => (
                <div
                  className="bg-background grid gap-2 rounded-md border p-3"
                  key={`${line.label.value ?? "VAT"}-${index}`}
                >
                  <p className="text-xs font-semibold">
                    {line.label.value ?? `VAT line ${index + 1}`}
                  </p>
                  <p className="text-sm">
                    Base: {moneyDisplay(line.taxableBase) ?? "—"}
                  </p>
                  <p className="text-sm">
                    Rate:{" "}
                    {line.rate.status === "EXTRACTED" && line.rate.value
                      ? `${percentValue(line.rate.value)}%`
                      : "—"}
                  </p>
                  <p className="text-sm">
                    Amount: {moneyDisplay(line.amount) ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {review.proposal.warnings.length ? (
          <div className="bg-warning-muted mt-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Review warnings</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {review.proposal.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <form action={action} className="space-y-5">
        <input name="projectId" type="hidden" value={review.projectId} />
        <input
          name="originalFilename"
          type="hidden"
          value={review.originalFilename}
        />
        <input
          name="leadTimeRaw"
          type="hidden"
          value={extraction.leadTime.raw.value ?? ""}
        />
        <input
          name="paymentTermsRaw"
          type="hidden"
          value={extraction.paymentTerms.raw.value ?? ""}
        />
        <input
          name="paymentCount"
          type="hidden"
          value={review.proposal.payments.length}
        />

        <section className="bg-card rounded-lg border p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Destination</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            The Project is locked to {project?.name ?? "the selected Project"}.
            Choose explicitly whether to create or update.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={actionType === "CREATE"}
                name="action"
                onChange={() => {
                  setActionType("CREATE");
                  setApplyBuildings(true);
                }}
                type="radio"
                value="CREATE"
              />
              Create Draft Order
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={actionType === "UPDATE"}
                name="action"
                onChange={() => {
                  setActionType("UPDATE");
                  setApplyBuildings(false);
                }}
                type="radio"
                value="UPDATE"
              />
              Update existing Order
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {actionType === "CREATE" ? (
              <>
                <Field label="Internal Order reference">
                  <input className={inputClassName} name="orderNumber" />
                </Field>
                <Field label="Package title">
                  <input
                    className={inputClassName}
                    defaultValue={
                      extraction.supplier.displayName.value ??
                      extraction.supplier.legalName.value ??
                      ""
                    }
                    name="packageName"
                  />
                </Field>
              </>
            ) : (
              <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
                Existing Order in this Project
                <select className={inputClassName} name="orderId">
                  <option value="">Choose Order</option>
                  {review.orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNumber} · {order.packageName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field label="Existing Supplier">
              <select
                className={inputClassName}
                defaultValue={suggestedSupplier}
                name="supplierId"
              >
                <option value="">Choose Supplier</option>
                {options.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <div className="text-muted-foreground self-end pb-2 text-xs">
              Match: {review.supplierMatch.status.replaceAll("_", " ")}
              {review.supplierMatch.basis
                ? ` by ${review.supplierMatch.basis.replaceAll("_", " ").toLowerCase()}`
                : ""}
            </div>
          </div>
          {project?.buildings.length ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Buildings</legend>
              <label className="mt-2 flex items-center gap-2 text-xs font-medium">
                <input
                  checked={applyBuildings}
                  name="applyBuildings"
                  onChange={(event) => setApplyBuildings(event.target.checked)}
                  type="checkbox"
                />
                Apply this Building selection (leave unchecked on update to
                preserve existing Buildings)
              </label>
              <div className="mt-2 flex flex-wrap gap-3">
                {project.buildings
                  .filter((building) => building.isActive)
                  .map((building) => (
                    <label
                      className="flex items-center gap-2 text-sm"
                      key={building.id}
                    >
                      <input
                        name="buildingIds"
                        type="checkbox"
                        value={building.id}
                      />
                      {building.shortCode || building.name}
                    </label>
                  ))}
              </div>
            </fieldset>
          ) : null}
        </section>

        <section className="bg-card rounded-lg border p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Reviewed Order values</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Unchecked fields are ignored. On update, ignored or missing fields
            preserve the existing authoritative value.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ApplyField
              checked={financial.supplierQuoteReference !== null}
              label="quote reference"
              name="applyQuoteReference"
            >
              <input
                className={inputClassName}
                defaultValue={financial.supplierQuoteReference ?? ""}
                name="supplierQuoteReference"
              />
            </ApplyField>
            <ApplyField
              checked={financial.quoteDate !== null}
              label="quote date"
              name="applyQuoteDate"
            >
              <input
                className={inputClassName}
                defaultValue={financial.quoteDate ?? ""}
                name="quoteDate"
                type="date"
              />
            </ApplyField>
            <ApplyField
              checked={financial.currencyCode !== null}
              label="purchase currency"
              name="applyCurrency"
            >
              <select
                className={inputClassName}
                defaultValue={financial.currencyCode ?? ""}
                name="orderCurrencyCode"
              >
                <option value="">Choose currency</option>
                {options.currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currency.name}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClassName} mt-2`}
                inputMode="decimal"
                name="purchaseFxRate"
                placeholder={`FX to ${project?.reportingCurrencyCode ?? "reporting currency"}`}
              />
            </ApplyField>
            <ApplyField
              checked={financial.purchaseCost !== null}
              label="supplier purchase HT"
              name="applyPurchaseCost"
            >
              <input
                className={inputClassName}
                defaultValue={financial.purchaseCost ?? ""}
                inputMode="decimal"
                name="purchaseCost"
              />
            </ApplyField>
            <ApplyField
              checked={financial.freight !== null}
              label="freight HT"
              name="applyFreight"
            >
              <input
                className={inputClassName}
                defaultValue={financial.freight ?? ""}
                inputMode="decimal"
                name="freight"
              />
              <select
                className={`${inputClassName} mt-2`}
                defaultValue={
                  financial.freight
                    ? "INCLUDED_IN_PACKAGE_PRICE"
                    : "NOT_APPLICABLE"
                }
                name="freightTreatment"
              >
                {options.freightTreatments.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClassName} mt-2`}
                inputMode="decimal"
                name="freightResaleAmount"
                placeholder="Separate freight resale, if applicable"
              />
            </ApplyField>
            <ApplyField
              checked={financial.miscellaneous !== null}
              label="other procurement costs HT"
              name="applyMiscellaneous"
            >
              <input
                className={inputClassName}
                defaultValue={financial.miscellaneous ?? ""}
                inputMode="decimal"
                name="miscellaneous"
              />
            </ApplyField>
            <ApplyField
              checked={financial.leadTimeWeeks !== null}
              label="lead time"
              name="applyLeadTime"
            >
              <input
                className={inputClassName}
                defaultValue={financial.leadTimeWeeks ?? ""}
                inputMode="numeric"
                name="leadTimeWeeks"
              />
            </ApplyField>
            <ApplyField
              checked={financial.expectedDeliveryDate !== null}
              label="expected delivery date"
              name="applyExpectedDeliveryDate"
            >
              <input
                className={inputClassName}
                defaultValue={financial.expectedDeliveryDate ?? ""}
                name="expectedDeliveryDate"
                type="date"
              />
            </ApplyField>
          </div>

          <div className="bg-background mt-4 rounded-md border p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                defaultChecked={
                  financial.inputVatAmount !== null ||
                  financial.inputVatRate !== null
                }
                name="applyInputVat"
                type="checkbox"
              />
              Apply reviewed INPUT VAT
            </label>
            <p className="text-muted-foreground mt-1 text-xs">
              The AI does not select legal treatment or recoverability. Those
              management classifications require your decision.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Treatment">
                <select className={inputClassName} name="inputVatTreatment">
                  <option value="">Choose</option>
                  {options.vatTreatments.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recoverability">
                <select
                  className={inputClassName}
                  name="inputVatRecoverability"
                >
                  <option value="">Choose</option>
                  {options.vatRecoverabilities.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Taxable base HT">
                <input
                  className={inputClassName}
                  defaultValue={financial.inputVatTaxableBase ?? ""}
                  inputMode="decimal"
                  name="inputVatTaxableBase"
                />
              </Field>
              <Field label="VAT rate %">
                <input
                  className={inputClassName}
                  defaultValue={percentValue(financial.inputVatRate)}
                  inputMode="decimal"
                  name="inputVatRate"
                />
              </Field>
              <Field label="VAT amount override">
                <input
                  className={inputClassName}
                  defaultValue={financial.inputVatAmount ?? ""}
                  inputMode="decimal"
                  name="inputVatAmount"
                />
              </Field>
              <Field label="VAT country">
                <select className={inputClassName} name="inputVatCountryCode">
                  <option value="">Not specified</option>
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Supplier payment proposal</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Wording is preserved. Missing dates are never fabricated. Editing
            these rows does not save them until you explicitly approve below.
          </p>
          <div className="mt-4 space-y-3">
            {review.proposal.payments.length ? (
              review.proposal.payments.map((payment, index) => (
                <PaymentProposalFields
                  index={index}
                  key={`${payment.label}-${index}`}
                  payment={payment}
                />
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No structured installment proposal was extracted.
              </p>
            )}
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm font-medium">
            <input className="mt-0.5" name="approveSchedule" type="checkbox" />
            <span>
              I approve creating these supplier-payment installments with the
              reviewed amounts, percentages, and due dates.
            </span>
          </label>
        </section>

        {state.message ? (
          <p
            className="text-destructive text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
        <SubmitButton pending={pending}>
          {pending ? "Saving reviewed quote…" : "Confirm reviewed quote"}
        </SubmitButton>
      </form>
    </div>
  );
}

export function QuoteIntake({ options }: { options: QuoteIntakeOptions }) {
  const [state, action, pending] = useActionState(
    processSupplierQuoteAction,
    initialQuoteProcessingState,
  );

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-lg border p-4 sm:p-5">
        <h2 className="text-sm font-semibold">1. Process one quote</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          PDF, JPG, JPEG, or PNG up to {MAX_QUOTE_FILE_LABEL}. The source is
          held only for this extraction request and is not saved.
        </p>
        <form
          action={action}
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
        >
          <Field label="Project">
            <select className={inputClassName} name="projectId" required>
              <option value="">Choose Project</option>
              {options.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier quote file">
            <input
              accept={ACCEPTED_QUOTE_FILE_TYPES}
              className="border-input bg-background file:bg-muted file:text-foreground h-9 w-full rounded-lg border px-2 py-1 text-sm file:mr-3 file:rounded-md file:border-0 file:px-2 file:py-1"
              name="quoteFile"
              required
              type="file"
            />
          </Field>
          <SubmitButton pending={pending}>
            {pending ? "Processing quote…" : "Process quote"}
          </SubmitButton>
        </form>
        {pending ? (
          <p className="text-muted-foreground mt-3 text-sm" role="status">
            Uploading securely and extracting one structured review…
          </p>
        ) : null}
        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-destructive mt-3 text-sm"
                : "text-positive mt-3 text-sm"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </section>
      {state.review ? (
        <QuoteReview options={options} review={state.review} />
      ) : null}
    </div>
  );
}
