import { describe, expect, it } from "vitest";

import { parseQuoteConfirmation } from "@/domain/quote-intake/confirmation";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const supplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

function baseForm(): FormData {
  const form = new FormData();
  form.set("action", "CREATE");
  form.set("freightTreatment", "NOT_APPLICABLE");
  form.set("orderCurrencyCode", "EUR");
  form.set("orderNumber", "PO-QUOTE-1");
  form.set("originalFilename", "quote.pdf");
  form.set("packageName", "Reviewed quote");
  form.set("paymentCount", "0");
  form.set("projectId", projectId);
  form.set("supplierId", supplierId);
  return form;
}

describe("quote confirmation validation", () => {
  it("normalizes money, FX, VAT, and installment percentages exactly", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("applyPurchaseCost", "on");
    form.set("purchaseCost", "100000.12");
    form.set("purchaseFxRate", "0.8575123456");
    form.set("approveSchedule", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "PERCENTAGE");
    form.set("payment.0.dueDate", "2026-09-30");
    form.set("payment.0.label", "Deposit");
    form.set("payment.0.percentageRate", "30");

    const result = parseQuoteConfirmation(form);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.purchaseCost).toBe("100000.1200");
    expect(result.data.purchaseFxRate).toBe("0.8575123456");
    expect(result.data.payments[0]?.percentageRate).toBe("0.300000");
  });

  it("refuses to approve relative payment wording without an objective date", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("approveSchedule", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "PERCENTAGE");
    form.set("payment.0.label", "Balance before dispatch");
    form.set("payment.0.percentageRate", "70");
    form.set("payment.0.timingDescription", "Before dispatch");

    const result = parseQuoteConfirmation(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((item) => item.message)).toContain(
      "Every approved installment needs an objective due date.",
    );
  });
});
