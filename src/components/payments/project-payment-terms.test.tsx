import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  supplier: vi.fn(),
  billing: vi.fn(),
  supplierEditor: vi.fn(),
  billingEditor: vi.fn(),
  currency: vi.fn(),
  project: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireUser: mock.user }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    currency: { findMany: mock.currency },
    project: { findUniqueOrThrow: mock.project },
  }),
}));
vi.mock("@/lib/payments/payments", () => ({
  getProjectPaymentSummaries: mock.supplier,
}));
vi.mock("@/lib/billing/billing", () => ({
  listProjectBillingDocuments: mock.billing,
}));
vi.mock("@/lib/reporting/project-diagnostics", () => ({
  projectRead: (_name: string, read: () => Promise<unknown>) => read(),
}));
vi.mock("./payment-schedule", () => ({
  PaymentSchedule: mock.supplierEditor,
}));
vi.mock("@/components/billing/billing-schedule-manager", () => ({
  BillingScheduleManager: mock.billingEditor,
}));
vi.mock("./related-cash-create", () => ({
  RelatedCashCreate: () => createElement("button", null, "Add term"),
}));

import { ProjectPaymentTerms } from "./project-payment-terms";

const invoice = {
  id: "invoice",
  reference: "INV-1",
  documentType: "INVOICE",
  workflowStatus: "INVOICED",
  status: "PARTIALLY_PAID",
  isCancelled: false,
  currencyCode: "EUR",
  outstanding: "80",
  dueDate: "2026-10-12",
  matchedInstallmentId: null,
  paymentInstallments: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ role: "MANAGER" });
  mock.currency.mockResolvedValue([{ code: "EUR" }]);
  mock.project.mockResolvedValue({ reportingCurrencyCode: "EUR" });
  mock.supplier.mockResolvedValue([]);
  mock.billing.mockResolvedValue([]);
  mock.supplierEditor.mockReturnValue(
    createElement("div", null, "Supplier editor"),
  );
  mock.billingEditor.mockReturnValue(
    createElement("div", null, "Billing editor"),
  );
});

it("shows outstanding TTC, status and next due while preserving the Supplier editor", async () => {
  const summary = { installments: [{}], reconciliationComplete: true };
  mock.supplier.mockResolvedValue([
    {
      order: {
        id: "order",
        orderNumber: "PO-1",
        status: "CONFIRMED",
        orderCurrencyCode: "EUR",
        supplierPayment: {
          status: "PARTIALLY_PAID",
          outstanding: "60",
          nextDueDate: "2026-10-12",
        },
      },
      summary,
    },
  ]);
  const html = renderToStaticMarkup(
    await ProjectPaymentTerms({ projectId: "project", canEdit: true }),
  );
  expect(html).toContain("Purchasing · PO-1 · 1 term");
  expect(html).toContain("Partially Paid");
  expect(html).toContain("Remaining TTC: 60.00 EUR");
  expect(html).toContain("Next due: 12/10/2026");
  expect(mock.supplierEditor.mock.calls[0]?.[0]).toMatchObject({
    summary,
    canEdit: true,
  });
});

it.each([
  ["DRAFT", "INVOICE", "Invoice plan", "DRAFT"],
  ["TO_BE_INVOICED", "INVOICE", "Invoice plan", "TO_BE_INVOICED"],
  ["INVOICED", "QUOTE", "Quote plan", "TO_BE_INVOICED"],
])(
  "keeps %s %s terms explicitly planned and null dates visible",
  async (workflowStatus, documentType, label, status) => {
    mock.billing.mockResolvedValue([
      { ...invoice, workflowStatus, documentType, status, dueDate: null },
    ]);
    const html = renderToStaticMarkup(
      await ProjectPaymentTerms({ projectId: "project", canEdit: false }),
    );
    expect(html).toContain(label);
    expect(html).toContain("Planned remainder TTC: 80.00 EUR");
    expect(html).toContain("Planned due: Date needed");
    expect(html).not.toContain("Add term");
    expect(mock.billingEditor.mock.calls[0]?.[0]).toMatchObject({
      canEdit: false,
    });
  },
);

it("shows collectible Invoice balances and retains matched-term deduplication", async () => {
  mock.billing.mockResolvedValue([
    { ...invoice, matchedInstallmentId: "matched" },
    {
      ...invoice,
      id: "quote",
      documentType: "QUOTE",
      paymentInstallments: [{ id: "matched" }, { id: "unmatched" }],
    },
  ]);
  const html = renderToStaticMarkup(
    await ProjectPaymentTerms({ projectId: "project", canEdit: true }),
  );
  expect(html).toContain("Remaining TTC: 80.00 EUR");
  expect(html).toContain("Next due: 12/10/2026");
  const quoteProps = mock.billingEditor.mock.calls.find(
    ([props]) => props.document.id === "quote",
  )?.[0];
  expect(quoteProps.document.paymentInstallments).toEqual([
    { id: "unmatched" },
  ]);
});

it("does not invent a missing next due date for a settled Invoice", async () => {
  mock.billing.mockResolvedValue([
    { ...invoice, status: "PAID", outstanding: "0.0000", dueDate: null },
  ]);
  const html = renderToStaticMarkup(
    await ProjectPaymentTerms({ projectId: "project", canEdit: false }),
  );
  expect(html).toContain("Remaining TTC: 0.00 EUR");
  expect(html).toContain("Next due: Not applicable");
  expect(html).not.toContain("Date needed");
});
