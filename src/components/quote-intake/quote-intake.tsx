"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useActionState, useCallback, useState } from "react";

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
import type { ExtractionStatus } from "@/domain/quote-intake/extraction";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { calculateQuoteSupplierPayable } from "@/domain/quote-intake/payment-schedule";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
import {
  dateOnlyToEuropeanInput,
  formatDateOnly,
} from "@/domain/payments/dates";
import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";
import { Button } from "@/components/ui/button";
import {
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import { PaymentScheduleEditor } from "@/components/quote-intake/payment-schedule-editor";
import { QuoteSupplierCreationForm } from "@/components/quote-intake/supplier-creation-form";
import { QuoteItemReview } from "@/components/quote-intake/quote-item-review";

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
  error,
  label,
  name,
  onCheckedChange,
  required = false,
}: {
  checked: boolean;
  children: React.ReactNode;
  error?: string | undefined;
  label: string;
  name: string;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  required?: boolean | undefined;
}) {
  return (
    <div className="bg-background rounded-md border p-3">
      <label className="mb-2 flex items-center gap-2 text-xs font-medium">
        <input
          {...(onCheckedChange
            ? {
                checked,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  onCheckedChange(event.target.checked),
              }
            : { defaultChecked: checked })}
          name={name}
          type="checkbox"
        />
        Apply {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function percentValue(value: string | null): string {
  return value === null ? "" : new Decimal(value).times(100).toString();
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
  const billingDocuments = options.billingDocuments.filter(
    (document) => document.projectId === review.projectId,
  );
  const selectedBillingDocument = options.billingDocuments.find(
    (document) => document.id === billingDocumentId,
  );
  const suggestedSupplier = review.supplierMatch.suggestedSupplierId ?? "";
  const financial = review.proposal.financial;
  const extraction = review.extraction;
  const [selectedSupplierId, setSelectedSupplierId] =
    useState(suggestedSupplier);
  const [createdSupplier, setCreatedSupplier] = useState<{
    displayName: string;
    id: string;
  } | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [billingDocumentId, setBillingDocumentId] = useState("");
  const [billingAllocationBasis, setBillingAllocationBasis] = useState<
    "FIXED_AMOUNT" | "PERCENTAGE"
  >("FIXED_AMOUNT");
  const [billingAllocatedAmount, setBillingAllocatedAmount] = useState("");
  const [billingPercentage, setBillingPercentage] = useState("");
  const [billingRemainderApproved, setBillingRemainderApproved] =
    useState(false);
  const [orderCurrencyCode, setOrderCurrencyCode] = useState(
    financial.currencyCode ?? "",
  );
  const [applyCurrency, setApplyCurrency] = useState(true);
  const [applyPurchaseCost, setApplyPurchaseCost] = useState(
    financial.purchaseCost !== null,
  );
  const [applyInputVat, setApplyInputVat] = useState(
    financial.inputVatAmount !== null || financial.inputVatRate !== null,
  );
  const [inputVatTreatment, setInputVatTreatment] = useState("");
  const [inputVatRecoverablePercent, setInputVatRecoverablePercent] =
    useState("");
  const showInputVatRecoverability =
    inputVatRecoverabilityApplies(inputVatTreatment);
  const [financialValues, setFinancialValues] = useState({
    freight: financial.freight ?? "",
    inputVatAmount: financial.inputVatAmount ?? "",
    inputVatTaxableBase: financial.inputVatTaxableBase ?? "",
    miscellaneous: financial.miscellaneous ?? "",
    purchaseCost: financial.purchaseCost ?? "",
  });
  const [inputVatRate, setInputVatRate] = useState(
    percentValue(financial.inputVatRate),
  );
  const fieldErrors = state.fieldErrors ?? {};
  const inputWithError = (field: string, className = inputClassName) =>
    `${className}${fieldErrors[field] ? " border-destructive focus-visible:border-destructive" : ""}`;
  const selectSupplier = useCallback(
    (supplier: { displayName: string; id: string }) => {
      setCreatedSupplier(supplier);
      setSelectedSupplierId(supplier.id);
    },
    [setCreatedSupplier, setSelectedSupplierId],
  );
  const selectableSuppliers = createdSupplier
    ? [
        ...options.suppliers.filter(
          (supplier) => supplier.id !== createdSupplier.id,
        ),
        createdSupplier,
      ].sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      )
    : options.suppliers;
  const supplierPayable = calculateQuoteSupplierPayable({
    applyInputVat,
    inputVatAmount: financialValues.inputVatAmount,
    inputVatRatePercent: inputVatRate,
    inputVatTaxableBase: financialValues.inputVatTaxableBase,
    inputVatTreatment,
    purchaseCost: applyPurchaseCost ? financialValues.purchaseCost : "",
  }).toFixed(4);
  const paymentCurrency =
    orderCurrencyCode || project?.reportingCurrencyCode || "EUR";
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
          <Link href={`/orders/${state.orderId}`}>Open Supplier Order</Link>
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
            displayValue={formatDateOnly(extraction.quote.quoteDate.value)}
            label="Quote date"
            observation={extraction.quote.quoteDate}
          />
          <ExtractedFact
            displayValue={formatDateOnly(extraction.quote.validityDate.value)}
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
            displayValue={formatDateOnly(
              extraction.leadTime.expectedDeliveryDate.value,
            )}
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
                      ? formatRate(line.rate.value)
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

      <QuoteSupplierCreationForm
        currencies={options.currencies}
        extraction={extraction}
        fallbackCurrencyCode={
          project?.reportingCurrencyCode ?? options.currencies[0]?.code ?? "EUR"
        }
        onSupplierSelected={selectSupplier}
      />

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
        <section className="bg-card rounded-lg border p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Destination</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Project
            <span aria-hidden="true" className="text-destructive ml-1">
              *
            </span>{" "}
            is locked to {project?.name ?? "the selected Project"}. Choose
            explicitly whether to create or update.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={actionType === "CREATE"}
                name="action"
                onChange={() => {
                  setActionType("CREATE");
                  setApplyBuildings(true);
                  setApplyCurrency(true);
                }}
                type="radio"
                value="CREATE"
              />
              Create Draft Supplier Order
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={actionType === "UPDATE"}
                name="action"
                onChange={() => {
                  setActionType("UPDATE");
                  setApplyBuildings(false);
                  setApplyCurrency(financial.currencyCode !== null);
                }}
                type="radio"
                value="UPDATE"
              />
              Update existing Supplier Order
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {actionType === "CREATE" ? (
              <Field
                error={fieldErrors.orderNumber}
                label="Internal Supplier Order reference"
                required
              >
                <input
                  aria-invalid={Boolean(fieldErrors.orderNumber) || undefined}
                  className={inputWithError("orderNumber")}
                  name="orderNumber"
                  onChange={(event) => setOrderNumber(event.target.value)}
                  required
                  value={orderNumber}
                />
              </Field>
            ) : (
              <div className="md:col-span-2">
                <Field
                  error={fieldErrors.orderId}
                  label="Existing Supplier Order in this Project"
                  required
                >
                  <select
                    aria-invalid={Boolean(fieldErrors.orderId) || undefined}
                    className={inputWithError("orderId")}
                    name="orderId"
                    required
                  >
                    <option value="">Choose Supplier Order</option>
                    {review.orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} · {order.packageName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field error={fieldErrors.supplierId} label="Supplier" required>
              <select
                aria-invalid={Boolean(fieldErrors.supplierId) || undefined}
                className={inputWithError("supplierId")}
                name="supplierId"
                onChange={(event) => setSelectedSupplierId(event.target.value)}
                required
                value={selectedSupplierId}
              >
                <option value="">Choose Supplier</option>
                {selectableSuppliers.map((supplier) => (
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
          <h2 className="text-sm font-semibold">
            Reviewed Supplier Order values
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Unchecked fields are ignored. On update, ignored or missing fields
            preserve the existing authoritative value.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ApplyField
              checked={financial.supplierQuoteReference !== null}
              error={fieldErrors.supplierQuoteReference}
              label="quote reference"
              name="applyQuoteReference"
            >
              <input
                aria-invalid={
                  Boolean(fieldErrors.supplierQuoteReference) || undefined
                }
                className={inputWithError("supplierQuoteReference")}
                defaultValue={financial.supplierQuoteReference ?? ""}
                name="supplierQuoteReference"
              />
            </ApplyField>
            <ApplyField
              checked={financial.quoteDate !== null}
              error={fieldErrors.quoteDate}
              label="quote date"
              name="applyQuoteDate"
            >
              <input
                aria-invalid={Boolean(fieldErrors.quoteDate) || undefined}
                className={inputWithError("quoteDate")}
                defaultValue={dateOnlyToEuropeanInput(financial.quoteDate)}
                inputMode="numeric"
                maxLength={10}
                name="quoteDate"
                pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                placeholder="DD/MM/YYYY"
                title="Enter a date as DD/MM/YYYY"
                type="text"
              />
            </ApplyField>
            <ApplyField
              checked={applyCurrency}
              error={fieldErrors.orderCurrencyCode}
              label="purchase currency"
              name="applyCurrency"
              onCheckedChange={(checked) =>
                setApplyCurrency(actionType === "CREATE" ? true : checked)
              }
              required={actionType === "CREATE"}
            >
              <select
                aria-invalid={
                  Boolean(fieldErrors.orderCurrencyCode) || undefined
                }
                className={inputWithError("orderCurrencyCode")}
                name="orderCurrencyCode"
                onChange={(event) => setOrderCurrencyCode(event.target.value)}
                required={actionType === "CREATE"}
                value={orderCurrencyCode}
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
              checked={applyPurchaseCost}
              error={fieldErrors.purchaseCost}
              label="supplier purchase HT"
              name="applyPurchaseCost"
              onCheckedChange={setApplyPurchaseCost}
            >
              <MoneyInput
                invalid={Boolean(fieldErrors.purchaseCost)}
                name="purchaseCost"
                onValueChange={(purchaseCost) =>
                  setFinancialValues((current) => ({
                    ...current,
                    purchaseCost,
                  }))
                }
                value={financialValues.purchaseCost}
              />
            </ApplyField>
            <ApplyField
              checked={financial.freight !== null}
              label="freight HT"
              name="applyFreight"
            >
              <MoneyInput
                name="freight"
                onValueChange={(freight) =>
                  setFinancialValues((current) => ({ ...current, freight }))
                }
                value={financialValues.freight}
              />
              <input
                name="freightTreatment"
                type="hidden"
                value="NOT_APPLICABLE"
              />
              <input name="freightResaleAmount" type="hidden" value="" />
              <p className="text-muted-foreground mt-2 text-xs">
                Enter 0.00 when freight is included in the Supplier price.
              </p>
            </ApplyField>
            <ApplyField
              checked={financial.miscellaneous !== null}
              label="other procurement costs HT"
              name="applyMiscellaneous"
            >
              <MoneyInput
                name="miscellaneous"
                onValueChange={(miscellaneous) =>
                  setFinancialValues((current) => ({
                    ...current,
                    miscellaneous,
                  }))
                }
                value={financialValues.miscellaneous}
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
                defaultValue={dateOnlyToEuropeanInput(
                  financial.expectedDeliveryDate,
                )}
                inputMode="numeric"
                maxLength={10}
                name="expectedDeliveryDate"
                pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                placeholder="DD/MM/YYYY"
                title="Enter a date as DD/MM/YYYY"
                type="text"
              />
            </ApplyField>
          </div>

          <div className="bg-background mt-4 rounded-md border p-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                checked={applyInputVat}
                name="applyInputVat"
                onChange={(event) => setApplyInputVat(event.target.checked)}
                type="checkbox"
              />
              Apply reviewed INPUT VAT
            </label>
            <p className="text-muted-foreground mt-1 text-xs">
              The AI does not select legal treatment or recoverability. Those
              management classifications require your decision.
            </p>
            {applyInputVat ? (
              <p className="text-muted-foreground mt-1 text-xs">
                <span aria-hidden="true" className="text-destructive mr-1">
                  *
                </span>
                Enter either a VAT rate or a VAT amount override.
              </p>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field
                error={fieldErrors.inputVatTreatment}
                label="Treatment"
                required={applyInputVat}
              >
                <select
                  aria-invalid={
                    Boolean(fieldErrors.inputVatTreatment) || undefined
                  }
                  className={inputWithError("inputVatTreatment")}
                  name="inputVatTreatment"
                  onChange={(event) => {
                    const treatment = event.target.value;
                    setInputVatTreatment(treatment);
                    if (!inputVatRecoverabilityApplies(treatment))
                      setInputVatRecoverablePercent("");
                  }}
                  required={applyInputVat}
                  value={inputVatTreatment}
                >
                  <option value="">Choose</option>
                  {options.vatTreatments.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              {showInputVatRecoverability ? (
                <Field
                  error={fieldErrors.inputVatRecoverableRate}
                  label="Recoverability %"
                  required={applyInputVat}
                >
                  <PercentageInput
                    className={inputWithError("inputVatRecoverableRate")}
                    invalid={Boolean(fieldErrors.inputVatRecoverableRate)}
                    name="inputVatRecoverablePercent"
                    onValueChange={setInputVatRecoverablePercent}
                    placeholder="100.00"
                    required={applyInputVat}
                    value={inputVatRecoverablePercent}
                  />
                </Field>
              ) : (
                <input
                  name="inputVatRecoverablePercent"
                  type="hidden"
                  value=""
                />
              )}
              <Field
                error={fieldErrors.inputVatTaxableBase}
                label="Taxable base HT"
                required={applyInputVat}
              >
                <MoneyInput
                  invalid={Boolean(fieldErrors.inputVatTaxableBase)}
                  name="inputVatTaxableBase"
                  onValueChange={(inputVatTaxableBase) =>
                    setFinancialValues((current) => ({
                      ...current,
                      inputVatTaxableBase,
                    }))
                  }
                  value={financialValues.inputVatTaxableBase}
                />
              </Field>
              <Field error={fieldErrors.inputVatRate} label="VAT rate %">
                <PercentageInput
                  className={inputWithError("inputVatRate")}
                  invalid={Boolean(fieldErrors.inputVatRate)}
                  name="inputVatRate"
                  onValueChange={setInputVatRate}
                  value={inputVatRate}
                />
              </Field>
              <Field
                error={fieldErrors.inputVatAmount}
                label="VAT amount override"
              >
                <MoneyInput
                  invalid={Boolean(fieldErrors.inputVatAmount)}
                  name="inputVatAmount"
                  onValueChange={(inputVatAmount) =>
                    setFinancialValues((current) => ({
                      ...current,
                      inputVatAmount,
                    }))
                  }
                  value={financialValues.inputVatAmount}
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
              {inputVatTreatment === "CUSTOM" ? (
                <div className="md:col-span-2 xl:col-span-4">
                  <Field
                    error={fieldErrors.inputVatCustomTreatmentNote}
                    label="Custom VAT treatment note"
                    required
                  >
                    <input
                      aria-invalid={
                        Boolean(fieldErrors.inputVatCustomTreatmentNote) ||
                        undefined
                      }
                      className={inputWithError("inputVatCustomTreatmentNote")}
                      name="inputVatCustomTreatmentNote"
                      required
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {billingDocuments.length ? (
          <section className="bg-card rounded-lg border p-4 sm:p-5">
            <h2 className="text-sm font-semibold">
              Optional Client Billing reconciliation
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Link the reviewed Supplier Order to an existing Billing Event from
              this Project, or skip and reconcile later.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Client Billing Event">
                <select
                  className={inputClassName}
                  name="billingDocumentId"
                  onChange={(event) => {
                    const selected = options.billingDocuments.find(
                      (document) => document.id === event.target.value,
                    );
                    setBillingDocumentId(event.target.value);
                    setBillingAllocatedAmount("");
                    setBillingPercentage("");
                    setBillingRemainderApproved(
                      selected?.isProjectRemainderApproved ?? false,
                    );
                  }}
                  value={billingDocumentId}
                >
                  <option value="">Skip for now</option>
                  {billingDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.reference} · {document.documentType} ·{" "}
                      {document.totalHt} {document.currencyCode}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedBillingDocument ? (
                <>
                  <Field label="Allocation basis">
                    <select
                      className={inputClassName}
                      name="billingAllocationBasis"
                      onChange={(event) =>
                        setBillingAllocationBasis(
                          event.target.value as "FIXED_AMOUNT" | "PERCENTAGE",
                        )
                      }
                      value={billingAllocationBasis}
                    >
                      <option value="FIXED_AMOUNT">Amount</option>
                      <option value="PERCENTAGE">Percentage</option>
                    </select>
                  </Field>
                  <Field
                    error={fieldErrors.billingPercentageRate}
                    label="% of Supplier Order"
                  >
                    <PercentageInput
                      className={inputClassName}
                      disabled={billingAllocationBasis !== "PERCENTAGE"}
                      name="billingPercentageRate"
                      onValueChange={(next) => {
                        setBillingPercentage(next);
                        setBillingAllocatedAmount("");
                      }}
                      value={billingPercentage}
                    />
                  </Field>
                  <Field
                    error={fieldErrors.billingAllocatedAmount}
                    label={`Allocation HT (${selectedBillingDocument.currencyCode})`}
                  >
                    <MoneyInput
                      disabled={billingAllocationBasis === "PERCENTAGE"}
                      invalid={Boolean(fieldErrors.billingAllocatedAmount)}
                      name="billingAllocatedAmount"
                      onValueChange={(next) => {
                        setBillingAllocatedAmount(next);
                      }}
                      placeholder={
                        billingAllocationBasis === "PERCENTAGE"
                          ? "Calculated from Supplier Order Sell HT on approval"
                          : "0.00"
                      }
                      value={billingAllocatedAmount}
                    />
                  </Field>
                  <div className="bg-background grid gap-2 rounded-md border p-3 text-xs sm:col-span-2 sm:grid-cols-3 xl:col-span-4">
                    <p>
                      Billing HT:{" "}
                      {formatMoney(
                        selectedBillingDocument.totalHt,
                        selectedBillingDocument.currencyCode,
                      )}
                    </p>
                    <p>
                      Already allocated:{" "}
                      {formatMoney(
                        selectedBillingDocument.allocatedHt,
                        selectedBillingDocument.currencyCode,
                      )}
                    </p>
                    <p>
                      Available:{" "}
                      {formatMoney(
                        Decimal.max(
                          new Decimal(selectedBillingDocument.totalHt).minus(
                            selectedBillingDocument.allocatedHt,
                          ),
                          0,
                        ).toFixed(4),
                        selectedBillingDocument.currencyCode,
                      )}
                    </p>
                    {billingAllocationBasis === "PERCENTAGE" ? (
                      <p className="text-muted-foreground sm:col-span-3">
                        The percentage is of the reviewed Supplier Order Sell
                        HT. Its allocation amount is calculated again from
                        authoritative Supplier Order pricing when you approve.
                      </p>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-xs sm:col-span-2 xl:col-span-4">
                    <input
                      checked={billingRemainderApproved}
                      name="billingRemainderApproved"
                      onChange={(event) =>
                        setBillingRemainderApproved(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Approve any remaining Billing HT at Project level
                  </label>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {review.itemReview ? (
          <QuoteItemReview options={options} review={review.itemReview} />
        ) : null}

        <PaymentScheduleEditor
          currencyCode={paymentCurrency}
          fieldErrors={fieldErrors}
          initialPayments={review.proposal.payments}
          supplierPayable={supplierPayable}
        />

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
          <Field label="Project" required>
            <select className={inputClassName} name="projectId" required>
              <option value="">Choose Project</option>
              {options.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier quote file" required>
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
