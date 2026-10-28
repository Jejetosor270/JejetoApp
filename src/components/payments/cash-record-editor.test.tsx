import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.authorize,
}));
vi.mock("@/lib/payments/term-editor", () => ({
  getPaymentTermEditorData: mocks.load,
}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.database }));
vi.mock("@/lib/payments/payments", () => ({
  getOrderPaymentSummary: vi.fn(),
}));
vi.mock("@/lib/billing/billing", () => ({
  getClientBillingDocument: vi.fn(),
}));
vi.mock("@/components/billing/billing-term-actions", () => ({
  BillingTermActions: () => null,
}));
vi.mock("@/components/billing/billing-receipt-editor", () => ({
  BillingReceiptEditor: () => null,
}));
vi.mock("./supplier-term-actions", () => ({
  SupplierTermActions: () => null,
}));
vi.mock("./supplier-record-editor", () => ({
  SupplierRecordEditor: () => null,
}));

import { BillingTermActions } from "@/components/billing/billing-term-actions";
import { SupplierTermActions } from "./supplier-term-actions";
import { cashRecordEditor } from "./cash-record-editor";

beforeEach(() => vi.resetAllMocks());

it.each(["supplier-installment", "client-installment"] as const)(
  "requires editor authorization before loading a %s",
  async (kind) => {
    mocks.authorize.mockRejectedValue(new Error("Not authorized"));
    await expect(cashRecordEditor(kind, "term")).rejects.toThrow(
      "Not authorized",
    );
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  },
);

it("opens the full Supplier term controls with the authoritative context", async () => {
  const installment = { id: "term", editVersion: "version" };
  const currencies = [{ code: "EUR" }, { code: "USD" }];
  let authorized = false;
  mocks.authorize.mockImplementation(async () => {
    authorized = true;
  });
  mocks.load.mockImplementation(async () => {
    expect(authorized).toBe(true);
    return {
      kind: "supplier",
      installment,
      baseAmount: "123.4500",
      currencies,
      canPay: false,
    };
  });

  expect(await cashRecordEditor("supplier-installment", "term")).toMatchObject({
    type: SupplierTermActions,
    props: { installment, baseAmount: "123.4500", currencies, canPay: false },
  });
  expect(mocks.load).toHaveBeenCalledWith("supplier", "term");
  expect(mocks.database).not.toHaveBeenCalled();
});

it("opens the full Billing term controls with its owning document", async () => {
  const term = { id: "term", editVersion: "version" };
  const document = { id: "billing", paymentInstallments: [term] };
  mocks.load.mockResolvedValue({ kind: "client", document, term });

  expect(await cashRecordEditor("client-installment", "term")).toMatchObject({
    type: BillingTermActions,
    props: { document, term },
  });
  expect(mocks.load).toHaveBeenCalledWith("client", "term");
  expect(mocks.database).not.toHaveBeenCalled();
});

it.each(["supplier-installment", "client-installment"] as const)(
  "does not render an editor for a missing %s",
  async (kind) => {
    mocks.load.mockResolvedValue(null);
    expect(await cashRecordEditor(kind, "missing")).toBeNull();
    expect(mocks.database).not.toHaveBeenCalled();
  },
);
