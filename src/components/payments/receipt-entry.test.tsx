// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountForm, enter, control, clickText } from "@/test/dom-form";
import type { ReceiptEntryOptions } from "@/lib/payments/receipt-entry";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/payments/receipt-actions", () => ({
  loadReceiptEntryOptions: mocks.load,
  recordReceiptEntryAction: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/payments/payment-forms", () => ({
  InstallmentForm: () => "Existing installment creation form",
}));
import { ReceiptEntryForm } from "./receipt-entry";

const installment = (id: string, paid: string, outstanding: string) => ({
  id,
  label: id,
  dueDate: "2026-09-10",
  currencyCode: "EUR",
  scheduledAmount: "100",
  paidAmount: paid,
  outstandingAmount: outstanding,
});
const options = {
  orders: [
    {
      id: "order",
      label: "ORD-1 · Furniture · Supplier · Package: Indoor",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
      payable: "200",
      installments: [
        installment("supplier-first", "40", "60"),
        installment("supplier-second", "0", "100"),
      ],
    },
  ],
  billing: [
    {
      id: "billing",
      label: "INV-1 · INVOICE · Client",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
      installments: [
        installment("client-first", "40", "60"),
        installment("client-second", "0", "100"),
      ],
    },
  ],
} as unknown as ReceiptEntryOptions;
describe("central receipt drawer", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ options, message: "" });
    mocks.save.mockResolvedValue({ status: "success", message: "Recorded." });
  });
  afterEach(async () => {
    await view?.unmount();
  });
  async function mount() {
    view = await mountForm(
      createElement(ReceiptEntryForm, {
        projects: [
          { id: "project", name: "Villa" },
          { id: "other", name: "Other" },
        ],
        currencies: [{ code: "EUR" }],
        today: "2026-09-06",
      }),
    );
  }
  async function submit() {
    await act(async () => {
      control("type").form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  }
  it.each(["SUPPLIER", "CLIENT"])(
    "selects %s context, proposes outstanding, keeps partial edits and submits to central action",
    async (type) => {
      await mount();
      await enter("type", type);
      await enter("projectId", "project");
      expect(mocks.load).toHaveBeenCalledWith("project");
      await enter(
        type === "SUPPLIER" ? "orderId" : "billingDocumentId",
        type === "SUPPLIER" ? "order" : "billing",
      );
      const prefix = type === "SUPPLIER" ? "supplier" : "client";
      await enter("installmentId", `${prefix}-first`);
      expect(control("amount").value).toBe("60.00");
      expect(view.container.textContent).toContain(
        "scheduled 100.00 EUR · paid 40.00 EUR · outstanding 60.00 EUR",
      );
      await enter("amount", "20");
      await enter("reference", "Partial transfer");
      expect(control("amount").value).toBe("20.00");
      await enter("installmentId", `${prefix}-second`);
      expect(control("amount").value).toBe("100.00");
      await enter("amount", "25");
      await submit();
      expect(mocks.save).toHaveBeenCalledOnce();
      const sent = mocks.save.mock.calls[0]?.[1] as FormData;
      expect(sent.get("type")).toBe(type);
      expect(sent.get("projectId")).toBe("project");
      expect(sent.get("amount")).toBe("25");
      expect(sent.get(type === "SUPPLIER" ? "settledAt" : "receivedAt")).toBe(
        "2026-09-06",
      );
      expect(view.container.textContent).toContain("Recorded.");
      expect(
        view.container.querySelector(
          `a[href="/payments?tab=${type === "SUPPLIER" ? "supplier" : "client"}&projectId=project&${type === "SUPPLIER" ? "orderId=order" : "billingId=billing"}"]`,
        ),
      ).not.toBeNull();
    },
  );
  it("supports Billing-level receipt and preserves the complete draft on failed save", async () => {
    mocks.save.mockResolvedValue({
      status: "error",
      message: "Balance changed. Review the amount.",
    });
    await mount();
    await enter("type", "CLIENT");
    await enter("projectId", "project");
    await enter("billingDocumentId", "billing");
    await enter("installmentId", "client-first");
    await enter("installmentId", "");
    expect(control("amount").value).toBe("");
    await enter("amount", "10");
    await enter("notes", "Keep my draft");
    await submit();
    expect(control("notes").value).toBe("Keep my draft");
    expect(control("billingDocumentId").value).toBe("billing");
    expect(control("amount").value).toBe("10.00");
    expect(view.container.textContent).toContain("Balance changed");
    const sent = mocks.save.mock.calls[0]?.[1] as FormData;
    expect(sent.get("installmentId")).toBe("");
  });
  it("clears dependent context when Project changes and offers existing installment creation centrally", async () => {
    await mount();
    await enter("projectId", "project");
    await enter("orderId", "order");
    await clickText("Add installment");
    expect(view.container.textContent).toContain(
      "Existing installment creation form",
    );
    await enter("installmentId", "supplier-first");
    await enter("projectId", "other");
    expect(control("orderId").value).toBe("");
    expect(control("installmentId").value).toBe("");
    expect(control("amount").value).toBe("");
  });
});
