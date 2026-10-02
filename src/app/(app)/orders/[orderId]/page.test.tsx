import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { RecordWorkspace } from "@/components/layout/record-workspace";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  history: vi.fn(),
  order: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => ({
  getCreditWorkspace: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ role: "MANAGER" }),
  canEditMasterData: () => true,
}));
vi.mock("@/lib/settings/application-settings", () => ({
  getApplicationSettings: mocks.settings,
}));
vi.mock("@/lib/audit/history", () => ({ getRecordHistory: mocks.history }));
vi.mock("@/lib/procurement/orders", () => ({
  getOrder: mocks.order,
  listOrderOptions: async () => ({ currencies: [] }),
}));
vi.mock("@/lib/payments/payments", () => ({
  getOrderPaymentSummary: async () => ({
    supplier: {},
    client: { installments: [] },
  }),
}));
vi.mock("@/lib/quote-intake/history", () => ({
  listOrderQuoteImports: async () => [],
}));
vi.mock("@/lib/related-records/records", () => ({
  getOrderRelations: async () => [],
}));
vi.mock("@/lib/billing/billing", () => ({
  getOrderBillingReconciliation: async () => [],
}));
import OrderPage from "./page";

const id = "11111111-1111-4111-8111-111111111111";
function workspace(
  node: ReactNode,
): ReactElement<ComponentProps<typeof RecordWorkspace>> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === RecordWorkspace)
    return node as ReactElement<ComponentProps<typeof RecordWorkspace>>;
  return Children.toArray(node.props.children).map(workspace).find(Boolean);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockResolvedValue({ itemManagementEnabled: false });
  mocks.history.mockResolvedValue(null);
  mocks.order.mockResolvedValue({
    id,
    orderNumber: "ORDER-1",
    packageName: "ORDER-1",
    status: "CONFIRMED",
    pricingMode: "DIRECT_SELLING_PRICE",
    packageSellingPrice: "150",
    orderCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    project: {
      id: "project",
      name: "Example Project",
      reportingCurrencyCode: "EUR",
    },
    supplier: { displayName: "Example Supplier" },
    supplierPayment: { status: "UNPAID" },
    billing: {
      actualGrossProfit: "20",
      invoicedAllocated: "120",
      quotedAllocated: "0",
    },
    costs: {
      purchaseCost: "100",
      freight: "0",
      customsDuties: "0",
      miscellaneous: "0",
      reportingEconomicLandedCost: "100",
      reportingSellingRevenue: "150",
      grossProfit: "50",
      grossMarginRate: "0.333333",
      missingFx: [],
      inputVat: null,
      outputVat: null,
      purchaseFxRate: null,
      sellingFxRate: null,
    },
    totalSellingAmountIncludingVat: "150",
    carrierCode: null,
    quoteDate: null,
    orderDate: null,
    invoiceDate: null,
    leadTimeWeeks: null,
    expectedReadyDate: null,
    expectedDeliveryDate: null,
    actualDeliveryDate: null,
  });
});

it.each([false, true])(
  "uses selectable Order work areas and respects Items Beta = %s",
  async (enabled) => {
    mocks.settings.mockResolvedValue({ itemManagementEnabled: enabled });
    const page = await OrderPage({
      params: Promise.resolve({ orderId: id }),
      searchParams: Promise.resolve({}),
    });
    const record = workspace(page);
    expect(record?.props.relatedNavigation).toBe(true);
    const related = record?.props.sections.filter(
      (section) => section.group === "related",
    );
    expect(related?.map((section) => section.id)).toEqual([
      "connections",
      "payments",
      "billing",
      "credits",
      "history",
      ...(enabled ? ["items"] : []),
    ]);
    expect(mocks.history).toHaveBeenCalledWith("ORDER", id);
  },
);

it("labels partial allocated Billing against full cost as provisional, not actual profit", async () => {
  const page = await OrderPage({
    params: Promise.resolve({ orderId: id }),
    searchParams: Promise.resolve({}),
  });
  const commercial = workspace(page)?.props.sections.find(
    (section) => section.id === "commercial",
  );
  const html = renderToStaticMarkup(commercial?.content);
  expect(html).toContain("Allocated billing less recorded cost");
  expect(html).toContain("20.00 EUR");
  expect(html).toContain(
    "allocated Invoice HT less the full Order economic cost",
  );
  expect(html).not.toContain("Actual allocated gross profit");
});
