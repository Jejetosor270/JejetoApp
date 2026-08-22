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
import { rateToPercentInput } from "@/domain/procurement/presentation";

interface BuildingOption {
  id: string;
  isActive: boolean;
  name: string;
  shortCode: string;
}
interface ProjectOption {
  buildings: BuildingOption[];
  id: string;
  name: string;
  reportingCurrencyCode: string;
}
interface SupplierOption {
  displayName: string;
  id: string;
}
interface FinancialStateView {
  customsDuties: string | null;
  freight: string | null;
  miscellaneous: string | null;
  state: string;
  supplierDiscount: string | null;
  supplierPurchase: string | null;
}
export interface OrderFormOptions {
  financialStates: string[];
  freightTreatments: string[];
  pricingModes: string[];
  projects: ProjectOption[];
  statuses: string[];
  suppliers: SupplierOption[];
}
export interface EditableOrder {
  buildingIds: string[];
  category: string | null;
  description: string | null;
  financialStates: FinancialStateView[];
  freightResaleAmount: string | null;
  freightTreatment: string;
  id: string;
  notes: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: string;
  pricingSourceState: string;
  project: { id: string; name: string };
  status: string;
  supplier: SupplierOption;
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
  targetMarginRate: string | null;
}

const labels: Record<string, string> = {
  ACTUAL: "Actual",
  APPROVED: "Approved",
  BALANCE_DUE: "Balance due",
  BUDGET: "Budget",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
  COMMITTED: "Committed",
  DELIVERED: "Delivered",
  DEPOSIT_DUE: "Deposit due",
  DEPOSIT_PAID: "Deposit paid",
  DRAFT: "Draft",
  INCLUDED_IN_PACKAGE_PRICE: "Included in package price",
  IN_PRODUCTION: "In production",
  IN_TRANSIT: "In transit",
  NOT_APPLICABLE: "Not applicable",
  ORDERED: "Ordered",
  PAID: "Paid",
  QUOTED: "Quoted",
  READY: "Ready",
  RECHARGED_SEPARATELY: "Recharged separately",
  SELLING_PRICE: "Enter selling price",
  TARGET_MARGIN: "Calculate from target margin",
};

function FinancialFields({
  currency,
  order,
  state,
}: {
  currency: string;
  order?: EditableOrder | undefined;
  state: string;
}) {
  const values = order?.financialStates.find((item) => item.state === state);
  return (
    <fieldset className="bg-muted/20 rounded-lg border p-3">
      <legend className="px-1 text-sm font-semibold">
        {labels[state] ?? state}
      </legend>
      <p className="text-muted-foreground mb-3 text-xs">
        Amounts HT · {currency || "project currency"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Supplier/list purchase">
          <input
            className={inputClassName}
            defaultValue={values?.supplierPurchase ?? ""}
            inputMode="decimal"
            name={`${state}_supplierPurchase`}
            placeholder="0.00"
          />
        </Field>
        <Field label="Supplier discount">
          <input
            className={inputClassName}
            defaultValue={values?.supplierDiscount ?? ""}
            inputMode="decimal"
            name={`${state}_supplierDiscount`}
            placeholder="0.00"
          />
        </Field>
        <Field label="Freight cost">
          <input
            className={inputClassName}
            defaultValue={values?.freight ?? ""}
            inputMode="decimal"
            name={`${state}_freight`}
            placeholder="0.00"
          />
        </Field>
        <Field label="Customs / duties">
          <input
            className={inputClassName}
            defaultValue={values?.customsDuties ?? ""}
            inputMode="decimal"
            name={`${state}_customsDuties`}
            placeholder="0.00"
          />
        </Field>
        <Field label="Miscellaneous">
          <input
            className={inputClassName}
            defaultValue={values?.miscellaneous ?? ""}
            inputMode="decimal"
            name={`${state}_miscellaneous`}
            placeholder="0.00"
          />
        </Field>
      </div>
    </fieldset>
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
  const [pricingMode, setPricingMode] = useState(
    order?.pricingMode ?? "SELLING_PRICE",
  );
  const [freightTreatment, setFreightTreatment] = useState(
    order?.freightTreatment ?? "NOT_APPLICABLE",
  );
  const project = useMemo(
    () => options.projects.find((item) => item.id === projectId),
    [options.projects, projectId],
  );

  useEffect(() => {
    if (state.status !== "success" || !state.orderId) return;
    if (isEditing) router.refresh();
    else router.push(`/orders/${state.orderId}`);
  }, [isEditing, router, state.orderId, state.status]);

  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {order ? "Edit procurement order" : "Create procurement order"}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Supplier package-level data; no products, rooms, or VAT.
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
              placeholder="e.g. Lighting"
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              defaultValue={order?.status ?? "DRAFT"}
              name="status"
            >
              {options.statuses.map((value) => (
                <option key={value} value={value}>
                  {labels[value] ?? value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              className={inputClassName}
              name="projectId"
              onChange={(event) => setProjectId(event.target.value)}
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
              defaultValue={order?.supplier.id}
              name="supplierId"
            >
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase / reporting currency">
            <input
              className={`${inputClassName} bg-muted`}
              name="orderCurrencyCode"
              readOnly
              value={
                project?.reportingCurrencyCode ?? order?.orderCurrencyCode ?? ""
              }
            />
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
            Description
            <textarea
              className={`${inputClassName} h-20 py-2`}
              defaultValue={order?.description ?? ""}
              name="description"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2 xl:col-span-1">
            Notes
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
            {!project?.buildings.length ? (
              <p className="text-muted-foreground text-sm">
                No buildings are available for this project.
              </p>
            ) : null}
          </div>
        </fieldset>
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Cost progression</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Leave an entire state blank when it is not yet known. Supplier
              discount is entered as a positive amount.
            </p>
          </div>
          {options.financialStates.map((financialState) => (
            <FinancialFields
              currency={project?.reportingCurrencyCode ?? ""}
              key={financialState}
              order={order}
              state={financialState}
            />
          ))}
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
                {options.pricingModes.map((value) => (
                  <option key={value} value={value}>
                    {labels[value] ?? value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pricing cost state">
              <select
                className={inputClassName}
                defaultValue={order?.pricingSourceState ?? "COMMITTED"}
                name="pricingSourceState"
              >
                {options.financialStates.map((value) => (
                  <option key={value} value={value}>
                    {labels[value] ?? value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Package selling price HT">
              <input
                className={`${inputClassName} ${pricingMode === "TARGET_MARGIN" ? "bg-muted" : ""}`}
                defaultValue={
                  pricingMode === "SELLING_PRICE"
                    ? (order?.packageSellingPrice ?? "")
                    : ""
                }
                disabled={pricingMode === "TARGET_MARGIN"}
                inputMode="decimal"
                name="sellingPriceAmount"
                placeholder={
                  pricingMode === "TARGET_MARGIN"
                    ? "Calculated on save"
                    : "0.00"
                }
              />
            </Field>
            <Field label="Target gross margin %">
              <input
                className={`${inputClassName} ${pricingMode === "SELLING_PRICE" ? "bg-muted" : ""}`}
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
                {options.freightTreatments.map((value) => (
                  <option key={value} value={value}>
                    {labels[value] ?? value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Separate freight resale HT">
              <input
                className={`${inputClassName} ${freightTreatment !== "RECHARGED_SEPARATELY" ? "bg-muted" : ""}`}
                defaultValue={order?.freightResaleAmount ?? ""}
                disabled={freightTreatment !== "RECHARGED_SEPARATELY"}
                inputMode="decimal"
                name="freightResaleAmount"
                placeholder="0.00"
              />
            </Field>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            For target-margin pricing, total required selling revenue is
            calculated from the selected cost state. Any separate freight
            recharge is included once, then backed out to show the package
            selling price.
          </p>
        </section>
        <div className="flex items-center gap-3">
          <SubmitButton pending={pending}>
            {order ? "Save order" : "Create order"}
          </SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}
