"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

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
  targetMarginRate: string | null;
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
  defaultValue,
  label: fieldLabel,
  name,
}: {
  defaultValue?: string | null | undefined;
  label: string;
  name: string;
}) {
  return (
    <Field label={fieldLabel}>
      <MoneyInput
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder="0.00"
      />
    </Field>
  );
}
function VatFields({
  direction,
  currency,
  options,
  value,
}: {
  direction: "input" | "output";
  currency: string;
  options: OrderFormOptions;
  value: VatView | null;
}) {
  const prefix = direction === "input" ? "Purchase" : "Sales";
  const [treatment, setTreatment] = useState(value?.treatment ?? "");
  const [recoverability, setRecoverability] = useState(
    value?.recoverability ?? "",
  );
  const showRecoverability =
    direction === "input" && inputVatRecoverabilityApplies(treatment);
  return (
    <section className="bg-background/60 rounded-md border p-3">
      <h4 className="text-xs font-semibold">{prefix} VAT</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Treatment">
          <select
            className={inputClassName}
            name={`${direction}VatTreatment`}
            onChange={(event) => {
              const nextTreatment = event.target.value;
              setTreatment(nextTreatment);
              if (!inputVatRecoverabilityApplies(nextTreatment))
                setRecoverability("");
            }}
            value={treatment}
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
          <Field label="Recoverability">
            <select
              className={inputClassName}
              name="inputVatRecoverability"
              onChange={(event) => setRecoverability(event.target.value)}
              value={recoverability}
            >
              <option value="">Choose</option>
              {options.vatRecoverabilities.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
        ) : direction === "input" ? (
          <input name="inputVatRecoverability" type="hidden" value="" />
        ) : null}
        <Money
          defaultValue={value?.taxableBase}
          label={`Taxable base HT (${currency})`}
          name={`${direction}VatTaxableBase`}
        />
        <Field label="VAT rate %">
          <input
            className={inputClassName}
            defaultValue={rateToPercentInput(value?.rate ?? null)}
            inputMode="decimal"
            name={`${direction}VatRate`}
            placeholder="20.00"
          />
        </Field>
        <Money
          defaultValue={value?.amountIsManual ? value.amount : ""}
          label={`VAT amount override (${currency})`}
          name={`${direction}VatAmount`}
        />
        <Field label="Country">
          <select
            className={inputClassName}
            defaultValue={value?.countryCode ?? ""}
            name={`${direction}VatCountryCode`}
          >
            <option value="">Not specified</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          Custom treatment note
          <input
            className={inputClassName}
            defaultValue={value?.customTreatmentNote ?? ""}
            name={`${direction}VatCustomTreatmentNote`}
          />
        </label>
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
  const [state, action, pending] = useActionState(
    serverAction,
    initialOrderActionState,
  );
  const [projectId, setProjectId] = useState(
    order?.project.id ?? options.projects[0]?.id ?? "",
  );
  const [supplierId, setSupplierId] = useState(
    order?.supplier.id ?? options.suppliers[0]?.id ?? "",
  );
  const project = options.projects.find((item) => item.id === projectId);
  const supplier = options.suppliers.find((item) => item.id === supplierId);
  const [purchaseCurrency, setPurchaseCurrency] = useState(
    order?.orderCurrencyCode ??
      supplier?.defaultCurrencyCode ??
      project?.reportingCurrencyCode ??
      "EUR",
  );
  const [sellingCurrency, setSellingCurrency] = useState(
    order?.sellingCurrencyCode ??
      project?.client.defaultCurrencyCode ??
      project?.reportingCurrencyCode ??
      "EUR",
  );
  const [pricingMode, setPricingMode] = useState<OrderPricingMethod>(
    editablePricingMethod(order),
  );
  const [freightTreatment, setFreightTreatment] = useState(
    order?.freightTreatment ?? "NOT_APPLICABLE",
  );
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [leadTimeWeeks, setLeadTimeWeeks] = useState(
    order?.leadTimeWeeks?.toString() ??
      supplier?.defaultLeadTimeWeeks?.toString() ??
      "",
  );
  const [expectedReadyDate, setExpectedReadyDate] = useState(
    order?.expectedReadyDate ?? "",
  );
  const [purchaseCost, setPurchaseCost] = useState(
    order?.costs.purchaseCost ?? "",
  );
  const [freightCost, setFreightCost] = useState(order?.costs.freight ?? "");
  const [customsCost, setCustomsCost] = useState(
    order?.costs.customsDuties ?? "",
  );
  const [miscellaneousCost, setMiscellaneousCost] = useState(
    order?.costs.miscellaneous ?? "",
  );
  const [productMarkupOverride, setProductMarkupOverride] = useState(
    rateToPercentInput(order?.productMarkupOverrideRate ?? null),
  );
  const [freightMarkupOverride, setFreightMarkupOverride] = useState(
    rateToPercentInput(order?.freightMarkupOverrideRate ?? null),
  );
  const [otherMarkupOverride, setOtherMarkupOverride] = useState(
    rateToPercentInput(order?.otherCostMarkupOverrideRate ?? null),
  );
  const [purchaseFxRate, setPurchaseFxRate] = useState(
    order?.costs.purchaseFxRate ?? "",
  );
  const [sellingFxRate, setSellingFxRate] = useState(
    order?.costs.sellingFxRate ?? "",
  );
  const [directSellingPrice, setDirectSellingPrice] = useState(
    order?.packageSellingPrice ?? "",
  );
  const [freightResale, setFreightResale] = useState(
    order?.freightResaleAmount ?? "",
  );
  const [outputVatTreatment, setOutputVatTreatment] = useState(
    order?.costs.outputVat?.treatment ?? "",
  );
  const [outputVatRate, setOutputVatRate] = useState(
    rateToPercentInput(order?.costs.outputVat?.rate ?? null),
  );
  const [manualOutputVatBase, setManualOutputVatBase] = useState(
    order?.outputVatTaxableBaseOverride ?? "",
  );
  const [outputVatBaseIsManual, setOutputVatBaseIsManual] = useState(
    order?.outputVatTaxableBaseOverride !== null &&
      order?.outputVatTaxableBaseOverride !== undefined,
  );
  const toRate = (percent: string, inherited: string) =>
    percent.trim() ? new Decimal(percent).dividedBy(100).toString() : inherited;
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
  const outputVatBase = effectiveVatBase(
    automaticOutputVatBase,
    outputVatBaseIsManual ? manualOutputVatBase || "0" : null,
  );
  let liveOutputVat = "0.0000";
  try {
    if (outputVatTreatment)
      liveOutputVat = calculateVatAmount(
        outputVatBase ?? "0",
        outputVatRate ? new Decimal(outputVatRate).dividedBy(100) : "0",
      ).toFixed(4);
  } catch {
    liveOutputVat = "0.0000";
  }
  const liveTtc = automaticOutputVatBase
    ? new Decimal(automaticOutputVatBase).plus(liveOutputVat).toFixed(4)
    : null;
  function changePricingMethod(next: OrderPricingMethod) {
    if (!project) return setPricingMode(next);
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
      setProductMarkupOverride(initialized.productMarkupPercent);
      setFreightMarkupOverride(initialized.freightMarkupPercent ?? "");
      setOtherMarkupOverride(initialized.otherMarkupPercent ?? "");
    }
    if ("directPackageSell" in initialized) {
      setDirectSellingPrice(initialized.directPackageSell);
      setFreightResale(initialized.freightResale ?? "");
    }
    setPricingMode(next);
  }
  function refreshExpectedReady(nextDate: string, nextWeeks: string) {
    const weeks = Number(nextWeeks);
    setExpectedReadyDate(
      nextDate && Number.isInteger(weeks) && weeks >= 0
        ? addWeeksToDateOnly(nextDate, weeks)
        : "",
    );
  }
  useEffect(() => {
    if (state.status === "success" && state.orderId && !isEditing) {
      router.push(`/orders/${state.orderId}`);
    }
    if (state.status === "success" && isEditing) onSaved?.();
  }, [isEditing, onSaved, router, state.orderId, state.status]);
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
      <form action={action} className="space-y-5">
        {order ? <input name="id" type="hidden" value={order.id} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Internal reference">
            <input
              className={inputClassName}
              defaultValue={order?.orderNumber}
              name="orderNumber"
              required
            />
          </Field>
          <Field label="Package title">
            <input
              className={inputClassName}
              defaultValue={order?.packageName}
              name="packageName"
              required
            />
          </Field>
          <Field label="Category">
            <input
              className={inputClassName}
              defaultValue={order?.category ?? ""}
              name="category"
            />
          </Field>
          <Field label="Supplier quote date">
            <input
              className={inputClassName}
              defaultValue={order?.quoteDate ?? ""}
              name="quoteDate"
              type="date"
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              defaultValue={order?.status ?? "DRAFT"}
              name="status"
            >
              {options.statuses.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              className={inputClassName}
              name="projectId"
              onChange={(event) => {
                const next = options.projects.find(
                  (item) => item.id === event.target.value,
                );
                setProjectId(event.target.value);
                if (!isEditing && next)
                  setSellingCurrency(
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
          <Field label="Supplier">
            <select
              className={inputClassName}
              name="supplierId"
              onChange={(event) => {
                const next = options.suppliers.find(
                  (item) => item.id === event.target.value,
                );
                setSupplierId(event.target.value);
                if (!isEditing && next)
                  setPurchaseCurrency(next.defaultCurrencyCode);
                if (!isEditing && next) {
                  const nextLeadTime =
                    next.defaultLeadTimeWeeks?.toString() ?? "";
                  setLeadTimeWeeks(nextLeadTime);
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
          <Field label="Purchase currency">
            <select
              className={inputClassName}
              name="orderCurrencyCode"
              onChange={(event) => setPurchaseCurrency(event.target.value)}
              value={purchaseCurrency}
            >
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Selling currency">
            <select
              className={inputClassName}
              name="sellingCurrencyCode"
              onChange={(event) => setSellingCurrency(event.target.value)}
              value={sellingCurrency}
            >
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier quote reference">
            <input
              className={inputClassName}
              defaultValue={order?.supplierQuoteReference ?? ""}
              name="supplierQuoteReference"
            />
          </Field>
          <Field label="Supplier confirmation reference">
            <input
              className={inputClassName}
              defaultValue={order?.supplierOrderConfirmationReference ?? ""}
              name="supplierOrderConfirmationReference"
            />
          </Field>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
            <span>Description</span>
            <textarea
              className={`${inputClassName} h-20 py-2`}
              defaultValue={order?.description ?? ""}
              name="description"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
            <span>Notes</span>
            <textarea
              className={`${inputClassName} h-20 py-2`}
              defaultValue={order?.notes ?? ""}
              name="notes"
            />
          </label>
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
                  defaultChecked={order?.buildingIds.includes(building.id)}
                  disabled={
                    !building.isActive &&
                    !order?.buildingIds.includes(building.id)
                  }
                  name="buildingIds"
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
            <Field label="Order date">
              <input
                className={inputClassName}
                name="orderDate"
                onChange={(event) => {
                  setOrderDate(event.target.value);
                  refreshExpectedReady(event.target.value, leadTimeWeeks);
                }}
                type="date"
                value={orderDate}
              />
            </Field>
            <Field label="Lead time (weeks)">
              <input
                className={inputClassName}
                inputMode="numeric"
                max="520"
                min="0"
                name="leadTimeWeeks"
                onChange={(event) => {
                  setLeadTimeWeeks(event.target.value);
                  refreshExpectedReady(orderDate, event.target.value);
                }}
                type="number"
                value={leadTimeWeeks}
              />
            </Field>
            <Field label="Expected ready">
              <input
                className={inputClassName}
                name="expectedReadyDate"
                onChange={(event) => setExpectedReadyDate(event.target.value)}
                type="date"
                value={expectedReadyDate}
              />
            </Field>
            <Field label="Expected delivery">
              <input
                className={inputClassName}
                defaultValue={order?.expectedDeliveryDate ?? ""}
                name="expectedDeliveryDate"
                type="date"
              />
            </Field>
            <Field label="Actual delivery">
              <input
                className={inputClassName}
                defaultValue={order?.actualDeliveryDate ?? ""}
                name="actualDeliveryDate"
                type="date"
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
            <Field label="Product / supplier cost HT">
              <MoneyInput
                name="purchaseCost"
                onValueChange={setPurchaseCost}
                value={purchaseCost}
              />
            </Field>
            <Field label="Freight cost HT">
              <MoneyInput
                name="freight"
                onValueChange={setFreightCost}
                value={freightCost}
              />
            </Field>
            <Field label="Customs / duties HT">
              <MoneyInput
                name="customsDuties"
                onValueChange={setCustomsCost}
                value={customsCost}
              />
            </Field>
            <Field label="Miscellaneous HT">
              <MoneyInput
                name="miscellaneous"
                onValueChange={setMiscellaneousCost}
                value={miscellaneousCost}
              />
            </Field>
            <Field
              label={`Purchase FX (${purchaseCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                className={`${inputClassName} ${purchaseCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                disabled={purchaseCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="purchaseFxRate"
                onChange={(event) => setPurchaseFxRate(event.target.value)}
                placeholder={
                  purchaseCurrency === project?.reportingCurrencyCode
                    ? "1 (automatic)"
                    : "e.g. 0.857500"
                }
                value={purchaseFxRate}
              />
            </Field>
            <Field
              label={`Selling FX (${sellingCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                className={`${inputClassName} ${sellingCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                disabled={sellingCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="sellingFxRate"
                onChange={(event) => setSellingFxRate(event.target.value)}
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
          <div className="grid gap-3 xl:grid-cols-2">
            <VatFields
              currency={purchaseCurrency}
              direction="input"
              options={options}
              value={order?.costs.inputVat ?? null}
            />
            <section className="bg-background/60 rounded-md border p-3">
              <h4 className="text-xs font-semibold">Sales VAT</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Treatment">
                  <select
                    className={inputClassName}
                    name="outputVatTreatment"
                    onChange={(event) => {
                      setOutputVatTreatment(event.target.value);
                      if (!event.target.value) setOutputVatRate("");
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
                <Field label="VAT rate %">
                  <input
                    className={inputClassName}
                    inputMode="decimal"
                    name="outputVatRate"
                    onChange={(event) => setOutputVatRate(event.target.value)}
                    placeholder="20.00"
                    value={outputVatRate}
                  />
                </Field>
                <Field
                  label={`VAT Base HT (${sellingCurrency}) · ${outputVatBaseIsManual ? "MANUAL OVERRIDE" : "AUTO"}`}
                >
                  {outputVatBaseIsManual ? (
                    <MoneyInput
                      name="outputVatTaxableBaseOverride"
                      onValueChange={setManualOutputVatBase}
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
                        setManualOutputVatBase("");
                        setOutputVatBaseIsManual(false);
                      } else {
                        setManualOutputVatBase(automaticOutputVatBase ?? "0");
                        setOutputVatBaseIsManual(true);
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
                  <input name="outputVatAmount" type="hidden" value="" />
                </Field>
                <Field label={`Selling TTC (${sellingCurrency})`}>
                  <p className="financial-figure bg-muted rounded-md border px-3 py-2">
                    {liveTtc ?? "Incomplete"}
                  </p>
                </Field>
                <Field label="Country">
                  <select
                    className={inputClassName}
                    defaultValue={order?.costs.outputVat?.countryCode ?? ""}
                    name="outputVatCountryCode"
                  >
                    <option value="">Not specified</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="grid gap-1.5 text-sm font-medium">
                  Custom treatment note
                  <input
                    className={inputClassName}
                    defaultValue={
                      order?.costs.outputVat?.customTreatmentNote ?? ""
                    }
                    name="outputVatCustomTreatmentNote"
                  />
                </label>
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
            <Field label="Pricing method">
              <select
                className={inputClassName}
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
            <Field label="Freight treatment">
              <select
                className={inputClassName}
                name="freightTreatment"
                onChange={(event) => setFreightTreatment(event.target.value)}
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
              <Field label="Product markup %">
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  name="productMarkupOverridePercent"
                  onChange={(event) =>
                    setProductMarkupOverride(event.target.value)
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
              <Field label="Freight markup %">
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  name="freightMarkupOverridePercent"
                  onChange={(event) =>
                    setFreightMarkupOverride(event.target.value)
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
              <Field label="Other Cost markup %">
                <input
                  className={inputClassName}
                  inputMode="decimal"
                  name="otherCostMarkupOverridePercent"
                  onChange={(event) =>
                    setOtherMarkupOverride(event.target.value)
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
              <Field label={`Package selling HT (${sellingCurrency})`}>
                <MoneyInput
                  name="sellingPriceAmount"
                  onValueChange={setDirectSellingPrice}
                  value={directSellingPrice}
                />
              </Field>
              {freightTreatment === "RECHARGED_SEPARATELY" ? (
                <Field
                  label={`Separate freight resale HT (${sellingCurrency})`}
                >
                  <MoneyInput
                    name="freightResaleAmount"
                    onValueChange={setFreightResale}
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
          <input name="targetMarginPercent" type="hidden" value="" />
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
