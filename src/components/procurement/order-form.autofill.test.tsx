// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { mountForm, enter, clickText } from "@/test/dom-form";
import { businessToday } from "@/domain/payments/dates";
import { updateOrderAction } from "@/app/(app)/orders/actions";
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
  vi.clearAllMocks();
});
function value(name: string) {
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing Order form");
  return new FormData(form).get(name);
}
async function toggleTaxableCost(label: string) {
  const input = [...document.querySelectorAll("fieldset label")]
    .find((element) => element.textContent?.trim() === label)
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) throw new Error(`Missing taxable cost ${label}`);
  await act(async () => input.click());
}
it("preserves separate source dates and legacy timing while changing the main document kind", async () => {
  view = await mountForm(
    <OrderForm
      options={options}
      order={{
        ...order,
        quoteDate: "2026-09-01",
        invoiceDate: "2026-09-15",
        orderDate: "2026-09-02",
        leadTimeWeeks: 4,
        expectedReadyDate: "2026-09-30",
      }}
    />,
  );
  expect(value("supplierDocumentKind")).toBe("INVOICE");
  await enter("supplierDocumentKind", "QUOTE");
  expect(value("quoteDate")).toBe("2026-09-01");
  expect(value("invoiceDate")).toBe("2026-09-15");
  await enter("orderDate", "03/09/2026");
  expect(value("leadTimeWeeks")).toBe("4");
  expect(value("expectedReadyDate")).toBe("2026-09-30");
  expect(
    document.querySelector<HTMLInputElement>('[name="leadTimeWeeks"]')?.type,
  ).toBe("hidden");
  expect(
    document.querySelector('[name="invoiceDate"]')?.closest("details")?.open,
  ).toBe(false);
});
it("does not reuse a Quote date when entering an Invoice for the first time", async () => {
  view = await mountForm(
    <OrderForm
      options={options}
      order={{ ...order, quoteDate: "2026-09-01" }}
    />,
  );
  await enter("supplierDocumentKind", "INVOICE");
  expect(value("invoiceDate")).toBe("");
  expect(value("quoteDate")).toBe("2026-09-01");
  await enter("invoiceDate", "09/10/2026");
  expect(value("invoiceDate")).toBe("2026-10-09");
  expect(value("quoteDate")).toBe("2026-09-01");
});
it("offers an actual date only when recording delivery and retains the expected date", async () => {
  view = await mountForm(
    <OrderForm
      options={{ ...options, statuses: ["DRAFT", "DELIVERED"] }}
      order={{ ...order, expectedDeliveryDate: "2026-10-20" }}
    />,
  );
  expect(
    document.querySelector<HTMLInputElement>('[name="actualDeliveryDate"]')
      ?.type,
  ).toBe("hidden");
  await enter("status", "DELIVERED");
  expect(value("actualDeliveryDate")).toBe(businessToday());
  expect(view.container.textContent).toContain(
    "Confirm the actual delivery date before saving.",
  );
  expect(value("expectedDeliveryDate")).toBe("2026-10-20");
  await enter("status", "DRAFT");
  expect(value("actualDeliveryDate")).toBe("");
});
it("proposes Delivered from a table action without saving until the employee confirms", async () => {
  view = await mountForm(
    <OrderForm
      options={{ ...options, statuses: ["DRAFT", "DELIVERED"] }}
      order={order}
      recordDelivery
    />,
  );
  expect(value("status")).toBe("DELIVERED");
  expect(value("actualDeliveryDate")).toBe(businessToday());
  await enter("actualDeliveryDate", "14/10/2026");
  expect(value("actualDeliveryDate")).toBe("2026-10-14");
});
it("autofills new-order purchase VAT without forcing a VAT treatment or changing the amount override", async () => {
  view = await mountForm(<OrderForm options={options} />);
  await enter("purchaseCost", "123.4567");
  expect(value("inputVatTreatment")).toBe("");
  expect(value("inputVatTaxableBase")).toBeNull();
  await enter("inputVatTreatment", "DOMESTIC");
  expect(value("inputVatRecoverablePercent")).toBe("100");
  await enter("inputVatRecoverablePercent", "0");
  await enter("inputVatTreatment", "DOMESTIC");
  expect(value("inputVatRecoverablePercent")).toBe("0");
  expect(value("inputVatTaxableBase")).toBe("123.4567");
  await enter("purchaseCost", "200");
  expect(value("inputVatTaxableBase")).toBe("200");
  await enter("inputVatTaxableBase", "50");
  await enter("inputVatAmount", "10");
  await enter("purchaseCost", "300");
  expect(value("inputVatTaxableBase")).toBe("50");
  expect(view.container.textContent).toContain(
    "Costs changed. Review the manual VAT base before saving.",
  );
  await clickText("Use selected costs");
  expect(value("inputVatTaxableBase")).toBe("300");
  expect(value("inputVatAmount")).toBe("10");
  expect(view.container.textContent).not.toContain(
    "Costs changed. Review the manual VAT base before saving.",
  );
});
it("prefills an Order without VAT from all entered HT costs, not selling HT", async () => {
  view = await mountForm(<OrderForm options={options} order={order} />);
  await enter("inputVatTreatment", "DOMESTIC");
  expect(value("inputVatTaxableBase")).toBe("125");
  await enter("customsDuties", "3.4567");
  await enter("miscellaneous", "0.0001");
  expect(value("inputVatTaxableBase")).toBe("128.4568");
});
it("lets the employee exclude non-taxable costs and follows only selected costs", async () => {
  view = await mountForm(<OrderForm options={options} order={order} />);
  await enter("inputVatTreatment", "DOMESTIC");
  await toggleTaxableCost("Freight");
  expect(value("inputVatTaxableBase")).toBe("100");
  await enter("freight", "50");
  expect(value("inputVatTaxableBase")).toBe("100");
  await enter("purchaseCost", "200");
  expect(value("inputVatTaxableBase")).toBe("200");
  await toggleTaxableCost("Freight");
  expect(value("inputVatTaxableBase")).toBe("250");
  expect(value("inputVatRate")).toBe("");
  expect(value("inputVatAmount")).toBe("");
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
  await toggleTaxableCost("Freight");
  expect(value("inputVatTaxableBase")).toBe("0");
  expect(view.container.textContent).toContain(
    "Costs changed. Review the manual VAT base before saving.",
  );
  await clickText("Use selected costs");
  expect(value("inputVatTaxableBase")).toBe("250");
});
it("keeps the reviewed cost selection, manual base and amount override after a failed save", async () => {
  vi.mocked(updateOrderAction).mockResolvedValueOnce({
    status: "error",
    message: "Review the Order before saving.",
    formError: "Review the Order before saving.",
    fieldErrors: { purchaseCost: "Review this cost." },
  });
  view = await mountForm(<OrderForm options={options} order={order} />);
  await enter("inputVatTreatment", "DOMESTIC");
  await toggleTaxableCost("Freight");
  await enter("inputVatTaxableBase", "80");
  await enter("inputVatAmount", "16");
  await enter("purchaseCost", "200");
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing Order form");
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(updateOrderAction).toHaveBeenCalledOnce();
  expect(value("inputVatTaxableBase")).toBe("80");
  expect(value("inputVatAmount")).toBe("16");
  expect(view.container.textContent).toContain(
    "Review the Order before saving.",
  );
  expect(view.container.textContent).toContain(
    "Costs changed. Review the manual VAT base before saving.",
  );
  await clickText("Use selected costs");
  expect(value("inputVatTaxableBase")).toBe("200");
  expect(value("inputVatAmount")).toBe("16");
});
