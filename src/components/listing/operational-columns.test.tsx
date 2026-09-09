// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mountForm } from "@/test/dom-form";
import {
  orderViewColumns,
  orderSortLabels,
  type OrderViewMode,
} from "@/config/order-list";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () =>
    new URLSearchParams("projectId=test&view=general&page=3"),
}));
vi.mock("@/app/(app)/orders/actions", () => ({
  deleteSelectedOrdersAction: vi.fn(),
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  updateClientBillingInlineAction: vi.fn(),
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: vi.fn(),
}));
vi.mock("@/components/procurement/order-table-row", () => ({
  OrderRow: () => null,
}));
vi.mock("@/components/payments/record-payment-status", () => ({
  RecordPaymentStatus: () => <span>Unpaid</span>,
}));
import { OrderTable } from "@/components/procurement/order-table";
import { BillingTable } from "@/components/billing/billing-table";
import type { ClientBillingView } from "@/lib/billing/billing";
let mounted: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await mounted?.unmount();
});

it.each(Object.keys(orderViewColumns) as OrderViewMode[])(
  "makes every %s Purchasing data column sortable and keeps filters",
  async (view) => {
    mounted = await mountForm(
      <OrderTable canEdit={false} orders={[]} statuses={[]} view={view} />,
    );
    const headers = [...document.querySelectorAll("thead th")];
    expect(headers).toHaveLength(orderViewColumns[view].length);
    for (const [index, field] of orderViewColumns[view].entries()) {
      const link = headers[index]?.querySelector("a");
      expect(link?.textContent).toBe(orderSortLabels[field]);
      const query = new URL(link?.href ?? "").searchParams;
      expect(query.get("sort")).toBe(field);
      expect(query.get("projectId")).toBe("test");
      expect(query.has("page")).toBe(false);
    }
  },
);
it("shows Billing invoice dates and HT without a TTC column; keeps cash amounts", async () => {
  const record = {
    id: "bill",
    reference: "INV-01",
    documentType: "INVOICE",
    documentDate: "2026-09-08",
    dueDate: "2026-09-30",
    client: { displayName: "Client" },
    project: { name: "Project" },
    currencyCode: "EUR",
    totalHt: "100",
    totalTtc: "120",
    paid: "20",
    outstanding: "100",
  } as ClientBillingView;
  mounted = await mountForm(
    <BillingTable canEdit={false} documents={[record]} />,
  );
  const labels = [...document.querySelectorAll("thead th")].map(
    (cell) => cell.textContent,
  );
  expect(labels).toContain("Invoice date");
  expect(labels).not.toContain("TTC");
  expect(labels).toContain("Received");
  expect(labels).toContain("Outstanding");
  expect(document.querySelector("tbody")?.textContent).toContain("08/09/2026");
});
