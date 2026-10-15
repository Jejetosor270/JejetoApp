// @vitest-environment happy-dom
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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
    const source = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Manage Supplier paid TTC for PO-001"]',
    );
    await act(async () => source?.click());
    expect(
      document.querySelector('[role="dialog"] a')?.getAttribute("href"),
    ).toBe("/orders/order-id?tab=related#payments");
  });
  it("shows Paid without a date and directs employees to actual payment history", async () => {
    mounted = await mountForm(
      <table>
        <tbody>
          <OrderRow
            order={{
              ...order,
              supplierPayment: {
                ...order.supplierPayment,
                status: "PAID",
                paidAt: "2026-09-26",
                nextDueDate: null,
              },
            }}
            view="general"
            canEdit
            statuses={["DRAFT"]}
            isSelected={false}
            onSelect={vi.fn()}
          />
        </tbody>
      </table>,
    );
    const paid = document.querySelector(
      'button[aria-label="Manage Payment history for PO-001"]',
    );
    expect(paid?.textContent).toBe("Paid");
    expect(mounted.container.textContent).not.toContain("26/09/2026");
    expect(
      document.querySelector(
        'button[aria-label="Edit Next payment due for PO-001"]',
      ),
    ).toBeNull();
    await button("Manage Payment history for PO-001");
    expect(
      document.querySelector('[role="dialog"] a')?.getAttribute("href"),
    ).toBe("/orders/order-id?tab=related#payments");
    expect(save).not.toHaveBeenCalled();
  });
  it("shows a source-aware Quote date instead of an empty Invoice date", async () => {
    mounted = await mountForm(
      <table>
        <tbody>
          <OrderRow
            order={{ ...order, quoteDate: "2026-10-01", invoiceDate: null }}
            view="general"
            canEdit
            statuses={["DRAFT"]}
            isSelected={false}
            onSelect={vi.fn()}
          />
        </tbody>
      </table>,
    );
    const source = document.querySelector(
      'button[aria-label="Edit Supplier document date · Quote for PO-001"]',
    );
    expect(source?.textContent).toContain("01/10/2026");
    expect(source?.textContent).toContain("Quote");
  });
  it("keeps the Delivery table focused on delivery instead of the legacy ready milestone", async () => {
    mounted = await mountForm(row("delivery", false));
    expect(mounted.container.textContent).toContain("20/09/2026");
    expect(mounted.container.textContent).not.toContain("10/09/2026");
  });
  it("opens delivery confirmation before changing an Order to Delivered", async () => {
    mounted = await mountForm(
      <table>
        <tbody>
          <OrderRow
            order={order}
            view="delivery"
            canEdit
            statuses={["DRAFT", "DELIVERED"]}
            isSelected={false}
            onSelect={vi.fn()}
          />
        </tbody>
      </table>,
    );
    await button("Edit Delivery status for PO-001");
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Delivery status for PO-001"]',
    );
    if (!select) throw new Error("Missing delivery status");
    await act(async () => {
      select.value = "DELIVERED";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await button("Save Delivery status for PO-001");
    expect(save).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      "/orders/order-id?edit=1&delivery=1",
    );
    expect(document.querySelector("tbody")?.textContent).toContain("Draft");
    expect(document.querySelector("tbody")?.textContent).not.toContain(
      "Delivered",
    );
  });
});
