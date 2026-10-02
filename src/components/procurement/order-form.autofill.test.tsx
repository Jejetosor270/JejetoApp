// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText } from "@/test/dom-form";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/orders/actions", () => ({
  createOrderAction: vi.fn(),
  updateOrderAction: vi.fn(),
}));
vi.mock("./package-select", () => ({ PackageSelect: () => null }));
import {
  OrderForm,
  type OrderFormOptions,
  type EditableOrder,
} from "./order-form";

const supplier = {
  id: "supplier",
  displayName: "Supplier",
  defaultCurrencyCode: "EUR",
  defaultLeadTimeWeeks: null,
};
const options: OrderFormOptions = {
  billingDocuments: [],
  currencies: [{ code: "EUR", name: "Euro" }],
  suppliers: [supplier],
  projects: [
    {
      id: "project",
      name: "Project",
      client: { defaultCurrencyCode: "EUR" },
      buildings: [],
      reportingCurrencyCode: "EUR",
      defaultFreightMarkupRate: "0.1",
      defaultOtherCostMarkupRate: "0",
      defaultProductMarkupRate: "0.2",
      freightEstimateRate: "0.1",
    },
  ],
  freightTreatments: ["NOT_APPLICABLE"],
  pricingModes: ["PROJECT_MARKUP"],
  statuses: ["DRAFT"],
  vatTreatments: ["DOMESTIC"],
  vatRecoverabilities: [],
};
const order: EditableOrder = {
  id: "order",
  orderNumber: "PO-001",
  packageName: "Package",
  category: null,
  description: null,
  notes: null,
  actualDeliveryDate: null,
  expectedDeliveryDate: null,
  expectedReadyDate: null,
  orderDate: null,
  quoteDate: null,
  buildingIds: [],
  leadTimeWeeks: null,
  project: { id: "project", name: "Project" },
  supplier,
  costs: {
    purchaseCost: "100",
    freight: "25",
    customsDuties: null,
    miscellaneous: null,
    inputVat: null,
    outputVat: null,
    purchaseFxRate: null,
    sellingFxRate: null,
  },
  orderCurrencyCode: "EUR",
  sellingCurrencyCode: "EUR",
  freightTreatment: "NOT_APPLICABLE",
  pricingMode: "PROJECT_MARKUP",
  status: "DRAFT",
  freightResaleAmount: null,
  freightAllowanceOverrideAmount: null,
  freightMarkupOverrideRate: null,
  otherCostMarkupOverrideRate: null,
  productMarkupOverrideRate: null,
  outputVatTaxableBaseOverride: null,
  packageSellingPrice: null,
  supplierOrderConfirmationReference: null,
  supplierQuoteReference: null,
};
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});
function value(name: string) {
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing Order form");
  return new FormData(form).get(name);
}
it("autofills new-order purchase VAT without forcing a VAT treatment or changing the amount override", async () => {
  view = await mountForm(<OrderForm options={options} />);
  await enter("purchaseCost", "123.4567");
  expect(value("inputVatTreatment")).toBe("");
  expect(value("inputVatTaxableBase")).toBeNull();
  await enter("inputVatTreatment", "DOMESTIC");
  expect(value("inputVatTaxableBase")).toBe("123.4567");
  await enter("purchaseCost", "200");
  expect(value("inputVatTaxableBase")).toBe("200");
  await enter("inputVatTaxableBase", "50");
  await enter("inputVatAmount", "10");
  await enter("purchaseCost", "300");
  expect(value("inputVatTaxableBase")).toBe("50");
  await clickText("Use purchase HT");
  expect(value("inputVatTaxableBase")).toBe("300");
  expect(value("inputVatAmount")).toBe("10");
});
it("prefills editing an Order without VAT from purchase HT, not freight or selling HT", async () => {
  view = await mountForm(<OrderForm options={options} order={order} />);
  await enter("inputVatTreatment", "DOMESTIC");
  expect(value("inputVatTaxableBase")).toBe("100");
});
it("preserves an existing explicit zero VAT base on edit until reset", async () => {
  view = await mountForm(
    <OrderForm
      options={options}
      order={{
        ...order,
        costs: {
          ...order.costs,
          inputVat: {
            taxableBase: "0",
            amount: "0",
            amountIsManual: false,
            countryCode: null,
            customTreatmentNote: null,
            rate: "0.2",
            recoverability: "RECOVERABLE",
            recoverableRate: "1",
            treatment: "DOMESTIC",
          },
        },
      }}
    />,
  );
  await enter("purchaseCost", "250");
  expect(value("inputVatTaxableBase")).toBe("0");
  await clickText("Use purchase HT");
  expect(value("inputVatTaxableBase")).toBe("250");
});
