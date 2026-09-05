// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
vi.mock("@/app/(app)/billing/actions", () => ({
  createClientBillingInstallmentAction: vi.fn(),
  recordClientReceiptAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./billing-installment-editor", () => ({
  BillingInstallmentEditor: () => null,
}));
vi.mock("./billing-receipt-editor", () => ({
  BillingReceiptEditor: () => null,
}));
import { BillingScheduleManager } from "./billing-schedule-manager";

describe("receipt proposal from authoritative installment outstanding", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  afterEach(async () => {
    await view?.unmount();
  });
  it("proposes outstanding, preserves overrides on unrelated edits, switches and supports Billing-level receipts", async () => {
    const document = {
      id: "bill",
      currencyCode: "EUR",
      project: { reportingCurrencyCode: "EUR" },
      totalTtc: "60000",
      paid: "10000",
      outstanding: "50000",
      dueDate: null,
      matchedInstallmentId: null,
      receipts: [],
      paymentInstallments: [
        {
          id: "first",
          billingDocumentId: "bill",
          label: "First",
          currencyCode: "EUR",
          scheduledAmount: "30000",
          dueDate: "2026-09-01",
          isCancelled: false,
          receipts: [],
        },
        {
          id: "second",
          billingDocumentId: "bill",
          label: "Second",
          currencyCode: "EUR",
          scheduledAmount: "30000",
          dueDate: "2026-09-02",
          isCancelled: false,
          receipts: [{ amount: "10000" }],
        },
      ],
    } as unknown as ClientBillingView;
    view = await mountForm(
      createElement(BillingScheduleManager, { canEdit: true, document }),
    );
    await clickText("Record receipt");
    expect(control("amount").value).toBe("");
    await enter("installmentId", "first");
    expect(control("amount").value).toBe("30 000.00");
    await enter("installmentId", "second");
    expect(control("amount").value).toBe("20 000.00");
    await enter("amount", "5000");
    await enter("reference", "Partial receipt");
    expect(
      new FormData(control("reference").form ?? undefined).get("amount"),
    ).toBe("5000");
    await enter("installmentId", "first");
    expect(control("amount").value).toBe("30 000.00");
    await enter("installmentId", "");
    expect(control("amount").value).toBe("");
    await enter("amount", "1000");
    expect(
      new FormData(control("reference").form ?? undefined).get("installmentId"),
    ).toBe("");
  });
});
