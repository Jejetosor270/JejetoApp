// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/billing/actions", () => ({
  createClientBillingInstallmentAction: vi.fn(),
  recordClientReceiptAction: vi.fn(async () => ({
    status: "error",
    message: "Review the entered amount",
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./billing-installment-editor", () => ({
  BillingInstallmentEditor: () => null,
}));
vi.mock("./billing-receipt-editor", () => ({
  BillingReceiptEditor: () => null,
}));
import { BillingScheduleManager } from "./billing-schedule-manager";
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});
it("marks a term paid from its exact remaining balance and preserves a rejected partial-payment draft", async () => {
  const document = {
    id: "bill",
    documentType: "INVOICE",
    currencyCode: "EUR",
    project: { reportingCurrencyCode: "EUR" },
    totalTtc: "30000",
    paid: "10000",
    outstanding: "20000",
    matchedInstallmentId: null,
    isCancelled: false,
    receipts: [],
    paymentInstallments: [
      {
        id: "term",
        billingDocumentId: "bill",
        label: "Balance",
        currencyCode: "EUR",
        scheduledAmount: "30000",
        dueDate: null,
        isCancelled: false,
        receipts: [{ id: "cash", amount: "10000" }],
      },
    ],
  } as unknown as ClientBillingView;
  view = await mountForm(
    createElement(BillingScheduleManager, { canEdit: true, document }),
  );
  expect(view.container.textContent).toContain("Date needed · Partially paid");
  expect(view.container.querySelector("details")?.open).toBe(false);
  await clickText("Mark paid");
  expect(control("amount").value).toBe("20 000.00");
  expect(control("installmentId").value).toBe("term");
  expect(control("installmentId").tagName).toBe("INPUT");
  await enter("amount", "5000");
  await enter("reference", "Bank reference");
  await clickText("Save payment");
  expect(control("reference").value).toBe("Bank reference");
  expect(
    new FormData(control("reference").form ?? undefined).get("amount"),
  ).toBe("5000");
  expect(documentBody()).toContain("Review the entered amount");
});
const documentBody = () => globalThis.document.body.textContent ?? "";
