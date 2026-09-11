import Decimal from "decimal.js";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  db: {
    unassignedCashRecord: { findFirst: vi.fn().mockResolvedValue(null) },
    paymentSettlement: { findUnique: vi.fn() },
    clientReceipt: { findUnique: vi.fn() },
    paymentInstallment: { findUnique: vi.fn() },
    clientPaymentInstallment: { findUnique: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => mock.db }));
vi.mock("@/lib/auth/current-user", () => ({
  canEditMasterData: (role: string) => role === "ADMIN" || role === "MANAGER",
  requireUser: mock.user,
}));
import { getCashRecord } from "./cash-records";
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const party = { id, displayName: "Fictional party", isActive: true };
const project = {
  id,
  name: "Project",
  code: "P",
  status: "ACTIVE",
  reportingCurrencyCode: "EUR",
};
const order = {
  id,
  orderNumber: "O1",
  packageName: "Package",
  projectId: id,
  status: "CONFIRMED",
  orderCurrencyCode: "USD",
  orderDate: null,
  supplier: party,
  project,
};
const billing = {
  workflowStatus: "INVOICED",
  dueDate: null,
  receipts: [],
  paymentInstallments: [],
  matchedInstallment: null,
  id,
  reference: "INV1",
  projectId: id,
  documentType: "INVOICE",
  documentDate: new Date("2026-09-01"),
  currencyCode: "EUR",
  totalHt: new Decimal("1"),
  totalTtc: new Decimal("1.2"),
  isCancelled: false,
  client: party,
  project,
};
const installment = {
  id,
  label: "Deposit",
  direction: "SUPPLIER_PAYMENT",
  dueDate: new Date("2099-01-01"),
  scheduledAmount: new Decimal("0.3"),
  currencyCode: "USD",
  isCancelled: false,
  basis: "FIXED_AMOUNT",
  percentageRate: null,
  expectedFxRateToReporting: null,
  notes: null,
  order,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id, role: "USER" });
});
const field = (
  record: Awaited<ReturnType<typeof getCashRecord>>,
  label: string,
) => record?.fields.find((row) => row.label === label)?.value;

it("preserves Supplier payment currency, missing actual FX and exact parent links", async () => {
  mock.db.paymentSettlement.findUnique.mockResolvedValue({
    id,
    reference: "PAY1",
    amount: new Decimal("123.4567"),
    settledAt: new Date("2026-09-02"),
    fxRateToReporting: null,
    notes: null,
    installment,
  });
  const view = await getCashRecord("payment", id);
  expect(view?.type).toBe("Supplier payment");
  expect(field(view, "Amount")).toBe("123.46 USD");
  expect(field(view, "Actual FX to reporting")).toBe(
    "Missing · reporting incomplete",
  );
  expect(view?.tables.map((table) => table.id)).toEqual([
    "projects",
    "orders",
    "suppliers",
    "supplier-installments",
  ]);
  expect(view?.tables.at(-1)?.rows[0]?.href).toBe(
    `/installments/supplier/${id}?tab=related`,
  );
});

it("derives paid status and outstanding with Decimal-safe 0.1 + 0.2 settlement totals", async () => {
  mock.db.paymentInstallment.findUnique.mockResolvedValue({
    ...installment,
    settlements: ["0.1", "0.2"].map((amount, index) => ({
      id: String(index),
      amount: new Decimal(amount),
      settledAt: new Date("2026-09-02"),
      reference: null,
      installment,
    })),
  });
  const view = await getCashRecord("supplier-installment", id);
  expect(view?.status).toBe("PAID");
  expect(field(view, "Outstanding")).toBe("0.00 USD");
  expect(
    view?.tables.find((table) => table.id === "payments")?.rows,
  ).toHaveLength(2);
});

it("does not mislabel historical Order Client settlements as authoritative cash", async () => {
  mock.db.paymentSettlement.findUnique.mockResolvedValue({
    id,
    reference: null,
    amount: new Decimal("0.1"),
    settledAt: new Date("2026-09-02"),
    fxRateToReporting: null,
    notes: null,
    installment: { ...installment, direction: "CLIENT_RECEIPT" },
  });
  const view = await getCashRecord("payment", id);
  expect(view?.type).toBe("Historical Client settlement");
  expect(view?.tables.at(-1)?.title).toBe("Historical Client installments");
});

it("shows a receipt's owning Invoice, original Quote and matched Invoice once each", async () => {
  const quote = {
    ...billing,
    id: otherId,
    reference: "Q1",
    documentType: "QUOTE",
  };
  mock.db.clientReceipt.findUnique.mockResolvedValue({
    id,
    reference: "REC1",
    amount: new Decimal("0.2"),
    receivedAt: new Date("2026-09-02"),
    fxRateToReporting: null,
    notes: null,
    billingDocument: billing,
    installment: {
      ...installment,
      billingDocument: quote,
      matchedInvoices: [billing],
    },
  });
  const view = await getCashRecord("receipt", id);
  const rows = view?.tables.find((table) => table.id === "billing")?.rows;
  expect(rows?.map((row) => row.id)).toEqual([id, otherId]);
  expect(view?.tables.some((table) => table.id === "orders")).toBe(false);
  expect(field(view, "Amount")).toBe("0.20 EUR");
});

it("supports Billing-level receipts with no installment", async () => {
  mock.db.clientReceipt.findUnique.mockResolvedValue({
    id,
    reference: null,
    amount: new Decimal("0.2"),
    receivedAt: new Date("2026-09-02"),
    fxRateToReporting: null,
    notes: null,
    billingDocument: billing,
    installment: null,
  });
  const view = await getCashRecord("receipt", id);
  expect(
    view?.tables.find((table) => table.id === "client-installments")?.rows,
  ).toEqual([]);
});

it("shows Client installment receipts once and links both Quote and matching Invoice", async () => {
  const quote = {
    ...billing,
    id: otherId,
    reference: "Q1",
    documentType: "QUOTE",
  };
  mock.db.clientPaymentInstallment.findUnique.mockResolvedValue({
    ...installment,
    currencyCode: "EUR",
    billingDocument: quote,
    matchedInvoices: [billing],
    receipts: [
      {
        id: "receipt",
        amount: new Decimal("0.2"),
        reference: null,
        installmentId: id,
        receivedAt: new Date("2026-09-02"),
        billingDocument: billing,
      },
    ],
  });
  const view = await getCashRecord("client-installment", id);
  expect(view?.status).toBe("PARTIALLY_PAID");
  expect(field(view, "Outstanding")).toBe("0.10 EUR");
  expect(
    view?.tables.find((table) => table.id === "receipts")?.rows,
  ).toHaveLength(1);
  expect(
    view?.tables.find((table) => table.id === "billing")?.rows,
  ).toHaveLength(2);
});

it("returns not found for invalid/deleted records and authorizes before reading", async () => {
  expect(await getCashRecord("payment", "invalid")).toBeNull();
  expect(mock.db.paymentSettlement.findUnique).not.toHaveBeenCalled();
  mock.db.paymentSettlement.findUnique.mockResolvedValue(null);
  expect(await getCashRecord("payment", id)).toBeNull();
  mock.db.paymentSettlement.findUnique.mockClear();
  mock.user.mockRejectedValue(new Error("Sign in required"));
  await expect(getCashRecord("payment", id)).rejects.toThrow(
    "Sign in required",
  );
  expect(mock.db.paymentSettlement.findUnique).not.toHaveBeenCalled();
});
