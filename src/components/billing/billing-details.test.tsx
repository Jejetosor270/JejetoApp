vi.mock("@/app/(app)/billing/status-actions", () => ({
  changeBillingStatusAction: actions.status,
}));
// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, enter, control, clickText } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
import { BillingDetail } from "./billing-detail";
import { BillingTable } from "./billing-table";

vi.mock("@/app/(app)/cell-actions", () => ({ saveTableCellAction: vi.fn() }));
vi.mock("@/components/credits/credit-panel", () => ({
  CreditPanel: () => null,
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: vi.fn(),
}));

vi.mock("@/components/payments/related-cash-create", () => ({
  RelatedCashCreate: () => <button>Add related cash record</button>,
}));

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: actions.status,
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  updateClientBillingDocumentAction: actions.save,
  updateOrderBillingLinkAction: vi.fn(),
  updateBillingFreightCoverageAction: vi.fn(),
}));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => "/billing",
    useRouter: () => ({ refresh: actions.refresh }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (callback) => {
            window.addEventListener("popstate", callback);
            return () => window.removeEventListener("popstate", callback);
          },
          () => window.location.search,
          () => "",
        ),
      ),
  };
});
vi.mock("./billing-schedule-manager", () => ({
  BillingScheduleManager: () => (
    <>
      <p>Payment manager</p>
      <input name="billingTermDraft" defaultValue="Original term" />
    </>
  ),
}));

const record = {
  id: "billing-id",
  reference: "INV-001",
  shortDescription: null,
  editVersion: "a".repeat(64),
  editFields: "{}",
  documentType: "INVOICE",
  workflowStatus: "INVOICED",
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
  otherCoverageHt: "0",
  freightCoverageHt: "200",
  isCancelled: false,
  isProjectRemainderApproved: false,
  paid: "100",
  paidAt: null,
  outstanding: "1100",
  status: "INVOICED",
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
      otherCoverageHt: "0",
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
  window.history.replaceState(null, "", "/billing/billing-id");
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    push(...args);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await view?.unmount();
  vi.restoreAllMocks();
});

function matrix(row: string, column: number) {
  return [...document.querySelectorAll("#overview tr")]
    .find((el) => el.querySelector("th")?.textContent === row)
    ?.querySelectorAll("td")[column]?.textContent;
}
function value(label: string) {
  return [...document.querySelectorAll("#overview dt")].find(
    (element) => element.textContent === label,
  )?.nextElementSibling?.textContent;
}
it("shows Billing-specific allocated profit and markup separately from unallocated HT", async () => {
  await mount({ ...record, projectMarkup: ["0.3", "0.15", "0"] }, false, [
    {
      id: "order-id",
      plannedSell: "500",
      economicCost: "400",
      reportingCurrencyCode: "EUR",
      actualMarkupRate: "0.99",
      invoicedAllocated: "100",
    },
  ]);
  expect(matrix("Expected profit", 3)).toBe("210.70 EUR");
  expect(matrix("Allocated cost", 3)).toBe("80.00 EUR");
  expect(matrix("Allocated profit", 3)).toBe("20.00 EUR");
  expect(matrix("Actual markup", 3)).toBe("25%");
  expect(matrix("Unallocated HT", 3)).toBe("900.00 EUR");
  expect(document.querySelector("#overview")?.textContent).not.toContain(
    "Potential Client return",
  );
});
async function mount(
  documentData: ClientBillingView = record,
  canEdit = true,
  orderFinancials: ComponentProps<typeof BillingDetail>["orderFinancials"] = [],
) {
  view = await mountForm(
    <BillingDetail
      canEdit={canEdit}
      document={documentData}
      options={options}
      orderFinancials={orderFinancials}
      startEditing={false}
    />,
  );
}

it("keeps the Billing table layout and shows a paid date linked to the receipts", async () => {
  view = await mountForm(
    <BillingTable
      canEdit
      documents={[
        {
          ...record,
          status: "PAID",
          paid: "1200",
          outstanding: "0",
          dueDate: null,
          paidAt: "2026-09-26",
        },
      ]}
    />,
  );
  expect(
    document.querySelector('button[aria-label="Manage Paid date for INV-001"]')
      ?.textContent,
  ).toBe("26/09/2026Paid");
  expect(
    document.querySelector(
      'button[aria-label="Edit Next payment due for INV-001"]',
    ),
  ).toBeNull();
  const headings = [...document.querySelectorAll("thead th")].map(
    (el) => el.textContent,
  );
  expect(headings).toContain("Due / paid");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Manage Paid date for INV-001"]',
      )
      ?.click(),
  );
  expect(
    document.querySelector('[role="dialog"] a')?.getAttribute("href"),
  ).toBe("/billing/billing-id?tab=related#schedule");
});

it("continues showing the due date for partially paid Billing", async () => {
  view = await mountForm(
    <BillingTable
      canEdit
      documents={[{ ...record, status: "PARTIALLY_PAID" }]}
    />,
  );
  expect(
    document.querySelector(
      'button[aria-label="Edit Next payment due for INV-001"]',
    )?.textContent,
  ).toContain("01/01/2099");
  expect(
    document.querySelector('button[aria-label="Manage Paid date for INV-001"]'),
  ).toBeNull();
});

it("shows allocation and freight figures in Details, separately from Client outstanding", async () => {
  await mount();
  expect(matrix("Unallocated HT", 0)).toBe("725.00 EUR");
  expect(matrix("Total", 1)).toBe("200.00 EUR");
  expect(matrix("Allocated to Orders", 1)).toBe("25.00 EUR");
  expect(matrix("Unallocated HT", 1)).toBe("175.00 EUR");
  expect(value("Outstanding")).toBe("1 100.00 EUR");
  expect(value("Status")).toBeUndefined();
  expect(value("Payment status")).toBeUndefined();
  const visible = document.querySelector('[role="tabpanel"]:not([hidden])');
  expect(visible?.textContent).not.toContain("Payment manager");
  expect(
    document
      .querySelector('[data-workspace-section="schedule"]')
      ?.closest('[role="tabpanel"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  expect(
    document
      .querySelector('[data-workspace-section="history"]')
      ?.closest('[role="tabpanel"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  expect(view.container.textContent).not.toContain(
    "Document detail · dates, HT & VAT",
  );
});

it("contains the allocation table within a shrinkable single column on narrow screens", async () => {
  await mount();
  const details = view.container.querySelector('section[aria-label="Details"]');
  expect(details?.classList.contains("grid-cols-1")).toBe(true);
  expect(details?.classList.contains("lg:grid-cols-2")).toBe(true);
  for (const article of details?.querySelectorAll("article") ?? []) {
    expect(article.classList.contains("min-w-0")).toBe(true);
  }
  expect(
    details
      ?.querySelector("table")
      ?.parentElement?.classList.contains("overflow-x-auto"),
  ).toBe(true);
});

it("keeps zero allocations explicit and all freight at Project level", async () => {
  await mount({ ...record, allocations: [] });
  expect(matrix("Unallocated HT", 0)).toBe("800.00 EUR");
  expect(matrix("Allocated to Orders", 1)).toBe("0.00 EUR");
  expect(matrix("Unallocated HT", 1)).toBe("200.00 EUR");
});
it("preserves Other/services classification and allocation through a rejected full edit", async () => {
  actions.save.mockResolvedValue({
    status: "error",
    message: "Review the amounts.",
  });
  await mount({
    ...record,
    otherCoverageHt: "100",
    allocations: record.allocations.map((row) => ({
      ...row,
      otherCoverageHt: "20",
    })),
  });
  expect(matrix("Total", 2)).toBe("100.00 EUR");
  expect(matrix("Total", 0)).toBe("700.00 EUR");
  await clickText("Edit");
  await enter("otherCoverageHt", "125");
  await act(async () => {
    control("otherCoverageHt").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  const values = actions.save.mock.calls[0]?.[1] as FormData;
  expect(values.get("otherCoverageHt")).toBe("125");
  expect(JSON.parse(String(values.get("allocations")))[0].otherCoverageHt).toBe(
    "20.0000",
  );
  expect(control("otherCoverageHt").value).toBe("125.00");
});

it("uses a confirmed Cancel Billing button and retains cancellation errors", async () => {
  actions.status.mockResolvedValue({
    status: "error",
    message: "Billing with receipts cannot be cancelled.",
  });
  await mount();
  await clickText("Invoiced");
  await enter("billingStatus", "CANCELLED");
  expect(actions.status).not.toHaveBeenCalled();
  await clickText("Confirm status");
  expect(actions.status).toHaveBeenCalledWith({
    id: record.id,
    value: "CANCELLED",
    confirmedAmount: record.outstanding,
    amount: "",
    paymentDate: "",
    paymentFx: "",
  });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "cannot be cancelled",
  );
  expect(value("Status")).toBeUndefined();
});

it("retains a cancelled record during ordinary edits without an Active/Cancelled selector", async () => {
  actions.save.mockResolvedValue({ status: "error", message: "Review notes" });
  await mount({ ...record, isCancelled: true, paid: "0", status: "CANCELLED" });
  await clickText("Edit");
  expect(document.querySelector('[name="recordStatus"]')).toBeNull();
  await enter("notes", "Keep this edit");
  await act(async () => {
    control("notes").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect((actions.save.mock.calls[0]?.[1] as FormData).get("isCancelled")).toBe(
    "on",
  );
  expect(control("notes").value).toBe("Keep this edit");
});

it("does not expose editing to read-only employees", async () => {
  await mount(record, false);
  expect(
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Edit",
    ),
  ).toBe(false);
  expect(document.querySelector('[name="recordStatus"]')).toBeNull();
  expect(matrix("Unallocated HT", 0)).toBe("725.00 EUR");
});

it.each([
  ["?tab=related#schedule", "Payment terms"],
  ["?tab=allocations", "Linked Orders"],
  ["?tab=related&section=history", "History"],
])("opens the Billing related work area from %s", async (url, label) => {
  window.history.replaceState(null, "", "/billing/billing-id" + url);
  await mount(record, false);
  const nav = document.querySelector(
    'nav[aria-label="Billing workspace related sections"]',
  );
  expect(nav?.querySelector('[aria-pressed="true"]')?.textContent).toBe(label);
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Related");
  expect(nav?.querySelectorAll("button")).toHaveLength(5);
  expect(nav?.textContent).toContain("Credits");
});

it("keeps Billing terms and related actions mounted while changing work areas", async () => {
  window.history.replaceState(
    null,
    "",
    "/billing/billing-id?tab=related#schedule",
  );
  await mount();
  const draft = control("billingTermDraft");
  await enter("billingTermDraft", "Keep this payment term");
  await clickText("Linked Orders");
  expect(
    document
      .querySelector('[data-workspace-section="allocations"]')
      ?.hasAttribute("hidden"),
  ).toBe(false);
  expect(
    document
      .querySelector('[data-workspace-section="schedule"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  await clickText("Details");
  await clickText("Related");
  await clickText("Payment terms");
  expect(control("billingTermDraft")).toBe(draft);
  expect(draft.value).toBe("Keep this payment term");
});

it("uses a standard editor and keeps collapsed allocation inputs in the submitted draft", async () => {
  actions.save.mockResolvedValue({ status: "error", message: "Review notes." });
  await mount();
  await clickText("Edit");
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.classList.contains("data-[side=right]:sm:max-w-2xl")).toBe(
    true,
  );
  const disclosure = dialog?.querySelector("details");
  expect(disclosure?.open).toBe(false);
  expect(disclosure?.querySelector("summary")?.textContent).toBe(
    "Linked Orders",
  );
  await enter("notes", "Preserved draft");
  await clickText("Save Billing document");
  const values = actions.save.mock.calls[0]?.[1] as FormData;
  expect(JSON.parse(String(values.get("allocations")))).toEqual([
    expect.objectContaining({
      orderId: "order-id",
      allocatedAmount: "100.0000",
    }),
  ]);
  expect(control("notes").value).toBe("Preserved draft");
  expect(disclosure?.open).toBe(false);
});

it("opens allocations on native validation and server allocation errors without losing edits", async () => {
  actions.save.mockResolvedValue({
    status: "error",
    message: "Review allocations.",
    fieldErrors: { allocations: "Allocated amount exceeds Billing." },
  });
  await mount();
  await clickText("Edit");
  const disclosure = document.querySelector<HTMLDetailsElement>(
    '[role="dialog"] details',
  );
  const allocationInput = disclosure?.querySelector("input");
  expect(allocationInput).toBeTruthy();
  await act(async () =>
    allocationInput?.dispatchEvent(
      new Event("invalid", { bubbles: false, cancelable: true }),
    ),
  );
  expect(disclosure?.open).toBe(true);
  if (disclosure) disclosure.open = false;
  await enter("notes", "Still here");
  await clickText("Save Billing document");
  expect(disclosure?.open).toBe(true);
  expect(control("notes").value).toBe("Still here");
});

vi.mock("@/app/(app)/related-records/actions", () => ({
  editRelatedNameAction: vi.fn(),
  removeOptionalLinksAction: vi.fn(),
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  unassignCashAction: vi.fn(),
}));

vi.mock("@/app/(app)/related-records/inline-actions", () => ({
  editRelatedFinancialRowAction: vi.fn(),
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: vi.fn(),
}));
