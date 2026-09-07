// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, enter, mountForm } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";

const actions = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/billing/actions", () => ({
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
import { BillingDetail } from "./billing-detail";

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

  it("adds only an allocation, preserves rejected values, then closes and refreshes after success", async () => {
    const onSaved = vi.fn();
    actions.save.mockResolvedValueOnce({
      status: "error",
      message: "Allocation exceeds the remaining Billing Event amount.",
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
    expect(data.get("basis")).toBe("FIXED_AMOUNT");
    expect(data.has("totalHt")).toBe(false);
    expect(data.has("reference")).toBe(false);
    expect(onSaved).toHaveBeenCalledWith({
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
        [...document.querySelectorAll("select option")].map((option) =>
          option.getAttribute("value"),
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
        document.querySelector('[role="tabpanel"]:not([hidden])')?.textContent,
      ).toContain("250.00");
      await clickText("Edit");
      const allocationsInput = document.querySelector<HTMLInputElement>(
        'input[name="allocations"]',
      );
      expect(JSON.parse(allocationsInput?.value ?? "[]")).toEqual([
        {
          allocatedAmount: "250.0000",
          basis: "FIXED_AMOUNT",
          orderId: "order-id",
        },
      ]);
    },
  );
});
