vi.mock("@/app/(app)/billing/status-actions", () => ({
  changeBillingStatusAction: vi.fn(),
}));
// @vitest-environment happy-dom
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: vi.fn(),
}));
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, enter, mountForm } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";

const actions = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/components/credits/credit-panel", () => ({
  CreditPanel: () => null,
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  updateBillingFreightCoverageAction: actions.save,
  updateOrderBillingLinkAction: actions.save,
  updateClientBillingDocumentAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
  useSearchParams: () => new URLSearchParams("tab=allocations"),
}));
vi.mock("./billing-schedule-manager", () => ({
  BillingScheduleManager: () => null,
}));

import { BillingAllocationEditor } from "./billing-allocation-editor";
import { BillingFreightEditor } from "./billing-freight-editor";
import { BillingDetail } from "./billing-detail";
import { OrderBillingReconciliation } from "./order-billing-reconciliation";

const billing = {
  id: "billing-id",
  reference: "INV-001",
  currencyCode: "EUR",
  totalHt: "1000.0000",
  isProjectRemainderApproved: true,
};
const orders = [
  { id: "order-id", label: "PO-001 · Supplier", sellingBasisHt: "500.0000" },
];

describe("dedicated Billing allocation editor", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(async () => {
    await view?.unmount();
  });

  async function submit() {
    const form = document.querySelector("form");
    if (!form) throw new Error("Missing allocation form");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  }

  it("selects Project before Billing, shows descriptions and resets the allocation choice", async () => {
    const candidate = {
      ...billing,
      projectId: "project-id",
      shortDescription: "Outdoor furniture",
      documentDate: "2026-09-01",
      documentType: "INVOICE" as const,
      isCancelled: false,
      status: "UNPAID",
      allocatedToOtherOrdersHt: "0",
      availableForOrderHt: "1000",
      projectRemainder: "1000",
      orderSellingBasisHt: "500",
      allocation: null,
    };
    view = await mountForm(
      <OrderBillingReconciliation
        canEdit
        orderId="order-id"
        project={{ id: "project-id", name: "Test Project" }}
        reportingCurrencyCode="EUR"
        plannedSell="500"
        invoicedAllocated="0"
        quotedAllocated="0"
        difference={{ amount: "500", state: "UNBILLED" }}
        documents={[
          candidate,
          { ...candidate, id: "other-project", projectId: "other-project" },
          { ...candidate, id: "cancelled", isCancelled: true },
          {
            ...candidate,
            id: "no-description",
            reference: "INV-002",
            shortDescription: null,
          },
        ]}
      />,
    );
    const [projectSelect, billingSelect] =
      view.container.querySelectorAll("select");
    if (!projectSelect || !billingSelect) throw new Error("Missing selectors");
    expect(billingSelect.disabled).toBe(true);
    expect(billingSelect.options.length).toBe(1);
    await act(async () => {
      projectSelect.value = "project-id";
      projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(billingSelect.disabled).toBe(false);
    expect(Array.from(billingSelect.options, (option) => option.value)).toEqual(
      ["", "billing-id", "no-description"],
    );
    expect(billingSelect.options[1]?.textContent).toContain(
      "INV-001 · Outdoor furniture · 1 000.00 EUR",
    );
    expect(billingSelect.options[2]?.textContent).toContain(
      "INV-002 · 1 000.00 EUR",
    );
    await act(async () => {
      billingSelect.value = "billing-id";
      billingSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const addButton = Array.from(
      view.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Add allocation");
    expect(addButton?.parentElement?.className).toContain("pt-1");
    expect(addButton?.closest("label")).toBeNull();
    await clickText("Add allocation");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "INV-001",
    );
    await clickText("Close");
    await act(async () => {
      projectSelect.value = "";
      projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(billingSelect.value).toBe("");
    expect(billingSelect.disabled).toBe(true);
    expect(view.container.textContent).not.toContain("Add allocation");
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("shows an empty state when the Project has no unlinked Billing", async () => {
    view = await mountForm(
      <OrderBillingReconciliation
        canEdit
        orderId="order-id"
        project={{ id: "project-id", name: "Test Project" }}
        reportingCurrencyCode="EUR"
        plannedSell="500"
        invoicedAllocated="0"
        quotedAllocated="0"
        difference={null}
        documents={[]}
      />,
    );
    const select = view.container.querySelector("select");
    if (!select) throw new Error("Missing Project selector");
    await act(async () => {
      select.value = "project-id";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.container.textContent).toContain(
      "No unlinked Billing documents.",
    );
    expect(view.container.querySelectorAll("select")[1]?.disabled).toBe(true);
  });

  it.each([
    ["750", "500.0000", "500.0000"],
    ["200.1234", "500.0000", "200.1234"],
    ["750", null, ""],
  ])(
    "autofills a preselected Order within available HT (%s / %s)",
    async (availableHt, sellingBasisHt, expected) => {
      view = await mountForm(
        <BillingAllocationEditor
          billing={billing}
          orders={[
            { id: "order-id", label: "PO-001 · Supplier", sellingBasisHt },
          ]}
          availableHt={availableHt}
          onSaved={vi.fn()}
        />,
      );
      await clickText("Add allocation");
      const form = document.querySelector("form");
      if (!form) throw new Error("Missing form");
      expect(new FormData(form).get("allocatedAmount")).toBe(expected);
      expect(actions.save).not.toHaveBeenCalled();
    },
  );

  it("autofills on explicit Order selection and keeps manual amounts through unrelated edits", async () => {
    view = await mountForm(
      <BillingAllocationEditor
        billing={billing}
        orders={[
          ...orders,
          { id: "second", label: "PO-002", sellingBasisHt: "300" },
        ]}
        availableHt="750"
        onSaved={vi.fn()}
      />,
    );
    await clickText("Add allocation");
    const select = document.querySelector("select");
    const form = document.querySelector("form");
    if (!select || !form) throw new Error("Missing form");
    expect(new FormData(form).get("allocatedAmount")).toBe("");
    await act(async () => {
      select.value = "order-id";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(new FormData(form).get("allocatedAmount")).toBe("500.0000");
    await enter("allocatedAmount", "125");
    await enter("allocatedAmount.freightCoverageHt", "25");
    expect(new FormData(form).get("allocatedAmount")).toBe("125");
    await act(async () => {
      select.value = "second";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(new FormData(form).get("allocatedAmount")).toBe("300.0000");
  });

  it("uses the shared allocation drawer from an Order without losing its freight subset", async () => {
    actions.save.mockResolvedValue({
      status: "error",
      message: "Review allocation",
    });
    view = await mountForm(
      <OrderBillingReconciliation
        canEdit
        orderId="order-id"
        project={{ id: "project-id", name: "Test Project" }}
        reportingCurrencyCode="EUR"
        plannedSell="500"
        invoicedAllocated="100"
        quotedAllocated="0"
        difference={{ amount: "400", state: "UNBILLED" }}
        documents={[
          {
            ...billing,
            projectId: "project-id",
            shortDescription: null,
            documentDate: "2026-09-01",
            documentType: "INVOICE",
            isCancelled: false,
            status: "PARTIALLY_PAID",
            allocatedToOtherOrdersHt: "0",
            availableForOrderHt: "1000",
            projectRemainder: "900",
            orderSellingBasisHt: "500",
            allocation: {
              allocatedAmount: "100",
              freightCoverageHt: "25",
              basis: "FIXED_AMOUNT",
              percentageRate: null,
            },
          },
        ]}
      />,
    );
    await clickText("Edit allocation");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Available for this Order",
    );
    await enter("allocatedAmount", "120");
    await submit();
    const data = actions.save.mock.calls[0]?.[1] as FormData;
    expect(data.get("orderId")).toBe("order-id");
    expect(data.get("freightCoverageHt")).toBe("25");
    expect(data.get("allocatedAmount")).toBe("120");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Review allocation",
    );
  });

  it("opens freight coverage without an Order and preserves a rejected draft", async () => {
    const onSaved = vi.fn();
    actions.save
      .mockResolvedValueOnce({
        status: "error",
        message: "Freight exceeds available HT.",
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "Saved",
        values: { freightCoverageHt: "100.0000" },
      });
    view = await mountForm(
      <BillingFreightEditor
        billingId="billing-id"
        totalHt="1000"
        currencyCode="EUR"
        freightCoverageHt="0"
        allocatedFreightHt="0"
        onSaved={onSaved}
      />,
    );
    await clickText("Allocate freight");
    await enter("freightCoverageHt", "1100");
    await submit();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Freight exceeds available HT.",
    );
    await enter("freightCoverageHt", "100");
    await submit();
    expect(onSaved).toHaveBeenCalledWith("100.0000");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const data = actions.save.mock.calls[1]?.[1] as FormData;
    expect(data.has("orderId")).toBe(false);
    expect(data.get("freightCoverageHt")).toBe("100");
  });

  it("adds only an allocation, preserves rejected values, then closes and refreshes after success", async () => {
    const onSaved = vi.fn();
    actions.save.mockResolvedValueOnce({
      status: "error",
      message: "Allocation exceeds the remaining Billing document amount.",
      fieldErrors: { allocatedAmount: "Amount exceeds remaining Billing HT." },
    });
    actions.save.mockResolvedValueOnce({
      status: "success",
      message: "Billing allocation saved.",
    });
    view = await mountForm(
      <BillingAllocationEditor
        billing={billing}
        orders={orders}
        availableHt="750.0000"
        onSaved={onSaved}
      />,
    );
    await clickText("Add allocation");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Add allocation",
    );
    const select = document.querySelector("select");
    if (!select) throw new Error("Missing Order selector");
    await act(async () => {
      select.value = "order-id";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await enter("allocatedAmount", "800");
    await enter("allocatedAmount.freightCoverageHt", "25,12");
    await submit();
    expect(onSaved).not.toHaveBeenCalled();
    expect(select.value).toBe("order-id");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document
        .querySelector('input[name="allocatedAmount"]')
        ?.getAttribute("value"),
    ).toBe("800");
    await enter("allocatedAmount", "250,12");
    await submit();
    const data = actions.save.mock.calls[1]?.[1] as FormData;
    expect(data.get("billingDocumentId")).toBe("billing-id");
    expect(data.get("orderId")).toBe("order-id");
    expect(data.get("allocatedAmount")).toBe("250.12");
    expect(data.get("freightCoverageHt")).toBe("25.12");
    expect(data.get("basis")).toBe("FIXED_AMOUNT");
    expect(data.has("totalHt")).toBe(false);
    expect(data.has("reference")).toBe(false);
    expect(onSaved).toHaveBeenCalledWith({
      otherCoverageHt: "0",
      freightCoverageHt: "25.12",
      amount: "250.12",
      orderId: "order-id",
      isProjectRemainderApproved: true,
    });
    expect(actions.refresh).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("edits the existing Order and disables the Order percentage when FX is incomplete", async () => {
    actions.save.mockResolvedValue({ status: "success", message: "Saved" });
    view = await mountForm(
      <BillingAllocationEditor
        billing={billing}
        orders={[
          { id: "order-id", label: "PO-001 · Supplier", sellingBasisHt: null },
        ]}
        availableHt="1000.0000"
        allocation={{ amount: "100.0000", orderId: "order-id" }}
        onSaved={vi.fn()}
      />,
    );
    await clickText("Edit allocation");
    expect(document.querySelector("select")?.disabled).toBe(true);
    const percentageInputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[inputmode="decimal"]',
      ),
    ];
    expect(percentageInputs.at(-1)?.disabled).toBe(true);
    await enter("allocatedAmount", "200");
    await submit();
    const data = actions.save.mock.calls[0]?.[1] as FormData;
    expect(data.get("orderId")).toBe("order-id");
    expect(data.get("allocatedAmount")).toBe("200");
  });

  it("does not offer creation when there are no unallocated Orders", async () => {
    view = await mountForm(
      <BillingAllocationEditor
        billing={billing}
        orders={[]}
        availableHt="0"
        onSaved={vi.fn()}
      />,
    );
    expect(document.querySelector("button")?.disabled).toBe(true);
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("guards unsaved allocation changes when closing the panel", async () => {
    view = await mountForm(
      <BillingAllocationEditor
        billing={billing}
        orders={orders}
        availableHt="1000"
        onSaved={vi.fn()}
      />,
    );
    await clickText("Add allocation");
    await enter("allocatedAmount", "123");
    await clickText("Close");
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Discard unsaved changes?");
    await clickText("Keep editing");
    expect(
      document
        .querySelector('input[name="allocatedAmount"]')
        ?.getAttribute("value"),
    ).toBe("123");
    expect(actions.save).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "exposes allocation controls from Billing detail only for editors: %s",
    async (canEdit) => {
      actions.save.mockResolvedValue({ status: "success", message: "Saved" });
      const documentData = {
        ...billing,
        clientId: "client-id",
        projectId: "project-id",
        documentDate: "2026-09-01",
        documentType: "INVOICE",
        totalTtc: "1000",
        vatAmount: "0",
        isCancelled: false,
        paid: "0",
        outstanding: "1000",
        status: "UNPAID",
        imports: [],
        client: { displayName: "Client" },
        project: { name: "Project", reportingCurrencyCode: "EUR" },
        allocations: [
          {
            orderId: "order-id",
            allocatedAmount: "100",
            basis: "FIXED_AMOUNT",
          },
        ],
      } as unknown as ClientBillingView;
      view = await mountForm(
        <BillingDetail
          canEdit={canEdit}
          document={documentData}
          startEditing={false}
          orderFinancials={[]}
          options={{
            clients: [{ id: "client-id", displayName: "Client" }],
            currencies: [{ code: "EUR", name: "Euro" }],
            projects: [
              {
                id: "project-id",
                clientId: "client-id",
                code: "P1",
                name: "Project",
                reportingCurrencyCode: "EUR",
              },
            ],
            orders: [
              {
                id: "order-id",
                orderNumber: "PO-001",
                projectId: "project-id",
                sellingReporting: "500",
                supplier: { displayName: "Supplier" },
              },
              {
                id: "new-order-id",
                orderNumber: "PO-002",
                projectId: "project-id",
                sellingReporting: "500",
                supplier: { displayName: "Supplier" },
              },
              {
                id: "other-project-order",
                orderNumber: "PO-OTHER",
                projectId: "other-project",
                supplier: { displayName: "Supplier" },
              },
            ],
          }}
        />,
      );
      const labels = [...document.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      );
      expect(labels.includes("Add allocation")).toBe(canEdit);
      expect(labels.includes("Edit allocation")).toBe(canEdit);
      if (!canEdit) return;
      await clickText("Add allocation");
      expect(
        [...document.querySelectorAll('[role="dialog"] select option')].map(
          (option) => option.getAttribute("value"),
        ),
      ).toEqual(["", "new-order-id"]);
      await clickText("Close");
      await clickText("Edit allocation");
      expect(
        document.querySelector('[role="dialog"]')?.textContent,
      ).not.toContain("General & financial");
      await enter("allocatedAmount", "250");
      await submit();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(
        document.querySelector('[data-workspace-section="allocations"]')
          ?.textContent,
      ).toContain("250.00");
      await clickText("Edit");
      const allocationsInput = document.querySelector<HTMLInputElement>(
        'input[name="allocations"]',
      );
      expect(JSON.parse(allocationsInput?.value ?? "[]")).toEqual([
        {
          otherCoverageHt: "0.0000",
          freightCoverageHt: "0.0000",
          allocatedAmount: "250.0000",
          basis: "FIXED_AMOUNT",
          orderId: "order-id",
        },
      ]);
    },
  );
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
vi.mock("@/components/payments/related-cash-create", () => ({
  RelatedCashCreate: () => <button>Add related cash record</button>,
}));
