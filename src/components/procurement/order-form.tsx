"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createOrderAction,
  updateOrderAction,
} from "@/app/(app)/orders/actions";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { initialOrderActionState } from "@/components/procurement/action-state";
import { countries } from "@/config/countries";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import { addWeeksToDateOnly } from "@/domain/payments/dates";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
import { vatAmount as calculateVatAmount } from "@/domain/finance/calculations";
import {
  calculateOrderPricingDraft,
  effectiveVatBase,
  initializePricingMethod,
  type OrderPricingMethod,
} from "@/domain/finance/order-pricing";
import {
  type OrderDraft,
  updateOrderDraftField,
} from "@/domain/procurement/order-draft";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import {
  freightRecoveryTarget,
  resolveOrderFreightAllowance,
} from "@/domain/freight/calculations";
import {
  amountFromPercentage,
  percentageFromAmount,
} from "@/domain/billing/calculations";

interface BuildingOption {
  id: string;
  isActive: boolean;
  name: string;
  shortCode: string;
}
interface ProjectOption {
  buildings: BuildingOption[];
  client: { defaultCurrencyCode: string };
  id: string;
  name: string;
  defaultFreightMarkupRate: string;
  defaultOtherCostMarkupRate: string;
  defaultProductMarkupRate: string;
  freightEstimateRate: string | null;
  reportingCurrencyCode: string;
}
interface SupplierOption {
  defaultCurrencyCode: string;
  defaultLeadTimeWeeks: number | null;
  displayName: string;
  id: string;
}
interface VatView {
  amount: string;
  amountIsManual: boolean;
  countryCode: string | null;
  customTreatmentNote: string | null;
  rate: string | null;
  recoverability: string | null;
  taxableBase: string;
  treatment: string;
}
interface CostView {
  customsDuties: string | null;
  freight: string | null;
  inputVat: VatView | null;
  miscellaneous: string | null;
  outputVat: VatView | null;
  purchaseCost: string | null;
  purchaseFxRate: string | null;
  sellingFxRate: string | null;
}
export interface OrderFormOptions {
  billingDocuments: {
    currencyCode: string;
    documentType: string;
    id: string;
    isProjectRemainderApproved: boolean;
    projectId: string;
    reference: string;
    totalHt: string;
  }[];
  currencies: { code: string; name: string }[];
  freightTreatments: string[];
  pricingModes: string[];
  projects: ProjectOption[];
  statuses: string[];
  suppliers: SupplierOption[];
  vatRecoverabilities: string[];
  vatTreatments: string[];
}
export interface EditableOrder {
  actualDeliveryDate: string | null;
  buildingIds: string[];
  category: string | null;
  costs: CostView;
  description: string | null;
  expectedDeliveryDate: string | null;
  expectedReadyDate: string | null;
  freightResaleAmount: string | null;
  freightAllowanceOverrideAmount: string | null;
  freightTreatment: string;
  freightMarkupOverrideRate: string | null;
  id: string;
  leadTimeWeeks: number | null;
  notes: string | null;
  otherCostMarkupOverrideRate: string | null;
  outputVatTaxableBaseOverride: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  orderDate: string | null;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: string;
  productMarkupOverrideRate: string | null;
  project: { id: string; name: string };
  quoteDate: string | null;
  sellingCurrencyCode: string;
  status: string;
  supplier: SupplierOption;
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
}

const labels: Record<string, string> = {
  APPROVED: "Approved",
  BALANCE_DUE: "Balance due",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
  DELIVERED: "Delivered",
  DRAFT: "Draft",
  INCLUDED_IN_PACKAGE_PRICE: "Included in package price",
  NOT_APPLICABLE: "Not applicable",
  RECHARGED_SEPARATELY: "Recharged separately",
  PROJECT_MARKUP: "Project Markup",
  ORDER_MARKUP: "Specific Order Markup",
  DIRECT_SELLING_PRICE: "Direct Selling Price",
  RECOVERABLE: "Recoverable",
  NON_RECOVERABLE: "Non-recoverable",
};
function label(value: string): string {
  return (
    labels[value] ??
    value
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}
function editablePricingMethod(order?: EditableOrder): OrderPricingMethod {
  if (!order) return "PROJECT_MARKUP";
  if (
    order.pricingMode === "PROJECT_MARKUP" ||
    order.pricingMode === "ORDER_MARKUP" ||
    order.pricingMode === "DIRECT_SELLING_PRICE"
  )
    return order.pricingMode;
  if (order.pricingMode === "COMPONENT_MARKUP")
    return order.productMarkupOverrideRate !== null ||
      order.freightMarkupOverrideRate !== null ||
      order.otherCostMarkupOverrideRate !== null
      ? "ORDER_MARKUP"
      : "PROJECT_MARKUP";
  return "DIRECT_SELLING_PRICE";
}
function Money({
  error,
  label: fieldLabel,
  name,
  onValueChange,
  value,
}: {
  error?: string | undefined;
  label: string;
  name: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field error={error} label={fieldLabel}>
      <MoneyInput
        invalid={Boolean(error)}
        name={name}
        onValueChange={onValueChange}
        placeholder="0.00"
        value={value}
      />
    </Field>
  );
}
function InputVatFields({
  currency,
  draft,
  fieldErrors,
  onChange,
  options,
}: {
  currency: string;
  draft: OrderDraft;
  fieldErrors: Record<string, string>;
  onChange: <K extends keyof OrderDraft>(
    field: K,
    value: OrderDraft[K],
  ) => void;
  options: OrderFormOptions;
}) {
  const showRecoverability = inputVatRecoverabilityApplies(
    draft.inputVatTreatment,
  );
  const errorClass = (name: string) =>
    `${inputClassName}${fieldErrors[name] ? " border-destructive focus-visible:border-destructive" : ""}`;
  return (
    <section className="bg-background/60 rounded-md border p-3">
      <h4 className="text-xs font-semibold">Purchase VAT</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field error={fieldErrors.inputVatTreatment} label="Treatment">
          <select
            aria-invalid={Boolean(fieldErrors.inputVatTreatment) || undefined}
            className={errorClass("inputVatTreatment")}
            name="inputVatTreatment"
            onChange={(event) => {
              const nextTreatment = event.target.value;
              onChange("inputVatTreatment", nextTreatment);
              if (!inputVatRecoverabilityApplies(nextTreatment))
                onChange("inputVatRecoverability", "");
            }}
            value={draft.inputVatTreatment}
          >
            <option value="">Not recorded</option>
            {options.vatTreatments.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </Field>
        {showRecoverability ? (
          <Field
            error={fieldErrors.inputVatRecoverability}
            label="Recoverability"
          >
            <select
              aria-invalid={
                Boolean(fieldErrors.inputVatRecoverability) || undefined
              }
              className={errorClass("inputVatRecoverability")}
              name="inputVatRecoverability"
              onChange={(event) =>
                onChange("inputVatRecoverability", event.target.value)
              }
              value={draft.inputVatRecoverability}
            >
              <option value="">Choose</option>
              {options.vatRecoverabilities.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input name="inputVatRecoverability" type="hidden" value="" />
        )}
        <Money
          error={fieldErrors.inputVatTaxableBase}
          label={`Taxable base HT (${currency})`}
          name="inputVatTaxableBase"
          onValueChange={(value) => onChange("inputVatTaxableBase", value)}
          value={draft.inputVatTaxableBase}
        />
        <Field error={fieldErrors.inputVatRate} label="VAT rate %">
          <input
            aria-invalid={Boolean(fieldErrors.inputVatRate) || undefined}
            className={errorClass("inputVatRate")}
            inputMode="decimal"
            name="inputVatRate"
            onChange={(event) => onChange("inputVatRate", event.target.value)}
            placeholder="20.00"
            value={draft.inputVatRate}
          />
        </Field>
        <Money
          error={fieldErrors.inputVatAmount}
          label={`VAT amount override (${currency})`}
          name="inputVatAmount"
          onValueChange={(value) => onChange("inputVatAmount", value)}
          value={draft.inputVatAmount}
        />
        <Field error={fieldErrors.inputVatCountryCode} label="Country">
          <select
            aria-invalid={Boolean(fieldErrors.inputVatCountryCode) || undefined}
            className={errorClass("inputVatCountryCode")}
            name="inputVatCountryCode"
            onChange={(event) =>
              onChange("inputVatCountryCode", event.target.value)
            }
            value={draft.inputVatCountryCode}
          >
            <option value="">Not specified</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors.inputVatCustomTreatmentNote}
          label="Custom treatment note"
        >
          <input
            aria-invalid={
              Boolean(fieldErrors.inputVatCustomTreatmentNote) || undefined
            }
            className={errorClass("inputVatCustomTreatmentNote")}
            name="inputVatCustomTreatmentNote"
            onChange={(event) =>
              onChange("inputVatCustomTreatmentNote", event.target.value)
            }
            value={draft.inputVatCustomTreatmentNote}
          />
        </Field>
      </div>
    </section>
  );
}
export function OrderForm({
  onCancel,
  onSaved,
  options,
  order,
}: {
  onCancel?: () => void;
  onSaved?: () => void;
  options: OrderFormOptions;
  order?: EditableOrder;
}) {
  const router = useRouter();
  const isEditing = Boolean(order);
  const serverAction = order ? updateOrderAction : createOrderAction;
  const resilientAction = useCallback(
    async (
      previousState: typeof initialOrderActionState,
      formData: FormData,
    ) => {
      try {
        return await serverAction(previousState, formData);
      } catch {
        return {
          formError:
            "The save could not be completed. Your draft is still here; please try again.",
          message:
            "The save could not be completed. Your draft is still here; please try again.",
          status: "error" as const,
        };
      }
    },
    [serverAction],
  );
  const [state, action, pending] = useActionState(
    resilientAction,
    initialOrderActionState,
  );
  const initialProject =
    options.projects.find((item) => item.id === order?.project.id) ??
    options.projects[0];
  const initialSupplier =
    options.suppliers.find((item) => item.id === order?.supplier.id) ??
    options.suppliers[0];
  const [draft, setDraft] = useState<OrderDraft>(() => ({
    actualDeliveryDate: order?.actualDeliveryDate ?? "",
    buildingIds: order?.buildingIds ?? [],
    category: order?.category ?? "",
    customsDuties: order?.costs.customsDuties ?? "",
    description: order?.description ?? "",
    expectedDeliveryDate: order?.expectedDeliveryDate ?? "",
    expectedReadyDate: order?.expectedReadyDate ?? "",
    freight: order?.costs.freight ?? "",
    freightAllowanceMode:
      order?.freightAllowanceOverrideAmount === null ||
      order?.freightAllowanceOverrideAmount === undefined
        ? "AUTO"
        : "MANUAL",
    freightAllowanceOverrideAmount: order?.freightAllowanceOverrideAmount ?? "",
    freightMarkupOverridePercent: rateToPercentInput(
      order?.freightMarkupOverrideRate ?? null,
    ),
    freightResaleAmount: order?.freightResaleAmount ?? "",
    freightTreatment: order?.freightTreatment ?? "NOT_APPLICABLE",
    inputVatAmount: order?.costs.inputVat?.amountIsManual
      ? order.costs.inputVat.amount
      : "",
    inputVatCountryCode: order?.costs.inputVat?.countryCode ?? "",
    inputVatCustomTreatmentNote:
      order?.costs.inputVat?.customTreatmentNote ?? "",
    inputVatRate: rateToPercentInput(order?.costs.inputVat?.rate ?? null),
    inputVatRecoverability: order?.costs.inputVat?.recoverability ?? "",
    inputVatTaxableBase: order?.costs.inputVat?.taxableBase ?? "",
    inputVatTreatment: order?.costs.inputVat?.treatment ?? "",
    leadTimeWeeks:
      order?.leadTimeWeeks?.toString() ??
      initialSupplier?.defaultLeadTimeWeeks?.toString() ??
      "",
    miscellaneous: order?.costs.miscellaneous ?? "",
    notes: order?.notes ?? "",
    orderCurrencyCode:
      order?.orderCurrencyCode ??
      initialSupplier?.defaultCurrencyCode ??
      initialProject?.reportingCurrencyCode ??
      "EUR",
    orderDate: order?.orderDate ?? "",
    orderNumber: order?.orderNumber ?? "",
    otherCostMarkupOverridePercent: rateToPercentInput(
      order?.otherCostMarkupOverrideRate ?? null,
    ),
    outputVatBaseMode:
      order?.outputVatTaxableBaseOverride === null ||
      order?.outputVatTaxableBaseOverride === undefined
        ? "AUTO"
        : "MANUAL",
    outputVatCountryCode: order?.costs.outputVat?.countryCode ?? "",
    outputVatCustomTreatmentNote:
      order?.costs.outputVat?.customTreatmentNote ?? "",
    outputVatRate: rateToPercentInput(order?.costs.outputVat?.rate ?? null),
    outputVatTaxableBaseOverride: order?.outputVatTaxableBaseOverride ?? "",
    outputVatTreatment: order?.costs.outputVat?.treatment ?? "",
    packageName: order?.packageName ?? "",
    pricingMode: editablePricingMethod(order),
    productMarkupOverridePercent: rateToPercentInput(
      order?.productMarkupOverrideRate ?? null,
    ),
    projectId: order?.project.id ?? initialProject?.id ?? "",
    purchaseCost: order?.costs.purchaseCost ?? "",
    purchaseFxRate: order?.costs.purchaseFxRate ?? "",
    quoteDate: order?.quoteDate ?? "",
    sellingCurrencyCode:
      order?.sellingCurrencyCode ??
      initialProject?.client.defaultCurrencyCode ??
      initialProject?.reportingCurrencyCode ??
      "EUR",
    sellingFxRate: order?.costs.sellingFxRate ?? "",
    sellingPriceAmount: order?.packageSellingPrice ?? "",
    status: order?.status ?? "DRAFT",
    supplierId: order?.supplier.id ?? initialSupplier?.id ?? "",
    supplierOrderConfirmationReference:
      order?.supplierOrderConfirmationReference ?? "",
    supplierQuoteReference: order?.supplierQuoteReference ?? "",
  }));
  const [billingDocumentId, setBillingDocumentId] = useState("");
  const [billingAllocationBasis, setBillingAllocationBasis] = useState<
    "FIXED_AMOUNT" | "PERCENTAGE"
  >("FIXED_AMOUNT");
  const [billingAllocatedAmount, setBillingAllocatedAmount] = useState("");
  const [billingPercentage, setBillingPercentage] = useState("");
  const [billingRemainderApproved, setBillingRemainderApproved] =
    useState(false);
  function changeDraft<K extends keyof OrderDraft>(
    field: K,
    value: OrderDraft[K],
  ) {
    setDraft((current) => updateOrderDraftField(current, field, value));
  }
  const projectId = draft.projectId;
  const supplierId = draft.supplierId;
  const project = options.projects.find((item) => item.id === projectId);
  const availableBillingDocuments = options.billingDocuments.filter(
    (document) => document.projectId === projectId,
  );
  const selectedBillingDocument = options.billingDocuments.find(
    (document) => document.id === billingDocumentId,
  );
  const purchaseCurrency = draft.orderCurrencyCode;
  const sellingCurrency = draft.sellingCurrencyCode;
  const pricingMode = draft.pricingMode;
  const freightTreatment = draft.freightTreatment;
  const orderDate = draft.orderDate;
  const leadTimeWeeks = draft.leadTimeWeeks;
  const expectedReadyDate = draft.expectedReadyDate;
  const purchaseCost = draft.purchaseCost;
  const freightCost = draft.freight;
  const freightAllowanceIsManual = draft.freightAllowanceMode === "MANUAL";
  const customsCost = draft.customsDuties;
  const miscellaneousCost = draft.miscellaneous;
  const productMarkupOverride = draft.productMarkupOverridePercent;
  const freightMarkupOverride = draft.freightMarkupOverridePercent;
  const otherMarkupOverride = draft.otherCostMarkupOverridePercent;
  const purchaseFxRate = draft.purchaseFxRate;
  const sellingFxRate = draft.sellingFxRate;
  const directSellingPrice = draft.sellingPriceAmount;
  const freightResale = draft.freightResaleAmount;
  const outputVatTreatment = draft.outputVatTreatment;
  const outputVatRate = draft.outputVatRate;
  const manualOutputVatBase = draft.outputVatTaxableBaseOverride;
  const outputVatBaseIsManual = draft.outputVatBaseMode === "MANUAL";
  const toRate = (percent: string, inherited: string) =>
    humanPercentageToFraction(percent) ?? inherited;
  let livePricing: ReturnType<typeof calculateOrderPricingDraft> | null = null;
  try {
    if (project) {
      const useProjectDefaults = pricingMode === "PROJECT_MARKUP";
      livePricing = calculateOrderPricingDraft({
        directPackageSell: directSellingPrice || "0",
        freightCost: freightCost || "0",
        freightMarkupRate: useProjectDefaults
          ? project.defaultFreightMarkupRate
          : toRate(freightMarkupOverride, project.defaultFreightMarkupRate),
        freightResale: freightResale || "0",
        freightTreatment,
        method: pricingMode,
        otherCost: new Decimal(customsCost || 0)
          .plus(miscellaneousCost || 0)
          .toString(),
        otherMarkupRate: useProjectDefaults
          ? project.defaultOtherCostMarkupRate
          : toRate(otherMarkupOverride, project.defaultOtherCostMarkupRate),
        productCost: purchaseCost || "0",
        productMarkupRate: useProjectDefaults
          ? project.defaultProductMarkupRate
          : toRate(productMarkupOverride, project.defaultProductMarkupRate),
        purchaseCurrencyCode: purchaseCurrency,
        purchaseFxRate,
        reportingCurrencyCode: project.reportingCurrencyCode,
        sellingCurrencyCode: sellingCurrency,
        sellingFxRate,
      });
    }
  } catch {
    livePricing = null;
  }
  const automaticOutputVatBase = livePricing?.totalSell ?? null;
  let automaticFreightAllowance: string | null = null;
  let effectiveFreightAllowance: string | null = null;
  let freightRecovery: string | null = null;
  let freightProfit: string | null = null;
  try {
    if (project?.freightEstimateRate && livePricing?.productSell) {
      automaticFreightAllowance = resolveOrderFreightAllowance({
        productSellHt: livePricing.productSell,
        projectFreightEstimateRate: project.freightEstimateRate,
      }).amount.toFixed(4);
    }
    effectiveFreightAllowance = freightAllowanceIsManual
      ? new Decimal(draft.freightAllowanceOverrideAmount || "0").toFixed(4)
      : automaticFreightAllowance;
    const purchaseRate =
      purchaseCurrency === project?.reportingCurrencyCode
        ? new Decimal(1)
        : new Decimal(purchaseFxRate || "0");
    const reportingCost = new Decimal(freightCost || "0").times(purchaseRate);
    const effectiveMarkup =
      pricingMode === "ORDER_MARKUP"
        ? toRate(
            freightMarkupOverride,
            project?.defaultFreightMarkupRate ?? "0",
          )
        : (project?.defaultFreightMarkupRate ?? "0");
    freightRecovery = freightRecoveryTarget(
      reportingCost.toString(),
      effectiveMarkup,
    ).toFixed(4);
    freightProfit = new Decimal(freightRecovery)
      .minus(reportingCost)
      .toFixed(4);
  } catch {
    automaticFreightAllowance = null;
    effectiveFreightAllowance = null;
    freightRecovery = null;
    freightProfit = null;
  }
  const outputVatBase = effectiveVatBase(
    automaticOutputVatBase,
    outputVatBaseIsManual ? manualOutputVatBase || "0" : null,
  );
  let liveOutputVat = "0.0000";
  try {
    const normalizedOutputVatRate = humanPercentageToFraction(outputVatRate);
    if (outputVatTreatment && normalizedOutputVatRate !== null)
      liveOutputVat = calculateVatAmount(
        outputVatBase ?? "0",
        normalizedOutputVatRate,
      ).toFixed(4);
  } catch {
    liveOutputVat = "0.0000";
  }
  const liveTtc = automaticOutputVatBase
    ? new Decimal(automaticOutputVatBase).plus(liveOutputVat).toFixed(4)
    : null;
  function changePricingMethod(next: OrderPricingMethod) {
    if (!project) {
      changeDraft("pricingMode", next);
      return;
    }
    const initialized = initializePricingMethod(next, {
      effectiveFreightMarkupRate:
        pricingMode === "PROJECT_MARKUP"
          ? project.defaultFreightMarkupRate
          : toRate(freightMarkupOverride, project.defaultFreightMarkupRate),
      effectiveOtherMarkupRate:
        pricingMode === "PROJECT_MARKUP"
          ? project.defaultOtherCostMarkupRate
          : toRate(otherMarkupOverride, project.defaultOtherCostMarkupRate),
      effectiveProductMarkupRate:
        pricingMode === "PROJECT_MARKUP"
          ? project.defaultProductMarkupRate
          : toRate(productMarkupOverride, project.defaultProductMarkupRate),
      freightSell: livePricing?.freightSell ?? null,
      freightTreatment,
      totalSell: livePricing?.totalSell ?? null,
    });
    if ("productMarkupPercent" in initialized) {
      changeDraft(
        "productMarkupOverridePercent",
        initialized.productMarkupPercent,
      );
      changeDraft(
        "freightMarkupOverridePercent",
        initialized.freightMarkupPercent ?? "",
      );
      changeDraft(
        "otherCostMarkupOverridePercent",
        initialized.otherMarkupPercent ?? "",
      );
    }
    if ("directPackageSell" in initialized) {
      changeDraft("sellingPriceAmount", initialized.directPackageSell);
      changeDraft("freightResaleAmount", initialized.freightResale ?? "");
    }
    changeDraft("pricingMode", next);
  }
  function refreshExpectedReady(nextDate: string, nextWeeks: string) {
    const weeks = Number(nextWeeks);
    changeDraft(
      "expectedReadyDate",
      nextDate && Number.isInteger(weeks) && weeks >= 0
        ? addWeeksToDateOnly(nextDate, weeks)
        : "",
    );
  }
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state.fieldErrors ?? {};
  const errorClass = (name: string) =>
    `${inputClassName}${fieldErrors[name] ? " border-destructive focus-visible:border-destructive" : ""}`;
  useEffect(() => {
    if (state.status === "success" && state.orderId && !isEditing) {
      router.push(`/orders/${state.orderId}`);
    }
    if (state.status === "success" && isEditing) onSaved?.();
  }, [isEditing, onSaved, router, state.orderId, state.status]);
  useEffect(() => {
    if (state.status !== "error") return;
    const firstField = Object.keys(state.fieldErrors ?? {})[0];
    if (!firstField) return;
    const control = formRef.current?.elements.namedItem(firstField);
    if (control instanceof HTMLElement) control.focus();
  }, [state]);
  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {isEditing ? "Edit procurement order" : "Create procurement order"}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            One current purchase cost, explicit currency/FX, and independent
            VAT.
          </p>
        </div>
        {onCancel ? (
          <button
            className="text-muted-foreground text-sm"
            onClick={onCancel}
            type="button"
          >
            Close
          </button>
        ) : null}
      </div>
      <form action={action} className="space-y-5" ref={formRef}>
        {order ? <input name="id" type="hidden" value={order.id} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field error={fieldErrors.orderNumber} label="Internal reference">
            <input
              aria-invalid={Boolean(fieldErrors.orderNumber) || undefined}
              className={errorClass("orderNumber")}
              name="orderNumber"
              onChange={(event) =>
                changeDraft("orderNumber", event.target.value)
              }
              required
              value={draft.orderNumber}
            />
          </Field>
          <Field error={fieldErrors.packageName} label="Package title">
            <input
              aria-invalid={Boolean(fieldErrors.packageName) || undefined}
              className={errorClass("packageName")}
              name="packageName"
              onChange={(event) =>
                changeDraft("packageName", event.target.value)
              }
              required
              value={draft.packageName}
            />
          </Field>
          <Field error={fieldErrors.category} label="Category">
            <input
              aria-invalid={Boolean(fieldErrors.category) || undefined}
              className={errorClass("category")}
              name="category"
              onChange={(event) => changeDraft("category", event.target.value)}
              value={draft.category}
            />
          </Field>
          <Field error={fieldErrors.quoteDate} label="Supplier quote date">
            <input
              aria-invalid={Boolean(fieldErrors.quoteDate) || undefined}
              className={errorClass("quoteDate")}
              name="quoteDate"
              onChange={(event) => changeDraft("quoteDate", event.target.value)}
              type="date"
              value={draft.quoteDate}
            />
          </Field>
          <Field error={fieldErrors.status} label="Status">
            <select
              aria-invalid={Boolean(fieldErrors.status) || undefined}
              className={errorClass("status")}
              name="status"
              onChange={(event) => changeDraft("status", event.target.value)}
              value={draft.status}
            >
              {options.statuses.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field error={fieldErrors.projectId} label="Project">
            <select
              aria-invalid={Boolean(fieldErrors.projectId) || undefined}
              className={errorClass("projectId")}
              name="projectId"
              onChange={(event) => {
                const next = options.projects.find(
                  (item) => item.id === event.target.value,
                );
                changeDraft("projectId", event.target.value);
                setBillingDocumentId("");
                setBillingAllocatedAmount("");
                setBillingPercentage("");
                if (!isEditing && next)
                  changeDraft(
                    "sellingCurrencyCode",
                    next.client.defaultCurrencyCode ||
                      next.reportingCurrencyCode,
                  );
              }}
              value={projectId}
            >
              {options.projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field error={fieldErrors.supplierId} label="Supplier">
            <select
              aria-invalid={Boolean(fieldErrors.supplierId) || undefined}
              className={errorClass("supplierId")}
              name="supplierId"
              onChange={(event) => {
                const next = options.suppliers.find(
                  (item) => item.id === event.target.value,
                );
                changeDraft("supplierId", event.target.value);
                if (!isEditing && next)
                  changeDraft("orderCurrencyCode", next.defaultCurrencyCode);
                if (!isEditing && next) {
                  const nextLeadTime =
                    next.defaultLeadTimeWeeks?.toString() ?? "";
                  changeDraft("leadTimeWeeks", nextLeadTime);
                  refreshExpectedReady(orderDate, nextLeadTime);
                }
              }}
              value={supplierId}
            >
              {options.suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={fieldErrors.orderCurrencyCode}
            label="Purchase currency"
          >
            <select
              aria-invalid={Boolean(fieldErrors.orderCurrencyCode) || undefined}
              className={errorClass("orderCurrencyCode")}
              name="orderCurrencyCode"
              onChange={(event) =>
                changeDraft("orderCurrencyCode", event.target.value)
              }
              value={purchaseCurrency}
            >
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={fieldErrors.sellingCurrencyCode}
            label="Selling currency"
          >
            <select
              aria-invalid={
                Boolean(fieldErrors.sellingCurrencyCode) || undefined
              }
              className={errorClass("sellingCurrencyCode")}
              name="sellingCurrencyCode"
              onChange={(event) =>
                changeDraft("sellingCurrencyCode", event.target.value)
              }
              value={sellingCurrency}
            >
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={fieldErrors.supplierQuoteReference}
            label="Supplier quote reference"
          >
            <input
              aria-invalid={
                Boolean(fieldErrors.supplierQuoteReference) || undefined
              }
              className={errorClass("supplierQuoteReference")}
              name="supplierQuoteReference"
              onChange={(event) =>
                changeDraft("supplierQuoteReference", event.target.value)
              }
              value={draft.supplierQuoteReference}
            />
          </Field>
          <Field
            error={fieldErrors.supplierOrderConfirmationReference}
            label="Supplier confirmation reference"
          >
            <input
              aria-invalid={
                Boolean(fieldErrors.supplierOrderConfirmationReference) ||
                undefined
              }
              className={errorClass("supplierOrderConfirmationReference")}
              name="supplierOrderConfirmationReference"
              onChange={(event) =>
                changeDraft(
                  "supplierOrderConfirmationReference",
                  event.target.value,
                )
              }
              value={draft.supplierOrderConfirmationReference}
            />
          </Field>
          <Field error={fieldErrors.description} label="Description">
            <textarea
              aria-invalid={Boolean(fieldErrors.description) || undefined}
              className={`${errorClass("description")} h-20 py-2`}
              name="description"
              onChange={(event) =>
                changeDraft("description", event.target.value)
              }
              value={draft.description}
            />
          </Field>
          <Field error={fieldErrors.notes} label="Notes">
            <textarea
              aria-invalid={Boolean(fieldErrors.notes) || undefined}
              className={`${errorClass("notes")} h-20 py-2`}
              name="notes"
              onChange={(event) => changeDraft("notes", event.target.value)}
              value={draft.notes}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            Applicable buildings
          </legend>
          <div className="flex flex-wrap gap-2">
            {project?.buildings.map((building) => (
              <label
                className="bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                key={building.id}
              >
                <input
                  className="accent-primary size-4"
                  checked={draft.buildingIds.includes(building.id)}
                  disabled={
                    !building.isActive &&
                    !draft.buildingIds.includes(building.id)
                  }
                  name="buildingIds"
                  onChange={(event) =>
                    changeDraft(
                      "buildingIds",
                      event.target.checked
                        ? [...draft.buildingIds, building.id]
                        : draft.buildingIds.filter((id) => id !== building.id),
                    )
                  }
                  type="checkbox"
                  value={building.id}
                />
                {building.name}{" "}
                <span className="text-muted-foreground font-mono text-xs">
                  {building.shortCode}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <section className="bg-muted/20 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Procurement timing</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Business dates remain date-only. Expected ready is calculated from
            order date and lead time, and remains editable.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field error={fieldErrors.orderDate} label="Order date">
              <input
                aria-invalid={Boolean(fieldErrors.orderDate) || undefined}
                className={errorClass("orderDate")}
                name="orderDate"
                onChange={(event) => {
                  changeDraft("orderDate", event.target.value);
                  refreshExpectedReady(event.target.value, leadTimeWeeks);
                }}
                type="date"
                value={orderDate}
              />
            </Field>
            <Field error={fieldErrors.leadTimeWeeks} label="Lead time (weeks)">
              <input
                aria-invalid={Boolean(fieldErrors.leadTimeWeeks) || undefined}
                className={errorClass("leadTimeWeeks")}
                inputMode="numeric"
                max="520"
                min="0"
                name="leadTimeWeeks"
                onChange={(event) => {
                  changeDraft("leadTimeWeeks", event.target.value);
                  refreshExpectedReady(orderDate, event.target.value);
                }}
                type="number"
                value={leadTimeWeeks}
              />
            </Field>
            <Field error={fieldErrors.expectedReadyDate} label="Expected ready">
              <input
                aria-invalid={
                  Boolean(fieldErrors.expectedReadyDate) || undefined
                }
                className={errorClass("expectedReadyDate")}
                name="expectedReadyDate"
                onChange={(event) =>
                  changeDraft("expectedReadyDate", event.target.value)
                }
                type="date"
                value={expectedReadyDate}
              />
            </Field>
            <Field
              error={fieldErrors.expectedDeliveryDate}
              label="Expected delivery"
            >
              <input
                aria-invalid={
                  Boolean(fieldErrors.expectedDeliveryDate) || undefined
                }
                className={errorClass("expectedDeliveryDate")}
                name="expectedDeliveryDate"
                onChange={(event) =>
                  changeDraft("expectedDeliveryDate", event.target.value)
                }
                type="date"
                value={draft.expectedDeliveryDate}
              />
            </Field>
            <Field
              error={fieldErrors.actualDeliveryDate}
              label="Actual delivery"
            >
              <input
                aria-invalid={
                  Boolean(fieldErrors.actualDeliveryDate) || undefined
                }
                className={errorClass("actualDeliveryDate")}
                name="actualDeliveryDate"
                onChange={(event) =>
                  changeDraft("actualDeliveryDate", event.target.value)
                }
                type="date"
                value={draft.actualDeliveryDate}
              />
            </Field>
          </div>
        </section>
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Current procurement cost</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Amounts are HT in {purchaseCurrency}. Inputs stay plain while
              editing; read-only values are formatted.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              error={fieldErrors.purchaseCost}
              label="Product / supplier cost HT"
            >
              <MoneyInput
                invalid={Boolean(fieldErrors.purchaseCost)}
                name="purchaseCost"
                onValueChange={(value) => changeDraft("purchaseCost", value)}
                value={purchaseCost}
              />
            </Field>
            <Field error={fieldErrors.freight} label="Freight cost HT">
              <MoneyInput
                invalid={Boolean(fieldErrors.freight)}
                name="freight"
                onValueChange={(value) => changeDraft("freight", value)}
                value={freightCost}
              />
            </Field>
            <Field
              error={fieldErrors.customsDuties}
              label="Customs / duties HT"
            >
              <MoneyInput
                invalid={Boolean(fieldErrors.customsDuties)}
                name="customsDuties"
                onValueChange={(value) => changeDraft("customsDuties", value)}
                value={customsCost}
              />
            </Field>
            <Field error={fieldErrors.miscellaneous} label="Miscellaneous HT">
              <MoneyInput
                invalid={Boolean(fieldErrors.miscellaneous)}
                name="miscellaneous"
                onValueChange={(value) => changeDraft("miscellaneous", value)}
                value={miscellaneousCost}
              />
            </Field>
            <Field
              error={fieldErrors.purchaseFxRate}
              label={`Purchase FX (${purchaseCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                aria-invalid={Boolean(fieldErrors.purchaseFxRate) || undefined}
                className={`${errorClass("purchaseFxRate")} ${purchaseCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                disabled={purchaseCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="purchaseFxRate"
                onChange={(event) =>
                  changeDraft("purchaseFxRate", event.target.value)
                }
                placeholder={
                  purchaseCurrency === project?.reportingCurrencyCode
                    ? "1 (automatic)"
                    : "e.g. 0.857500"
                }
                value={purchaseFxRate}
              />
            </Field>
            <Field
              error={fieldErrors.sellingFxRate}
              label={`Selling FX (${sellingCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                aria-invalid={Boolean(fieldErrors.sellingFxRate) || undefined}
                className={`${errorClass("sellingFxRate")} ${sellingCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                disabled={sellingCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="sellingFxRate"
                onChange={(event) =>
                  changeDraft("sellingFxRate", event.target.value)
                }
                placeholder={
                  sellingCurrency === project?.reportingCurrencyCode
                    ? "1 (automatic)"
                    : "e.g. 1.170000"
                }
                value={sellingFxRate}
              />
            </Field>
          </div>
          <p className="text-muted-foreground text-xs">
            FX convention: 1 transaction-currency unit = X
            project-reporting-currency units.
          </p>
          <section className="bg-background/60 rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold">
                  Freight reconciliation
                </h4>
                <p className="text-muted-foreground mt-1 text-xs">
                  Cost, Client commercial allowance, and markup recovery remain
                  separate.
                </p>
              </div>
              <span className="rounded-md border px-2 py-1 text-xs font-medium">
                {freightAllowanceIsManual
                  ? "MANUAL"
                  : "AUTO · PROJECT ESTIMATE"}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Field label={`Actual freight cost HT (${purchaseCurrency})`}>
                <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                  {freightCost || "0.0000"}
                </p>
              </Field>
              <Field
                error={fieldErrors.freightAllowanceOverrideAmount}
                label={`Client freight allowance HT (${sellingCurrency})`}
              >
                {freightAllowanceIsManual ? (
                  <MoneyInput
                    invalid={Boolean(
                      fieldErrors.freightAllowanceOverrideAmount,
                    )}
                    name="freightAllowanceOverrideAmount"
                    onValueChange={(value) =>
                      changeDraft("freightAllowanceOverrideAmount", value)
                    }
                    value={draft.freightAllowanceOverrideAmount}
                  />
                ) : (
                  <>
                    <input
                      name="freightAllowanceOverrideAmount"
                      type="hidden"
                      value=""
                    />
                    <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                      {automaticFreightAllowance ?? "Incomplete"}
                    </p>
                  </>
                )}
              </Field>
              <Field label="Freight estimate %">
                <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                  {project?.freightEstimateRate
                    ? `${new Decimal(project.freightEstimateRate).times(100).toFixed(2)}%`
                    : "Not set"}
                </p>
              </Field>
              <Field
                label={`Freight recovery target HT (${project?.reportingCurrencyCode ?? "reporting"})`}
              >
                <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                  {freightRecovery ?? "Incomplete"}
                </p>
              </Field>
              <Field
                label={`Freight profit HT (${project?.reportingCurrencyCode ?? "reporting"})`}
              >
                <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                  {freightProfit ?? "Incomplete"}
                </p>
              </Field>
            </div>
            <button
              className="text-primary mt-3 text-sm font-medium"
              onClick={() => {
                if (freightAllowanceIsManual) {
                  changeDraft("freightAllowanceOverrideAmount", "");
                  changeDraft("freightAllowanceMode", "AUTO");
                } else {
                  changeDraft(
                    "freightAllowanceOverrideAmount",
                    effectiveFreightAllowance ?? "0",
                  );
                  changeDraft("freightAllowanceMode", "MANUAL");
                }
              }}
              type="button"
            >
              {freightAllowanceIsManual
                ? "Use Project freight estimate"
                : "Override freight allowance"}
            </button>
          </section>
          <div className="grid gap-3 xl:grid-cols-2">
            <InputVatFields
              currency={purchaseCurrency}
              draft={draft}
              fieldErrors={fieldErrors}
              onChange={changeDraft}
              options={options}
            />
            <section className="bg-background/60 rounded-md border p-3">
              <h4 className="text-xs font-semibold">Sales VAT</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field error={fieldErrors.outputVatTreatment} label="Treatment">
                  <select
                    aria-invalid={
                      Boolean(fieldErrors.outputVatTreatment) || undefined
                    }
                    className={errorClass("outputVatTreatment")}
                    name="outputVatTreatment"
                    onChange={(event) => {
                      changeDraft("outputVatTreatment", event.target.value);
                      if (!event.target.value) changeDraft("outputVatRate", "");
                    }}
                    value={outputVatTreatment}
                  >
                    <option value="">Not recorded</option>
                    {options.vatTreatments.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field error={fieldErrors.outputVatRate} label="VAT rate %">
                  <input
                    aria-invalid={
                      Boolean(fieldErrors.outputVatRate) || undefined
                    }
                    className={errorClass("outputVatRate")}
                    inputMode="decimal"
                    name="outputVatRate"
                    onChange={(event) =>
                      changeDraft("outputVatRate", event.target.value)
                    }
                    placeholder="20.00"
                    value={outputVatRate}
                  />
                </Field>
                <Field
                  error={fieldErrors.outputVatTaxableBaseOverride}
                  label={`VAT Base HT (${sellingCurrency}) · ${outputVatBaseIsManual ? "MANUAL OVERRIDE" : "AUTO"}`}
                >
                  {outputVatBaseIsManual ? (
                    <MoneyInput
                      name="outputVatTaxableBaseOverride"
                      invalid={Boolean(
                        fieldErrors.outputVatTaxableBaseOverride,
                      )}
                      onValueChange={(value) =>
                        changeDraft("outputVatTaxableBaseOverride", value)
                      }
                      value={manualOutputVatBase}
                    />
                  ) : (
                    <>
                      <input
                        name="outputVatTaxableBaseOverride"
                        type="hidden"
                        value=""
                      />
                      <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                        {outputVatBase ?? "Incomplete"}
                      </p>
                    </>
                  )}
                </Field>
                <div className="flex items-end">
                  <button
                    className="text-primary text-sm font-medium"
                    onClick={() => {
                      if (outputVatBaseIsManual) {
                        changeDraft("outputVatTaxableBaseOverride", "");
                        changeDraft("outputVatBaseMode", "AUTO");
                      } else {
                        changeDraft(
                          "outputVatTaxableBaseOverride",
                          automaticOutputVatBase ?? "0",
                        );
                        changeDraft("outputVatBaseMode", "MANUAL");
                      }
                    }}
                    type="button"
                  >
                    {outputVatBaseIsManual
                      ? "Use calculated VAT base"
                      : "Override VAT base"}
                  </button>
                </div>
                <Field label={`VAT amount (${sellingCurrency})`}>
                  <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                    {liveOutputVat}
                  </p>
                </Field>
                <Field label={`Selling TTC (${sellingCurrency})`}>
                  <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                    {liveTtc ?? "Incomplete"}
                  </p>
                </Field>
                <Field error={fieldErrors.outputVatCountryCode} label="Country">
                  <select
                    aria-invalid={
                      Boolean(fieldErrors.outputVatCountryCode) || undefined
                    }
                    className={errorClass("outputVatCountryCode")}
                    name="outputVatCountryCode"
                    onChange={(event) =>
                      changeDraft("outputVatCountryCode", event.target.value)
                    }
                    value={draft.outputVatCountryCode}
                  >
                    <option value="">Not specified</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  error={fieldErrors.outputVatCustomTreatmentNote}
                  label="Custom treatment note"
                >
                  <input
                    aria-invalid={
                      Boolean(fieldErrors.outputVatCustomTreatmentNote) ||
                      undefined
                    }
                    className={errorClass("outputVatCustomTreatmentNote")}
                    name="outputVatCustomTreatmentNote"
                    onChange={(event) =>
                      changeDraft(
                        "outputVatCustomTreatmentNote",
                        event.target.value,
                      )
                    }
                    value={draft.outputVatCustomTreatmentNote}
                  />
                </Field>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {outputVatBaseIsManual
                  ? "Pricing changes do not replace this manual base."
                  : "Calculated automatically from Total Sell HT."}
              </p>
            </section>
          </div>
        </section>
        <section className="bg-muted/20 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Commercial pricing</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field error={fieldErrors.pricingMode} label="Pricing method">
              <select
                aria-invalid={Boolean(fieldErrors.pricingMode) || undefined}
                className={errorClass("pricingMode")}
                name="pricingMode"
                onChange={(event) =>
                  changePricingMethod(event.target.value as OrderPricingMethod)
                }
                value={pricingMode}
              >
                {options.pricingModes.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              error={fieldErrors.freightTreatment}
              label="Freight treatment"
            >
              <select
                aria-invalid={
                  Boolean(fieldErrors.freightTreatment) || undefined
                }
                className={errorClass("freightTreatment")}
                name="freightTreatment"
                onChange={(event) =>
                  changeDraft("freightTreatment", event.target.value)
                }
                value={freightTreatment}
              >
                {options.freightTreatments.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {pricingMode === "PROJECT_MARKUP"
              ? "Uses this Project's default Product, Freight and Other Cost markup rates."
              : pricingMode === "ORDER_MARKUP"
                ? "Uses explicit markup rates for this Order only."
                : "Selling HT is entered directly; effective markup is calculated."}
          </p>
          {pricingMode === "ORDER_MARKUP" && project ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field
                error={fieldErrors.productMarkupOverridePercent}
                label="Product markup %"
              >
                <input
                  aria-invalid={
                    Boolean(fieldErrors.productMarkupOverridePercent) ||
                    undefined
                  }
                  className={errorClass("productMarkupOverridePercent")}
                  inputMode="decimal"
                  name="productMarkupOverridePercent"
                  onChange={(event) =>
                    changeDraft(
                      "productMarkupOverridePercent",
                      event.target.value,
                    )
                  }
                  placeholder="0.00"
                  value={productMarkupOverride}
                />
                <span className="text-muted-foreground text-xs">
                  Project default:{" "}
                  {new Decimal(project.defaultProductMarkupRate)
                    .times(100)
                    .toString()}
                  %
                </span>
              </Field>
              <Field
                error={fieldErrors.freightMarkupOverridePercent}
                label="Freight markup %"
              >
                <input
                  aria-invalid={
                    Boolean(fieldErrors.freightMarkupOverridePercent) ||
                    undefined
                  }
                  className={errorClass("freightMarkupOverridePercent")}
                  inputMode="decimal"
                  name="freightMarkupOverridePercent"
                  onChange={(event) =>
                    changeDraft(
                      "freightMarkupOverridePercent",
                      event.target.value,
                    )
                  }
                  placeholder="0.00"
                  value={freightMarkupOverride}
                />
                <span className="text-muted-foreground text-xs">
                  Project default:{" "}
                  {new Decimal(project.defaultFreightMarkupRate)
                    .times(100)
                    .toString()}
                  %
                </span>
              </Field>
              <Field
                error={fieldErrors.otherCostMarkupOverridePercent}
                label="Other Cost markup %"
              >
                <input
                  aria-invalid={
                    Boolean(fieldErrors.otherCostMarkupOverridePercent) ||
                    undefined
                  }
                  className={errorClass("otherCostMarkupOverridePercent")}
                  inputMode="decimal"
                  name="otherCostMarkupOverridePercent"
                  onChange={(event) =>
                    changeDraft(
                      "otherCostMarkupOverridePercent",
                      event.target.value,
                    )
                  }
                  placeholder="0.00"
                  value={otherMarkupOverride}
                />
                <span className="text-muted-foreground text-xs">
                  Project default:{" "}
                  {new Decimal(project.defaultOtherCostMarkupRate)
                    .times(100)
                    .toString()}
                  %
                </span>
              </Field>
            </div>
          ) : (
            <>
              <input
                name="productMarkupOverridePercent"
                type="hidden"
                value=""
              />
              <input
                name="freightMarkupOverridePercent"
                type="hidden"
                value=""
              />
              <input
                name="otherCostMarkupOverridePercent"
                type="hidden"
                value=""
              />
            </>
          )}
          {pricingMode === "PROJECT_MARKUP" && project ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["Product", project.defaultProductMarkupRate],
                ["Freight", project.defaultFreightMarkupRate],
                ["Other Cost", project.defaultOtherCostMarkupRate],
              ].map(([name, rate]) => (
                <div className="rounded-md border p-3 text-sm" key={name}>
                  <p className="text-muted-foreground text-xs">{name} markup</p>
                  <p className="financial-figure mt-1">
                    {new Decimal(rate ?? "0").times(100).toFixed(2)}% · Project
                    default
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {pricingMode === "DIRECT_SELLING_PRICE" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field
                error={fieldErrors.sellingPriceAmount}
                label={`Package selling HT (${sellingCurrency})`}
              >
                <MoneyInput
                  invalid={Boolean(fieldErrors.sellingPriceAmount)}
                  name="sellingPriceAmount"
                  onValueChange={(value) =>
                    changeDraft("sellingPriceAmount", value)
                  }
                  value={directSellingPrice}
                />
              </Field>
              {freightTreatment === "RECHARGED_SEPARATELY" ? (
                <Field
                  error={fieldErrors.freightResaleAmount}
                  label={`Separate freight resale HT (${sellingCurrency})`}
                >
                  <MoneyInput
                    invalid={Boolean(fieldErrors.freightResaleAmount)}
                    name="freightResaleAmount"
                    onValueChange={(value) =>
                      changeDraft("freightResaleAmount", value)
                    }
                    value={freightResale}
                  />
                </Field>
              ) : (
                <input name="freightResaleAmount" type="hidden" value="" />
              )}
              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground text-xs">
                  Effective package markup
                </p>
                <p className="financial-figure mt-1">
                  {livePricing?.productMarkupRate
                    ? `${new Decimal(livePricing.productMarkupRate).times(100).toFixed(2)}%`
                    : "Incomplete · FX or cost required"}
                </p>
              </div>
            </div>
          ) : (
            <>
              <input name="sellingPriceAmount" type="hidden" value="" />
              <input name="freightResaleAmount" type="hidden" value="" />
            </>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {pricingMode !== "DIRECT_SELLING_PRICE" ? (
              <>
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Product Sell HT
                  </p>
                  <p className="financial-figure mt-1">
                    {livePricing?.productSell ?? "Incomplete"}
                  </p>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground text-xs">
                    Freight Sell HT
                  </p>
                  <p className="financial-figure mt-1">
                    {livePricing?.freightSell ?? "Incomplete"}
                  </p>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-muted-foreground text-xs">Other Sell HT</p>
                  <p className="financial-figure mt-1">
                    {livePricing?.otherSell ?? "Incomplete"}
                  </p>
                </div>
              </>
            ) : null}
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground text-xs">Total Sell HT</p>
              <p className="financial-figure mt-1">
                {livePricing?.totalSell ?? "Incomplete"} {sellingCurrency}
              </p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground text-xs">
                Gross Profit / Effective Markup
              </p>
              <p className="financial-figure mt-1">
                {livePricing?.grossProfitReporting ?? "Incomplete"}{" "}
                {project?.reportingCurrencyCode ?? ""} /{" "}
                {livePricing?.effectiveMarkupRate
                  ? `${new Decimal(livePricing.effectiveMarkupRate).times(100).toFixed(2)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </section>
        {!isEditing && availableBillingDocuments.length ? (
          <section className="bg-muted/20 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">
              Optional Client Billing link
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Link this new Order to an existing Billing Event from the same
              Project. You can also reconcile it later from either detail page.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  {availableBillingDocuments.map((document) => (
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
                    label="Allocation %"
                  >
                    <input
                      className={inputClassName}
                      disabled={billingAllocationBasis !== "PERCENTAGE"}
                      inputMode="decimal"
                      onChange={(event) => {
                        const next = event.target.value;
                        setBillingPercentage(next);
                        setBillingAllocatedAmount(
                          amountFromPercentage(
                            selectedBillingDocument.totalHt,
                            next,
                          ) ?? "",
                        );
                      }}
                      value={billingPercentage}
                    />
                    <input
                      name="billingPercentageRate"
                      type="hidden"
                      value={
                        billingAllocationBasis === "PERCENTAGE"
                          ? (humanPercentageToFraction(billingPercentage) ??
                            billingPercentage)
                          : ""
                      }
                    />
                  </Field>
                  <Field
                    error={fieldErrors.billingAllocatedAmount}
                    label={`Allocation HT (${selectedBillingDocument.currencyCode})`}
                  >
                    <input
                      className={inputClassName}
                      inputMode="decimal"
                      name="billingAllocatedAmount"
                      onChange={(event) => {
                        const next = event.target.value;
                        setBillingAllocatedAmount(next);
                        setBillingPercentage(
                          percentageFromAmount(
                            selectedBillingDocument.totalHt,
                            next,
                          ) ?? "",
                        );
                      }}
                      value={billingAllocatedAmount}
                    />
                  </Field>
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
        <div className="flex items-center gap-3">
          <SubmitButton pending={pending}>
            {isEditing ? "Save order" : "Create order"}
          </SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}
