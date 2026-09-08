// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, enter, control, clickText } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
import { BillingDetail } from "./billing-detail";

const actions = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/billing/actions", () => ({
  updateClientBillingDocumentAction: actions.save,
  updateOrderBillingLinkAction: vi.fn(),
  updateBillingFreightCoverageAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./billing-schedule-manager", () => ({
  BillingScheduleManager: () => <p>Payment manager</p>,
}));

const record = {
  id: "billing-id",
  reference: "INV-001",
  documentType: "INVOICE",
  documentDate: "2026-09-01",
  dueDate: "2099-01-01",
  clientId: "client-id",
  projectId: "project-id",
  currencyCode: "EUR",
  fxRate: null,
  totalHt: "1000",
  vatAmount: "200",
  vatRate: "0.2",
  totalTtc: "1200",
  freightCoverageHt: "200",
  isCancelled: false,
  isProjectRemainderApproved: false,
  paid: "100",
  outstanding: "1100",
  status: "PARTIALLY_PAID",
  client: { id: "client-id", displayName: "Fictional Client" },
  project: {
    id: "project-id",
    name: "Fictional Project",
    reportingCurrencyCode: "EUR",
  },
  allocations: [
    {
      id: "allocation",
      orderId: "order-id",
      orderNumber: "ORD-1",
      supplierName: "Supplier",
      allocatedAmount: "100",
      freightCoverageHt: "25",
      basis: "FIXED_AMOUNT",
      percentageRate: null,
    },
  ],
  imports: [],
  receipts: [],
  paymentInstallments: [],
  notes: "Preserve notes",
  paymentTermsRaw: null,
  matchedInstallmentId: null,
  updatedAt: "2026-09-01",
  allocationReconciliation: {
    allocated: "100",
    remaining: "900",
    overallocated: "0",
  },
  vatTreatment: null,
} satisfies ClientBillingView;
const options: ComponentProps<typeof BillingDetail>["options"] = {
  clients: [{ id: "client-id", displayName: "Fictional Client" }],
  currencies: [{ code: "EUR", name: "Euro" }],
  projects: [
    {
      id: "project-id",
      name: "Fictional Project",
      code: "P1",
      clientId: "client-id",
      reportingCurrencyCode: "EUR",
    },
  ],
  orders: [
    {
      id: "order-id",
      orderNumber: "ORD-1",
      projectId: "project-id",
      sellingReporting: "500",
      supplier: { displayName: "Supplier" },
    },
  ],
};
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await view?.unmount();
});

function value(label: string) {
  return [...document.querySelectorAll("#overview dt")].find(
    (element) => element.textContent === label,
  )?.nextElementSibling?.textContent;
}
async function mount(documentData: ClientBillingView = record, canEdit = true) {
  view = await mountForm(
    <BillingDetail
      canEdit={canEdit}
      document={documentData}
      options={options}
      orderFinancials={[]}
      startEditing={false}
    />,
  );
}

it("shows allocation and freight figures in Details, separately from Client outstanding", async () => {
  await mount();
  expect(value("Unallocated Billing HT")).toBe("900.00 EUR");
  expect(value("Total freight HT (included)")).toBe("200.00 EUR");
  expect(value("Freight allocated to Orders HT")).toBe("25.00 EUR");
  expect(value("Freight remaining at Project level HT")).toBe("175.00 EUR");
  expect(value("Outstanding")).toBe("1 100.00 EUR");
  expect(value("Status")).toBe("Active");
  expect(value("Payment status")).toBe("Partially Paid");
  const visible = document.querySelector('[role="tabpanel"]:not([hidden])');
  expect(visible?.textContent).not.toContain("Payment manager");
  expect(
    document
      .querySelector("#schedule")
      ?.closest('[role="tabpanel"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  expect(
    document
      .querySelector("#history")
      ?.closest('[role="tabpanel"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  expect(view.container.textContent).not.toContain(
    "Document detail · dates, HT & VAT",
  );
});

it("keeps zero allocations explicit and all freight at Project level", async () => {
  await mount({ ...record, allocations: [] });
  expect(value("Unallocated Billing HT")).toBe("1 000.00 EUR");
  expect(value("Freight allocated to Orders HT")).toBe("0.00 EUR");
  expect(value("Freight remaining at Project level HT")).toBe("200.00 EUR");
});

it("offers only Active/Cancelled and retains rejected status changes and the complete draft", async () => {
  actions.save.mockResolvedValue({
    status: "error",
    message:
      "A Billing Event with recorded Client receipts cannot be cancelled.",
  });
  await mount();
  await clickText("Edit");
  expect(
    [...document.querySelectorAll('select[name="recordStatus"] option')].map(
      (option) => option.textContent,
    ),
  ).toEqual(["Active", "Cancelled"]);
  await enter("recordStatus", "CANCELLED");
  await enter("notes", "Keep this edit");
  await act(async () => {
    control("recordStatus").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  const data = actions.save.mock.calls[0]?.[1] as FormData;
  expect(data.get("isCancelled")).toBe("on");
  expect(data.has("status")).toBe(false);
  expect(control("recordStatus").value).toBe("CANCELLED");
  expect(control("notes").value).toBe("Keep this edit");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "cannot be cancelled",
  );
  expect(value("Status")).toBe("Active");
});

it("can reactivate a cancelled record without setting a payment status", async () => {
  actions.save.mockResolvedValue({ status: "success", message: "Saved" });
  await mount({ ...record, isCancelled: true, paid: "0", status: "CANCELLED" });
  await clickText("Edit");
  await enter("recordStatus", "ACTIVE");
  await act(async () => {
    control("recordStatus").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  const data = actions.save.mock.calls[0]?.[1] as FormData;
  expect(data.get("isCancelled")).toBe("");
  expect(data.has("status")).toBe(false);
  expect(value("Status")).toBe("Active");
  expect(value("Payment status")).toBe("Invoiced");
});

it("does not expose editing to read-only employees", async () => {
  await mount(record, false);
  expect(
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Edit",
    ),
  ).toBe(false);
  expect(document.querySelector('[name="recordStatus"]')).toBeNull();
  expect(value("Unallocated Billing HT")).toBe("900.00 EUR");
});
