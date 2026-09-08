// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { OrderViewMode } from "./order-table";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/orders/actions", () => ({
  updateOrderInlineAction: save,
}));

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

describe("Purchasing inline edits on every tab", () => {
  let mounted: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });
  afterEach(async () => {
    await mounted?.unmount();
    vi.unstubAllGlobals();
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
  async function change(label: string, value: string) {
    const element = document.querySelector<
      HTMLInputElement | HTMLSelectElement
    >(`[aria-label="${label} for PO-001"]`);
    if (!element) throw new Error(`Missing ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype,
        "value",
      )?.set?.call(element, value);
      element.dispatchEvent(
        new Event(element instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  }

  it.each(views)("saves reference, status and dates in %s", async (view) => {
    save.mockImplementation(async (data: FormData) => ({
      status: "success",
      message: "Saved",
      values: Object.fromEntries(data),
    }));
    mounted = await mountForm(row(view));
    await clickText("Edit");
    await change("Internal reference", "PO-002");
    await change("Status", "ORDERED");
    await change("Expected ready date", "12/09/2026");
    await change("Expected delivery date", "25/09/2026");
    await clickText("Save");
    expect(save).toHaveBeenCalledOnce();
    expect(Object.fromEntries(save.mock.calls[0]?.[0] as FormData)).toEqual({
      ...(view === "delivery"
        ? { carrierCode: "", carrierOtherName: "", trackingReference: "" }
        : {}),
      id: "order-id",
      orderNumber: "PO-002",
      status: "ORDERED",
      expectedReadyDate: "2026-09-12",
      expectedDeliveryDate: "2026-09-25",
    });
    expect(
      document.querySelector('a[href="/orders/order-id"]')?.textContent,
    ).toBe("PO-002");
    if (view === "delivery")
      expect(mounted.container.textContent).toContain("25/09/2026");
  });

  it.each(views)(
    "retains failed edits and cancels without saving in %s",
    async (view) => {
      save.mockResolvedValue({
        status: "error",
        message: "Reference already exists.",
      });
      mounted = await mountForm(row(view));
      await clickText("Edit");
      await change("Internal reference", "Duplicate");
      await clickText("Save");
      expect(
        document.querySelector<HTMLInputElement>(
          '[aria-label="Internal reference for PO-001"]',
        )?.value,
      ).toBe("Duplicate");
      expect(mounted.container.textContent).toContain(
        "Reference already exists.",
      );
      await clickText("Cancel");
      expect(save).toHaveBeenCalledOnce();
      expect(
        document.querySelector('a[href="/orders/order-id"]')?.textContent,
      ).toBe("PO-001");
    },
  );

  it("saves custom carrier and tracking directly in Delivery", async () => {
    save.mockImplementation(async (data: FormData) => ({
      status: "success",
      values: Object.fromEntries(data),
    }));
    mounted = await mountForm(row("delivery"));
    await clickText("Edit");
    await change("Carrier", "OTHER");
    await change("Other carrier name", "Local Freight");
    await change("Tracking reference", "AWB-123");
    await clickText("Save");
    expect(
      Object.fromEntries(save.mock.calls[0]?.[0] as FormData),
    ).toMatchObject({
      carrierCode: "OTHER",
      carrierOtherName: "Local Freight",
      trackingReference: "AWB-123",
    });
    expect(mounted.container.textContent).toContain("Local Freight");
    expect(mounted.container.textContent).toContain("AWB-123");
  });

  it.each(views)("keeps %s read-only for viewers", async (view) => {
    mounted = await mountForm(row(view, false));
    expect(document.querySelector('[data-inline-edit="start"]')).toBeNull();
  });
});
