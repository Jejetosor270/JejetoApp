// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
import type {
  DirectionScheduleSummary,
  PaymentInstallmentView,
} from "@/lib/payments/payments";

const mocks = vi.hoisted(() => ({
  paid: vi.fn(),
  refresh: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/(app)/payments/term-paid-actions", () => ({
  payTermRemainingAction: mocks.paid,
}));
vi.mock("@/app/(app)/payments/term-actions", () => ({
  setPaymentTermCancelled: mocks.cancel,
}));
vi.mock("@/components/layout/related-records", () => ({
  RelatedRecordTable: ({
    rowActions,
  }: {
    rowActions: Record<string, ReactNode>;
  }) => (
    <div>
      {Object.entries(rowActions).map(([id, content]) => (
        <section key={id}>{content}</section>
      ))}
    </div>
  ),
}));
vi.mock("./payment-forms", () => ({
  InstallmentForm: () => (
    <input aria-label="Term draft" defaultValue="Deposit" />
  ),
  PresetForm: () => null,
  SettlementForm: () => <input aria-label="Payment draft" defaultValue="" />,
  SettlementCorrection: () => <button>Correct payment</button>,
}));
vi.mock("./related-cash-create", () => ({
  RelatedCashCreate: () => null,
  ClientReceiptCreateForm: () => (
    <input aria-label="Receipt draft" defaultValue="" />
  ),
}));
vi.mock("@/components/billing/billing-installment-editor", () => ({
  BillingInstallmentEditor: () => <button>Term details</button>,
}));
vi.mock("@/components/billing/billing-receipt-editor", () => ({
  BillingReceiptEditor: () => <button>Correct receipt</button>,
}));
import { PaymentSchedule } from "./payment-schedule";
import { BillingScheduleManager } from "@/components/billing/billing-schedule-manager";

let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  mocks.paid.mockResolvedValue({ error: null });
});
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});

function supplier(paid = "20", cancelled = false): PaymentInstallmentView {
  return {
    id: "term",
    label: "Deposit",
    scheduledAmount: "100",
    outstandingAmount: "80",
    currencyCode: "EUR",
    isCancelled: cancelled,
    dueDate: null,
    settlements: [
      {
        id: "cash",
        amount: paid,
        settledAt: "2026-10-01",
        reference: "Transfer",
      },
    ],
  } as unknown as PaymentInstallmentView;
}
async function mountSupplier(paid = "20", cancelled = false, canEdit = true) {
  const term = supplier(paid, cancelled);
  view = await mountForm(
    <PaymentSchedule
      canEdit={canEdit}
      currencies={[{ code: "EUR" }]}
      direction="SUPPLIER_PAYMENT"
      orderId="order"
      reportingCurrencyCode="EUR"
      today="2026-10-02"
      summary={
        {
          baseAmount: "100",
          baseCurrencyCode: "EUR",
          paid,
          remainingTotal: "80",
          unscheduled: "0",
          overallocated: "0",
          reconciliationComplete: true,
          installments: [term],
        } as unknown as DirectionScheduleSummary
      }
    />,
  );
}
async function mountBilling(
  status = "INVOICED",
  paid = "20",
  cancelled = false,
  canEdit = true,
) {
  const bill = {
    id: "bill",
    status,
    documentType: "INVOICE",
    currencyCode: "EUR",
    totalTtc: "100",
    paid,
    outstanding: paid === "100" ? "0" : "80",
    isCancelled: status === "CANCELLED",
    matchedInstallmentId: null,
    project: { reportingCurrencyCode: "EUR" },
    receipts: [],
    paymentInstallments: [
      {
        id: "term",
        billingDocumentId: "bill",
        label: "Deposit",
        scheduledAmount: "100",
        currencyCode: "EUR",
        isCancelled: cancelled,
        dueDate: null,
        receipts: [{ id: "cash", amount: paid }],
      },
    ],
  } as unknown as ClientBillingView;
  view = await mountForm(
    <BillingScheduleManager canEdit={canEdit} document={bill} />,
  );
}
function more() {
  const summary = [...document.querySelectorAll("summary")].find((node) =>
    node.textContent?.includes("More actions"),
  );
  if (!summary || !(summary.parentElement instanceof HTMLDetailsElement))
    throw new Error("Missing More actions");
  return { summary, details: summary.parentElement };
}

it.each(["supplier", "billing"])(
  "keeps only the full-payment primary action outside %s overflow",
  async (kind) => {
    if (kind === "supplier") await mountSupplier();
    else await mountBilling();
    const { summary, details } = more();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Record partial payment");
    expect(details.textContent).toContain("Term details");
    expect(details.textContent).toContain("Cancel remaining term");
    expect(details.textContent).not.toContain("Mark paid");
    await act(async () => summary.click());
    expect(details.open).toBe(true);
    await act(async () =>
      details.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    await clickText("Mark paid");
    expect(mocks.paid).toHaveBeenCalledOnce();
  },
);

it.each(["supplier", "billing"])(
  "removes payment and cancel actions from fully paid %s terms but keeps corrections",
  async (kind) => {
    if (kind === "supplier") await mountSupplier("100");
    else await mountBilling("PAID", "100");
    expect(document.body.textContent).not.toContain("Mark paid");
    expect(document.body.textContent).not.toContain("Record partial payment");
    expect(document.body.textContent).not.toContain("Cancel remaining term");
    expect(more().details.textContent).toContain("Term details");
    expect(document.body.textContent).toContain("Payment history (1)");
    expect(document.body.textContent).toContain(
      kind === "supplier" ? "Correct payment" : "Correct receipt",
    );
  },
);

it.each(["supplier", "billing"])(
  "offers reactivation but not another payment on cancelled %s terms",
  async (kind) => {
    if (kind === "supplier") await mountSupplier("20", true);
    else await mountBilling("INVOICED", "20", true);
    expect(document.body.textContent).not.toContain("Mark paid");
    expect(document.body.textContent).not.toContain("Record partial payment");
    expect(document.body.textContent).not.toContain("Cancel remaining term");
    expect(more().details.textContent).toContain("Reactivate term");
  },
);

it.each(["DRAFT", "TO_BE_INVOICED", "CANCELLED"])(
  "preserves issue-first payment gating for %s Billing",
  async (status) => {
    await mountBilling(status);
    expect(document.body.textContent).not.toContain("Mark paid");
    expect(document.body.textContent).not.toContain("Record partial payment");
    expect(mocks.paid).not.toHaveBeenCalled();
  },
);

it.each(["supplier", "billing"])(
  "does not offer mutation actions to read-only %s employees",
  async (kind) => {
    if (kind === "supplier") await mountSupplier("20", false, false);
    else await mountBilling("INVOICED", "20", false, false);
    expect(document.body.textContent).not.toContain("More actions");
    expect(document.body.textContent).not.toContain("Mark paid");
    expect(document.body.textContent).toContain("Payment history (1)");
  },
);

it("keeps the term editor mounted independently of the overflow disclosure", async () => {
  await mountSupplier();
  const { summary, details } = more();
  await act(async () => summary.click());
  await clickText("Term details");
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Term draft"]',
  );
  if (!input) throw new Error("Missing editor");
  input.value = "Changed deposit";
  await act(async () => {
    details.open = false;
  });
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Term draft"]')
      ?.value,
  ).toBe("Changed deposit");
});

it("retains date and actual FX in the payment drawer after a rejected save", async () => {
  mocks.paid.mockResolvedValue({ error: "Review actual payment FX" });
  await mountSupplier();
  await clickText("Mark paid");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Review actual payment FX",
  );
  await enter("paymentDate", "2026-10-01");
  await enter("paymentFx", "0.85");
  await clickText("Record remaining payment");
  expect(mocks.paid).toHaveBeenLastCalledWith({
    kind: "supplier",
    id: "term",
    date: "2026-10-01",
    fxRate: "0.85",
  });
  expect(control("paymentFx").value).toBe("0.85");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Review actual payment FX",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
