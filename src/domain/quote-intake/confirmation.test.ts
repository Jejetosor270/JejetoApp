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
  form.set("paymentCount", "0");
  form.set("projectId", projectId);
  form.set("supplierId", supplierId);
  return form;
}

describe("quote confirmation validation", () => {
  it("requires only the visible core fields needed for a new Order", () => {
    const missing = baseForm();
    missing.delete("orderNumber");
    const invalid = parseQuoteConfirmation(missing);
    expect(invalid.success).toBe(false);
    if (invalid.success) return;
    expect(invalid.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["orderNumber", "orderCurrencyCode"]),
    );

    const missingSupplier = baseForm();
    missingSupplier.set("applyCurrency", "on");
    missingSupplier.delete("supplierId");
    const invalidSupplier = parseQuoteConfirmation(missingSupplier);
    expect(invalidSupplier.success).toBe(false);
    if (invalidSupplier.success) return;
    expect(invalidSupplier.error.issues[0]?.path).toEqual(["supplierId"]);

    const valid = baseForm();
    valid.set("applyCurrency", "on");
    expect(parseQuoteConfirmation(valid).success).toBe(true);
  });

  it("normalizes money, FX, VAT, and installment percentages exactly", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("applyPurchaseCost", "on");
    form.set("purchaseCost", "100000.12");
    form.set("purchaseFxRate", "0.8575123456");
    form.set("approveSchedule", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "PERCENTAGE");
    form.set("payment.0.dueDate", "30/09/2026");
    form.set("payment.0.label", "Deposit");
    form.set("payment.0.percentageRate", "30");

    const result = parseQuoteConfirmation(form);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.purchaseCost).toBe("100000.1200");
    expect(result.data.purchaseFxRate).toBe("0.8575123456");
    expect(result.data.payments[0]?.percentageRate).toBe("0.300000");
    expect(result.data.payments[0]?.dueDate).toBe("2026-09-30");
  });

  it("accepts strict European quote dates and rejects reversed input", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("applyQuoteDate", "on");
    form.set("quoteDate", "05/09/2026");
    const valid = parseQuoteConfirmation(form);
    expect(valid.success).toBe(true);
    if (!valid.success) return;
    expect(valid.data.quoteDate).toBe("2026-09-05");

    form.set("quoteDate", "09/29/2026");
    const invalid = parseQuoteConfirmation(form);
    expect(invalid.success).toBe(false);
    if (invalid.success) return;
    expect(invalid.error.issues[0]?.message).toBe(
      "Enter a valid date as DD/MM/YYYY.",
    );
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

  it("ignores an unfinished payment draft until the employee approves it", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "PERCENTAGE");
    form.set("payment.0.label", "");
    form.set("payment.0.percentageRate", "");

    const unapproved = parseQuoteConfirmation(form);
    expect(unapproved.success).toBe(true);
    if (!unapproved.success) return;
    expect(unapproved.data.payments).toEqual([]);

    form.set("approveSchedule", "on");
    const approved = parseQuoteConfirmation(form);
    expect(approved.success).toBe(false);
  });

  it("requires the note displayed for a custom INPUT VAT treatment", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("applyInputVat", "on");
    form.set("inputVatAmount", "20");
    form.set("inputVatRecoverability", "RECOVERABLE");
    form.set("inputVatTaxableBase", "100");
    form.set("inputVatTreatment", "CUSTOM");

    const missingNote = parseQuoteConfirmation(form);
    expect(missingNote.success).toBe(false);
    if (missingNote.success) return;
    expect(
      missingNote.error.issues.map((issue) => issue.path.join(".")),
    ).toContain("inputVatCustomTreatmentNote");

    form.set("inputVatCustomTreatmentNote", "Reviewed management treatment");
    expect(parseQuoteConfirmation(form).success).toBe(true);
  });

  it("validates an optional existing Client Billing link during quote review", () => {
    const form = baseForm();
    form.set("applyCurrency", "on");
    form.set("billingDocumentId", "c12b6b9b-10e9-4e42-b93f-38796de4f65a");
    form.set("billingAllocationBasis", "PERCENTAGE");
    form.set("billingAllocatedAmount", "40000");
    form.set("billingPercentageRate", "40");
    form.set("billingRemainderApproved", "on");
    const result = parseQuoteConfirmation(form);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.billingPercentageRate).toBe("0.400000");
    expect(result.data.billingAllocatedAmount).toBe("40000.0000");
    expect(result.data.billingRemainderApproved).toBe(true);
  });
});
