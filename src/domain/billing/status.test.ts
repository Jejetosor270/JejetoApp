import { expect, it } from "vitest";
import { billingIsIssued, billingStatus } from "./status";
const invoice = {
  documentType: "INVOICE",
  isCancelled: false,
  totalTtc: "120.0001",
  paid: "0",
  dueDate: "2026-09-12",
  today: "2026-09-11",
};

it("keeps pre-invoice and cancelled states stable even after due dates", () => {
  for (const workflowStatus of [
    "DRAFT",
    "TO_BE_INVOICED",
    "CANCELLED",
  ] as const) {
    expect(
      billingStatus({ ...invoice, workflowStatus, dueDate: "2020-01-01" }),
    ).toBe(workflowStatus);
    expect(billingIsIssued({ isCancelled: false, workflowStatus })).toBe(false);
  }
});
it("derives paid and overdue precisely, retaining invoiced for partial payment", () => {
  expect(billingStatus({ ...invoice, paid: "120" })).toBe("INVOICED");
  expect(billingStatus({ ...invoice, paid: "120.0001" })).toBe("PAID");
  expect(billingStatus({ ...invoice, paid: "30", dueDate: "2026-09-10" })).toBe(
    "OVERDUE",
  );
  expect(
    billingStatus({ ...invoice, paid: "120.0001", dueDate: "2026-09-10" }),
  ).toBe("PAID");
  expect(billingStatus({ ...invoice, dueDate: null })).toBe("INVOICED");
  expect(billingStatus({ ...invoice, totalTtc: "0" })).toBe("INVOICED");
});
it("keeps Quotes planned and supports explicit overdue", () => {
  expect(billingStatus({ ...invoice, documentType: "QUOTE" })).toBe(
    "TO_BE_INVOICED",
  );
  expect(billingStatus({ ...invoice, workflowStatus: "OVERDUE" })).toBe(
    "OVERDUE",
  );
  expect(billingStatus({ ...invoice, isCancelled: true })).toBe("CANCELLED");
});
