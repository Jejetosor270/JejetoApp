// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import type { PaymentInstallmentView } from "@/lib/payments/payments";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  paid: vi.fn(),
  unpaid: vi.fn(),
  refresh: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/app/(app)/payments/order-term-payment-actions", () => ({
  loadOrderTermPaymentsAction: mocks.load,
  markSupplierTermUnpaidAction: mocks.unpaid,
}));
vi.mock("@/app/(app)/payments/term-paid-actions", () => ({
  payTermRemainingAction: mocks.paid,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { OrderTermPaymentDrawer } from "./order-term-payment-drawer";

let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.paid.mockResolvedValue({ error: null });
  mocks.unpaid.mockResolvedValue({ error: null });
});
afterEach(async () => view?.unmount());

function term(overrides: Partial<PaymentInstallmentView> = {}) {
  return {
    id: "deposit",
    label: "Deposit",
    orderId: "order",
    orderNumber: "PO-1",
    direction: "SUPPLIER_PAYMENT",
    scheduledAmount: "100",
    paidAmount: "0",
    outstandingAmount: "100",
    currencyCode: "EUR",
    reportingCurrencyCode: "EUR",
    isCancelled: false,
    dueDate: "2026-11-05",
    settlements: [],
    ...overrides,
  };
}

const recorded = {
  id: "cash-deposit",
  editVersion: "a".repeat(64),
  amount: "100",
  settledAt: "2026-10-20",
  reference: "Bank transfer",
  notes: null,
  fxRate: null,
};

function loadResult(terms = [term()], cancelled = false) {
  return {
    data: { orderId: "order", orderNumber: "PO-1", cancelled, terms },
    error: null,
  };
}

async function mount(terms = [term()], cancelled = false) {
  mocks.load.mockResolvedValue(loadResult(terms, cancelled));
  view = await mountForm(
    <OrderTermPaymentDrawer orderId="order" open onOpenChange={mocks.close} />,
  );
}

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === label,
  );
}

it("requires an explicit choice for several terms without creating cash on open", async () => {
  await mount([term(), term({ id: "balance", label: "Balance" })]);
  expect(mocks.load).toHaveBeenCalledWith({ orderId: "order" });
  expect(control("termId").value).toBe("");
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(mocks.unpaid).not.toHaveBeenCalled();
  expect(button("Mark as paid")?.disabled ?? true).toBe(true);

  await enter("termId", "balance");
  await enter("paymentDate", "12/11/2026");
  await clickText("Mark as paid");
  expect(mocks.paid).toHaveBeenCalledOnce();
  expect(mocks.paid).toHaveBeenCalledWith({
    kind: "supplier",
    id: "balance",
    date: "2026-11-12",
    fxRate: "",
  });
  expect(mocks.unpaid).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("selects a single term but still waits for payment confirmation", async () => {
  await mount();
  expect(control("termId").value).toBe("deposit");
  expect(document.body.textContent).toContain("100.00 EUR");
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(button("Mark as paid")?.disabled).toBe(false);
  expect(button("Mark as unpaid")).toBeUndefined();
});

it("confirms reversal of only the selected paid term with its reviewed cash versions", async () => {
  await mount([
    term({
      paidAmount: "100",
      outstandingAmount: "0",
      settlements: [recorded],
    }),
    term({ id: "balance", label: "Balance" }),
  ]);
  await enter("termId", "deposit");
  expect(button("Mark as paid")).toBeUndefined();
  await clickText("Mark as unpaid");
  expect(mocks.unpaid).not.toHaveBeenCalled();
  expect(document.body.textContent?.toLowerCase()).toContain("refund");
  await enter("reason", "Recorded against the wrong term");
  await clickText("Confirm unpaid");
  expect(mocks.unpaid).toHaveBeenCalledWith({
    orderId: "order",
    termId: "deposit",
    payments: [{ id: recorded.id, version: recorded.editVersion }],
    reason: "Recorded against the wrong term",
  });
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("retains a partial term and reversal reason after a stale-state rejection", async () => {
  mocks.unpaid.mockResolvedValue({ error: "Payments changed. Reload first." });
  await mount([
    term({
      paidAmount: "20",
      outstandingAmount: "80",
      settlements: [{ ...recorded, amount: "20" }],
    }),
  ]);
  expect(button("Mark as paid")).toBeDefined();
  await clickText("Mark as unpaid");
  await enter("reason", "Duplicate payment entry");
  await clickText("Confirm unpaid");
  expect(document.body.textContent).toContain(
    "Payments changed. Reload first.",
  );
  expect(control("termId").value).toBe("deposit");
  expect(control("reason").value).toBe("Duplicate payment entry");
  expect(mocks.close).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("preserves the selected term, payment date and actual FX after a rejected payment", async () => {
  mocks.paid.mockResolvedValue({ error: "Review actual FX." });
  await mount([term({ currencyCode: "USD" })]);
  await enter("paymentDate", "12/11/2026");
  await enter("paymentFx", "0.92");
  await clickText("Mark as paid");
  expect(document.body.textContent).toContain("Review actual FX.");
  expect(control("termId").value).toBe("deposit");
  expect(control("paymentDate").value).toBe("12/11/2026");
  expect(control("paymentFx").value).toBe("0.92");
  expect(mocks.close).not.toHaveBeenCalled();
});

it("offers a retry after a failed load without exposing payment controls", async () => {
  mocks.load.mockResolvedValueOnce({
    data: null,
    error: "Please retry loading.",
  });
  view = await mountForm(
    <OrderTermPaymentDrawer orderId="order" open onOpenChange={mocks.close} />,
  );
  expect(document.body.textContent).toContain("Please retry loading.");
  expect(button("Mark as paid")).toBeUndefined();
  mocks.load.mockResolvedValueOnce(loadResult());
  await clickText("Try again");
  expect(control("termId").value).toBe("deposit");
  expect(mocks.load).toHaveBeenCalledTimes(2);
});

it("links unscheduled Orders to their terms without silently paying the whole Order", async () => {
  await mount([]);
  expect(document.querySelector('a[href^="/orders/order"]')).not.toBeNull();
  expect(button("Mark as paid")).toBeUndefined();
  expect(button("Mark as unpaid")).toBeUndefined();
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(mocks.unpaid).not.toHaveBeenCalled();
});

it("does not expose mutations when the Order was cancelled after opening", async () => {
  await mount([term({ settlements: [recorded] })], true);
  expect(button("Mark as paid")).toBeUndefined();
  expect(button("Mark as unpaid")).toBeUndefined();
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(mocks.unpaid).not.toHaveBeenCalled();
});
