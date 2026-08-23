"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  createOrderAction,
  updateOrderAction,
} from "@/app/(app)/orders/actions";
import {
  ActionFeedback,
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { initialOrderActionState } from "@/components/procurement/action-state";
import { countries } from "@/config/countries";
import { rateToPercentInput } from "@/domain/procurement/presentation";

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
  reportingCurrencyCode: string;
}
interface SupplierOption {
  defaultCurrencyCode: string;
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
  buildingIds: string[];
  category: string | null;
  costs: CostView;
  description: string | null;
  freightResaleAmount: string | null;
  freightTreatment: string;
  id: string;
  notes: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: string;
  project: { id: string; name: string };
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
  SELLING_PRICE: "Enter selling price",
  TARGET_MARGIN: "Calculate from target margin",
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
      <input
        className={inputClassName}
        defaultValue={defaultValue ?? ""}
        inputMode="decimal"
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
  return (
    <section className="bg-background/60 rounded-md border p-3">
      <h4 className="text-xs font-semibold">{prefix} VAT</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Treatment">
          <select
            className={inputClassName}
            defaultValue={value?.treatment ?? ""}
            name={`${direction}VatTreatment`}
          >
            <option value="">Not recorded</option>
            {options.vatTreatments.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </Field>
        {direction === "input" ? (
          <Field label="Recoverability">
            <select
              className={inputClassName}
              defaultValue={value?.recoverability ?? ""}
              name="inputVatRecoverability"
            >
              <option value="">Choose</option>
              {options.vatRecoverabilities.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </Field>
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
  options,
  order,
}: {
  onCancel?: () => void;
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
  const project = useMemo(
    () => options.projects.find((item) => item.id === projectId),
    [options.projects, projectId],
  );
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
  const [pricingMode, setPricingMode] = useState(
    order?.pricingMode ?? "SELLING_PRICE",
  );
  const [freightTreatment, setFreightTreatment] = useState(
    order?.freightTreatment ?? "NOT_APPLICABLE",
  );
  useEffect(() => {
    if (state.status === "success" && state.orderId) {
      if (isEditing) router.refresh();
      else router.push(`/orders/${state.orderId}`);
    }
  }, [isEditing, router, state.orderId, state.status]);
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
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Current procurement cost</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Amounts are HT in {purchaseCurrency}. Inputs stay plain while
              editing; read-only values are formatted.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Money
              defaultValue={order?.costs.purchaseCost}
              label="Purchase cost HT"
              name="purchaseCost"
            />
            <Money
              defaultValue={order?.costs.freight}
              label="Freight cost"
              name="freight"
            />
            <Money
              defaultValue={order?.costs.customsDuties}
              label="Customs / duties"
              name="customsDuties"
            />
            <Money
              defaultValue={order?.costs.miscellaneous}
              label="Miscellaneous"
              name="miscellaneous"
            />
            <Field
              label={`Purchase FX (${purchaseCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                className={`${inputClassName} ${purchaseCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                defaultValue={order?.costs.purchaseFxRate ?? ""}
                disabled={purchaseCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="purchaseFxRate"
                placeholder={
                  purchaseCurrency === project?.reportingCurrencyCode
                    ? "1 (automatic)"
                    : "e.g. 0.857500"
                }
              />
            </Field>
            <Field
              label={`Selling FX (${sellingCurrency} → ${project?.reportingCurrencyCode ?? "reporting"})`}
            >
              <input
                className={`${inputClassName} ${sellingCurrency === project?.reportingCurrencyCode ? "bg-muted" : ""}`}
                defaultValue={order?.costs.sellingFxRate ?? ""}
                disabled={sellingCurrency === project?.reportingCurrencyCode}
                inputMode="decimal"
                name="sellingFxRate"
                placeholder={
                  sellingCurrency === project?.reportingCurrencyCode
                    ? "1 (automatic)"
                    : "e.g. 1.170000"
                }
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
            <VatFields
              currency={sellingCurrency}
              direction="output"
              options={options}
              value={order?.costs.outputVat ?? null}
            />
          </div>
        </section>
        <section className="bg-muted/20 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Commercial pricing</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Pricing method">
              <select
                className={inputClassName}
                name="pricingMode"
                onChange={(event) => setPricingMode(event.target.value)}
                value={pricingMode}
              >
                {options.pricingModes.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Money
              defaultValue={
                pricingMode === "SELLING_PRICE"
                  ? order?.packageSellingPrice
                  : ""
              }
              label="Package selling price HT"
              name="sellingPriceAmount"
            />
            <Field label="Target gross margin %">
              <input
                className={inputClassName}
                defaultValue={rateToPercentInput(
                  order?.targetMarginRate ?? null,
                )}
                disabled={pricingMode === "SELLING_PRICE"}
                inputMode="decimal"
                name="targetMarginPercent"
                placeholder="30.00"
              />
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
            <Money
              defaultValue={order?.freightResaleAmount}
              label="Separate freight resale HT"
              name="freightResaleAmount"
            />
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
