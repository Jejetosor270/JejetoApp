import { describe, expect, it } from "vitest";

import { parseClientBillingConfirmation } from "./validation";

const clientId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const projectId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";

function baseForm() {
  const form = new FormData();
  form.set("action", "CREATE");
  form.set("allocations", "[]");
  form.set("clientId", clientId);
  form.set("currencyCode", "EUR");
  form.set("documentDate", "2026-09-01");
  form.set("documentType", "INVOICE");
  form.set("duplicateWarning", "false");
  form.set("installments", "[]");
  form.set("model", "mock-model");
  form.set("originalFilename", "invoice.pdf");
  form.set("projectId", projectId);
  form.set("provider", "mock");
  form.set("reference", "INV-1");
  form.set("totalHt", "100");
  form.set("vatAmount", "20");
  form.set("totalTtc", "120");
  return form;
}

describe("Client billing confirmation", () => {
  it("normalizes reviewed monetary, VAT, schedule and allocation values", () => {
    const form = baseForm();
    form.set("vatRate", "0.20");
    form.set(
      "installments",
      JSON.stringify([
        {
          basis: "PERCENTAGE",
          dueDate: "2026-09-30",
          label: "Deposit",
          percentageRate: "0.30",
        },
      ]),
    );
    form.set(
      "allocations",
      JSON.stringify([
        {
          allocatedAmount: "60",
          basis: "FIXED_AMOUNT",
          orderId,
        },
      ]),
    );
    const result = parseClientBillingConfirmation(form);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalHt).toBe("100.0000");
    expect(result.data.vatRate).toBe("0.200000");
    expect(result.data.installments[0]?.percentageRate).toBe("0.300000");
  });

  it("rejects inconsistent HT, VAT and TTC", () => {
    const form = baseForm();
    form.set("totalTtc", "119");
    const result = parseClientBillingConfirmation(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
      "totalTtc",
    );
  });

  it("requires explicit identity for an update", () => {
    const form = baseForm();
    form.set("action", "UPDATE");
    expect(parseClientBillingConfirmation(form).success).toBe(false);
  });

  it("normalizes blank optional billing links to null", () => {
    const form = baseForm();
    form.set("existingDocumentId", "");
    form.set("matchedInstallmentId", "");
    const result = parseClientBillingConfirmation(form);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.existingDocumentId).toBeNull();
    expect(result.data.matchedInstallmentId).toBeNull();
  });

  it("returns a friendly error for a non-empty invalid Order ID", () => {
    const form = baseForm();
    form.set(
      "allocations",
      JSON.stringify([
        { allocatedAmount: "10", basis: "FIXED_AMOUNT", orderId: "none" },
      ]),
    );
    const result = parseClientBillingConfirmation(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("Select a valid Order.");
  });
});
