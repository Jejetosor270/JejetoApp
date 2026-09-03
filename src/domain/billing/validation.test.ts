import { describe, expect, it } from "vitest";

import {
  clientBillingInstallmentUpdateSchema,
  parseBillingDocumentEdit,
  parseClientBillingConfirmation,
} from "./validation";

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
  it.each([
    ["0", "0.000000"],
    ["15,5", "0.155000"],
    ["100%", "1.000000"],
  ])(
    "accepts the closed percentage interval for installment value %s",
    (input, expected) => {
      const result = clientBillingInstallmentUpdateSchema.parse({
        basis: "PERCENTAGE",
        billingDocumentId: clientId,
        dueDate: "2026-09-30",
        id: projectId,
        label: "Deposit",
        percentageRate: input,
        scheduledAmount: "9 999,99",
      });
      expect(result.percentageRate).toBe(expected);
      expect(result.scheduledAmount).toBe("9999.9900");
    },
  );

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

  it("accepts zero and one hundred as allocation percentage boundaries", () => {
    for (const [percentageRate, allocatedAmount] of [
      ["0.000000", "0"],
      ["1.000000", "100"],
    ] as const) {
      const form = baseForm();
      form.set(
        "allocations",
        JSON.stringify([
          {
            allocatedAmount,
            basis: "PERCENTAGE",
            orderId,
            percentageRate,
          },
        ]),
      );
      expect(parseClientBillingConfirmation(form).success).toBe(true);
    }
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

  it("keeps allocation issue paths specific during a full Billing edit", () => {
    const form = baseForm();
    form.set("id", "f12b6b9b-10e9-4e42-b93f-38796de4f65a");
    form.set(
      "allocations",
      JSON.stringify([
        {
          allocatedAmount: "40",
          basis: "PERCENTAGE",
          orderId,
          percentageRate: "",
        },
      ]),
    );
    const result = parseBillingDocumentEdit(form);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
      "allocations.0.percentageRate",
    );
  });
});
