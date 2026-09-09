// @vitest-environment happy-dom
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountForm } from "@/test/dom-form";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { OrderViewMode } from "./order-table";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/cell-actions", () => ({ saveTableCellAction: save }));

import { OrderRow } from "./order-table-row";

const order = {
  id: "order-id",
  orderNumber: "PO-001",
  packageName: "Furniture",
  status: "DRAFT",
  expectedReadyDate: "2026-09-10",
  expectedDeliveryDate: "2026-09-20",
  orderCurrencyCode: "EUR",
  sellingCurrencyCode: "EUR",
  buildings: [],
  project: { name: "Project", reportingCurrencyCode: "EUR" },
  supplier: { displayName: "Supplier" },
  costs: {
    purchaseCost: "100",
    reportingEconomicLandedCost: "100",
    reportingSellingRevenue: "150",
    markupRate: "0.5",
  },
  supplierPayment: {
    totalPayable: "100",
    scheduled: "100",
    paid: "0",
    outstanding: "100",
    nextDueDate: "2026-09-20",
    status: "SCHEDULED",
  },
} as unknown as OrderSummary;
const views: OrderViewMode[] = [
  "general",
  "financial",
  "supplier-payment",
  "delivery",
];

describe("Purchasing click-to-edit on every column set", () => {
  let mounted: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await mounted?.unmount();
  });
  const row = (view: OrderViewMode, canEdit = true) => (
    <table>
      <tbody>
        <OrderRow
          order={order}
          view={view}
          canEdit={canEdit}
          statuses={["DRAFT", "ORDERED"]}
          isSelected={false}
          onSelect={vi.fn()}
        />
      </tbody>
    </table>
  );
  const button = async (label: string) => {
    const element = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!element) throw new Error(label);
    await act(async () => element.click());
  };
  async function change(value: string) {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Reference for PO-001"]',
    );
    if (!input) throw new Error("Missing reference");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it.each(views)("saves just the reference in %s", async (view) => {
    save.mockResolvedValue({ status: "success" });
    mounted = await mountForm(row(view));
    await button("Edit Reference for PO-001");
    await change("PO-002");
    await button("Save Reference for PO-001");
    expect(save).toHaveBeenCalledExactlyOnceWith({
      kind: "order",
      id: "order-id",
      field: "orderNumber",
      previous: "PO-001",
      value: "PO-002",
    });
    expect(document.querySelector("form")).toBeNull();
  });
  it.each(views)(
    "retains failed drafts and cancels without saving in %s",
    async (view) => {
      save.mockResolvedValue({
        status: "error",
        message: "Reference already exists.",
      });
      mounted = await mountForm(row(view));
      await button("Edit Reference for PO-001");
      await change("Duplicate");
      await button("Save Reference for PO-001");
      expect(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Reference for PO-001"]',
        )?.value,
      ).toBe("Duplicate");
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Reference already exists.",
      );
      await button("Cancel editing Reference for PO-001");
      expect(save).toHaveBeenCalledOnce();
      expect(
        document.querySelector('a[href="/orders/order-id"]')?.textContent,
      ).toBe("PO-001");
    },
  );
  it.each(views)("keeps %s read-only for viewers", async (view) => {
    mounted = await mountForm(row(view, false));
    expect(document.querySelector("button")).toBeNull();
    expect(
      document.querySelector('a[href="/orders/order-id"]')?.textContent,
    ).toBe("PO-001");
  });
  it("keeps references as links without restoring title or currency sublines", async () => {
    mounted = await mountForm(row("general", false));
    expect(document.querySelector("tbody td")?.textContent).toBe("PO-001");
  });
  it("opens pricing and payment sources instead of directly overwriting calculated totals", async () => {
    mounted = await mountForm(row("supplier-payment"));
    expect(
      document
        .querySelector('a[aria-label="Edit Paid for PO-001"]')
        ?.getAttribute("href"),
    ).toBe("/orders/order-id?tab=related#payments");
    expect(
      document
        .querySelector('a[aria-label="Edit Payable for PO-001"]')
        ?.getAttribute("href"),
    ).toBe("/orders/order-id?edit=1");
  });
});
