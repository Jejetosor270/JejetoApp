import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  archived: vi.fn(),
  cash: vi.fn(),
  orders: vi.fn(),
  invoices: vi.fn(),
  supplier: vi.fn(),
  client: vi.fn(),
  freight: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./financial-attention", () => ({
  getFinancialAttention: state.archived,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    unassignedCashRecord: { findMany: state.cash },
    procurementOrder: { findMany: state.orders },
    clientBillingDocument: { findMany: state.invoices },
    paymentInstallment: { findMany: state.supplier },
    clientPaymentInstallment: { findMany: state.client },
    projectFreightExpense: { findMany: state.freight },
  }),
}));
import { getAttentionDataQuality } from "./attention-data-quality";
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of [
    "cash",
    "orders",
    "invoices",
    "supplier",
    "client",
    "freight",
  ] as const)
    state[key].mockResolvedValue([]);
  state.archived.mockResolvedValue({ projects: [], issues: [] });
});
it("uses archived source readers separately and selects only financial orphan records", async () => {
  expect(await getAttentionDataQuality("2026-10-02")).toEqual([]);
  expect(state.archived).toHaveBeenCalledWith(
    30,
    "2026-10-02",
    undefined,
    "archived",
  );
  expect(state.orders).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: { not: "CANCELLED" },
        costLines: { some: { originalAmount: { gt: 0 } } },
      }),
    }),
  );
  expect(state.invoices).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        documentType: "INVOICE",
        isCancelled: false,
        workflowStatus: { notIn: ["DRAFT", "CANCELLED"] },
      }),
    }),
  );
  expect(state.supplier).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        orderId: null,
        direction: "SUPPLIER_PAYMENT",
        isCancelled: false,
      },
    }),
  );
});
it("keeps cash and document amounts original, separate and linked to their review screens", async () => {
  state.cash.mockResolvedValue([
    {
      id: "cash",
      direction: "SUPPLIER_PAYMENT",
      amount: "123.4567",
      currencyCode: "USD",
      reference: null,
      cashDate: new Date("2026-10-01"),
    },
  ]);
  state.orders.mockResolvedValue([
    {
      id: "order",
      orderNumber: "PO",
      orderCurrencyCode: "GBP",
      invoiceDate: null,
      project: null,
    },
  ]);
  state.invoices.mockResolvedValue([
    {
      id: "invoice",
      reference: "INV",
      currencyCode: "EUR",
      totalTtc: "900",
      documentDate: new Date("2026-10-01"),
      project: { id: "project", name: "Project" },
    },
  ]);
  const issues = await getAttentionDataQuality("2026-10-02");
  expect(issues).toHaveLength(3);
  expect(issues[0]).toMatchObject({
    key: "unassigned-cash:cash",
    amount: "123.4567",
    currency: "USD",
    projectId: "",
    href: "/unassigned-cash",
  });
  expect(issues[1]).toMatchObject({
    key: "unassigned-order:order",
    amount: null,
    currency: "GBP",
  });
  expect(issues[2]).toMatchObject({
    key: "unassigned-invoice:invoice",
    amount: "900",
    currency: "EUR",
    projectId: "project",
  });
});
it("uses authoritative cash to show orphan term balances, including fully-paid historical terms", async () => {
  state.supplier.mockResolvedValue([
    {
      id: "term",
      label: "Deposit",
      scheduledAmount: "120",
      currencyCode: "EUR",
      dueDate: null,
      settlements: [{ id: "cash", amount: "20" }],
    },
  ]);
  state.client.mockResolvedValue([
    {
      id: "client-term",
      label: "Paid term",
      scheduledAmount: "120",
      currencyCode: "EUR",
      dueDate: null,
      receipts: [{ id: "receipt", amount: "120" }],
    },
  ]);
  const rows = await getAttentionDataQuality("2026-10-02");
  expect(rows.map((row) => row.amount)).toEqual(["100.0000", "0.0000"]);
  expect(rows[1]?.detail).toContain("not issued-Invoice cash income");
});
it("retains an overpaid orphan term for review with an unknown remaining balance", async () => {
  state.supplier.mockResolvedValue([
    {
      id: "term",
      label: "Review",
      scheduledAmount: "10",
      currencyCode: "EUR",
      dueDate: null,
      settlements: [{ id: "cash", amount: "11" }],
    },
  ]);
  expect((await getAttentionDataQuality("2026-10-02"))[0]?.amount).toBeNull();
});
