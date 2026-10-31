import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  list: vi.fn(),
  project: vi.fn(),
  order: vi.fn(),
  control: vi.fn(),
  attention: vi.fn(),
  supplierTerms: vi.fn(),
  billing: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/assistant/search", () => ({
  searchAssistantRecords: mocks.search,
}));
vi.mock("@/lib/assistant/lists", () => ({ listAssistantRecords: mocks.list }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    project: { findUnique: mocks.project },
    procurementOrder: { findUnique: mocks.order },
  }),
}));
vi.mock("@/lib/reporting/project-control", () => ({
  getProjectControl: mocks.control,
}));
vi.mock("@/lib/reporting/financial-attention", () => ({
  getFinancialAttention: mocks.attention,
}));
vi.mock("@/lib/payments/payments", () => ({
  getOrderPaymentSummary: mocks.supplierTerms,
}));
vi.mock("@/lib/billing/billing", () => ({
  getClientBillingDocument: mocks.billing,
}));

import { erpReadTools, runReadTool } from "./tools";
import { emptyAssistantFilters } from "@/domain/assistant/lists";
import {
  projectMetricKeys,
  type ProjectDashboard,
  type ProjectMetric,
} from "@/domain/finance/project-dashboard";
import { projectCashOutlook } from "@/domain/finance/project-cash-outlook";

const id = "00000000-0000-4000-8000-000000000001";
const actor = { id, role: "ADMIN" as const };
const metric = (value: string | null): ProjectMetric => ({
  value,
  rows: [],
  help: "Canonical metric explanation.",
});

function dashboard(): ProjectDashboard {
  return {
    metrics: Object.fromEntries(
      projectMetricKeys.map((key) => [key, metric("0.0000")]),
    ) as ProjectDashboard["metrics"],
    markupRate: "0.150000",
    expectedMarkupRate: null,
    alerts: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  mocks.project.mockResolvedValue({
    id,
    name: "Fictional Villa",
    status: "ACTIVE",
  });
});
afterEach(() => vi.useRealTimers());

describe("ERP connection read-only tool boundary", () => {
  it("publishes exactly seven bounded read tools with JSON-compatible input schemas", () => {
    expect(erpReadTools.map((tool) => tool.name)).toEqual([
      "search_records",
      "list_records",
      "get_project_financials",
      "get_payment_terms",
      "get_cash_forecast",
      "get_financial_attention",
      "get_workflow_help",
    ]);
    for (const tool of erpReadTools) {
      expect(z.toJSONSchema(tool.inputSchema)).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it.each([
    ["search_records", { query: "" }],
    ["search_records", { query: "Villa", sql: "SELECT anything" }],
    ["get_project_financials", { projectId: "../private" }],
    ["get_project_financials", { projectId: id, amount: "12345" }],
    ["get_payment_terms", { id, kind: "Employee" }],
    ["get_payment_terms", { id, kind: "Order", page: 0 }],
    ["get_cash_forecast", { projectId: id, horizonDays: 365 }],
    ["get_financial_attention", { horizonDays: 30 }],
    ["list_records", { kind: "Order", dateFrom: "2026-02-30" }],
    [
      "list_records",
      { kind: "Order", dateFrom: "2026-11-01", dateTo: "2026-10-01" },
    ],
    ["get_workflow_help", { topic: "private_credentials" }],
  ])("rejects invalid %s input before loading records", async (name, args) => {
    await expect(runReadTool(actor, name, args)).rejects.toMatchObject({
      code: "INVALID",
    });
    for (const read of Object.values(mocks))
      expect(read).not.toHaveBeenCalled();
  });

  it("rejects unknown and write tool names without echoing input", async () => {
    await expect(
      runReadTool(actor, "record_payment", {
        amount: "100",
        privateText: "do not echo",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN_TOOL",
      message: "This read-only tool is not available.",
    });
    for (const read of Object.values(mocks))
      expect(read).not.toHaveBeenCalled();
  });

  it("retains fuzzy-search confirmation and bounded result metadata", async () => {
    const result = {
      results: [
        {
          id,
          label: "Villas Bled",
          href: `/projects/${id}`,
          type: "Project",
          context: "Example",
        },
      ],
      truncated: false,
      requiresConfirmation: true,
    };
    mocks.search.mockResolvedValue(result);
    expect(
      await runReadTool(actor, "search_records", {
        query: "villa bled",
        kind: "Project",
      }),
    ).toEqual({
      readOnly: true,
      asOf: "2026-10-31T12:00:00.000Z",
      businessDate: "2026-10-31",
      data: result,
    });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith(
      "villa bled",
      "Project",
    );
  });

  it("delegates validated filters and pagination without broadening the requested scope", async () => {
    const result = {
      results: [],
      listing: { total: 51, page: 3, hasNext: false, hasPrevious: true },
      truncated: true,
    };
    mocks.list.mockResolvedValue(result);
    const reply = await runReadTool(actor, "list_records", {
      kind: "Order",
      supplier: "Example Supplier",
      projectId: id,
      paymentStatus: "UNPAID",
      page: 3,
    });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      query: {
        ...emptyAssistantFilters,
        kind: "Order",
        query: "",
        projectId: id,
        supplierId: null,
        clientId: null,
        supplier: "Example Supplier",
        paymentStatus: "UNPAID",
      },
      page: 3,
    });
    expect(reply.data).toEqual(result);
  });

  it("preserves list clarification instead of fabricating an empty exact count", async () => {
    mocks.list.mockResolvedValue({
      message: "Narrow the scope before applying payment filters.",
      results: [],
      truncated: false,
    });
    const reply = await runReadTool(actor, "list_records", {
      kind: "Order",
      paymentStatus: "UNPAID",
    });
    expect(reply.data).not.toHaveProperty("listing");
    expect(reply.data).toMatchObject({
      message: expect.stringContaining("Narrow the scope"),
    });
  });

  it("normalizes omitted relationship scopes to the canonical nullable query contract", async () => {
    mocks.list.mockResolvedValue({ results: [], truncated: false });
    await runReadTool(actor, "list_records", { kind: "Supplier" });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      query: {
        ...emptyAssistantFilters,
        kind: "Supplier",
        query: "",
        projectId: null,
        supplierId: null,
        clientId: null,
      },
      page: 1,
    });
  });

  it("does not load financials or attention for an invisible/trashed Project", async () => {
    mocks.project.mockResolvedValue(null);
    for (const name of [
      "get_project_financials",
      "get_cash_forecast",
      "get_financial_attention",
    ]) {
      await expect(
        runReadTool(actor, name, { projectId: id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(mocks.control).not.toHaveBeenCalled();
    expect(mocks.attention).not.toHaveBeenCalled();
  });

  it("returns exact authoritative metric strings, null completeness and bounded evidence", async () => {
    const data = dashboard();
    data.metrics.cost = {
      value: "123456.7812",
      help: "Total economic cost.",
      rows: Array.from({ length: 15 }, (_, index) => ({
        label: `Order ${index}`,
        href: `/orders/${index}`,
        amount: "1.0000",
      })),
    };
    data.metrics.cash = {
      value: null,
      help: "Actual net cash; required FX is missing.",
      rows: [{ label: "Missing FX", href: "/receipts/missing", amount: null }],
    };
    mocks.control.mockResolvedValue({ currency: "CHF", dashboard: data });
    const reply = await runReadTool(actor, "get_project_financials", {
      projectId: id,
    });
    expect(reply.data).toMatchObject({
      currency: "CHF",
      markupRate: "0.150000",
      rateUnit: "fraction",
      sourceCount: 16,
      sourcesTruncated: true,
      metrics: expect.arrayContaining([
        {
          key: "cost",
          amount: "123456.7812",
          complete: true,
          explanation: "Total economic cost.",
          href: `/projects/${id}`,
        },
        {
          key: "cash",
          amount: null,
          complete: false,
          explanation: "Actual net cash; required FX is missing.",
          href: `/projects/${id}`,
        },
      ]),
      sources: expect.arrayContaining([
        {
          label: "Missing FX",
          href: "/receipts/missing",
          note: expect.stringContaining("Incomplete"),
        },
      ]),
    });
    expect(reply.data).toHaveProperty("sources.length", 10);
    expect(mocks.control).toHaveBeenCalledExactlyOnceWith(id);
  });

  it("distinguishes a zero-cost undefined markup from missing financial inputs", async () => {
    const data = dashboard();
    data.markupRate = null;
    data.metrics.expectedCost.value = null;
    data.metrics.expectedProfit.value = null;
    mocks.control.mockResolvedValue({ currency: "EUR", dashboard: data });
    expect(
      (await runReadTool(actor, "get_project_financials", { projectId: id }))
        .data,
    ).toMatchObject({
      markupRate: null,
      markupStatus: "not_applicable",
      expectedMarkupRate: null,
      expectedMarkupStatus: "incomplete",
    });
  });

  it("keeps issued/planned/undated cash separate and never fabricates a projected balance", async () => {
    const outlook = projectCashOutlook(
      [
        {
          kind: "issued",
          currency: "EUR",
          total: "100",
          paid: "0",
          fx: null,
          terms: [
            {
              amount: "100",
              paid: "0",
              fx: null,
              due: "2026-11-02",
              cancelled: false,
            },
          ],
        },
        {
          kind: "planned",
          currency: "EUR",
          total: "900",
          paid: "0",
          fx: null,
          terms: [
            {
              amount: "900",
              paid: "0",
              fx: null,
              due: "2026-11-02",
              cancelled: false,
            },
          ],
        },
        {
          kind: "payment",
          currency: "USD",
          total: "50",
          paid: "0",
          fx: null,
          terms: [],
        },
      ],
      "EUR",
      "2026-10-31",
      "200",
    );
    mocks.control.mockResolvedValue({ currency: "EUR", cashOutlook: outlook });
    const reply = await runReadTool(actor, "get_cash_forecast", {
      projectId: id,
      horizonDays: 7,
    });
    expect(reply.data).toMatchObject({
      basis: "TTC",
      currency: "EUR",
      window: {
        days: 7,
        expectedIn: "100.0000",
        plannedIn: "900.0000",
        projectedCash: null,
      },
      gaps: { undatedCount: 1, missingFxCount: 1, unscheduledCount: 1 },
      allRemaining: {
        issuedIn: "100.0000",
        plannedIn: "900.0000",
        paymentsOut: null,
      },
      sources: { total: 3, page: 1, hasNext: false },
    });
  });

  it("paginates scoped attention and preserves archived Project scope without exposing internal fingerprints", async () => {
    mocks.project.mockResolvedValue({
      id,
      name: "Fictional Villa",
      status: "ARCHIVED",
    });
    mocks.attention.mockResolvedValue({
      issues: Array.from({ length: 26 }, (_, index) => ({
        key: `due:${index}`,
        title: "Payment due",
        detail: "Review payment.",
        href: `/orders/${index}`,
        priority: "Upcoming",
        reference: `PO-${index}`,
        amount: "12.3456",
        currency: "EUR",
        basis: "TTC",
        date: "2026-11-01",
        fingerprint: "internal",
      })),
    });
    const reply = await runReadTool(actor, "get_financial_attention", {
      projectId: id,
      horizonDays: 90,
      page: 2,
    });
    expect(mocks.attention).toHaveBeenCalledExactlyOnceWith(
      90,
      "2026-10-31",
      id,
      "archived",
    );
    expect(reply.data).toMatchObject({
      includesSnoozed: true,
      issues: {
        total: 26,
        pageSize: 25,
        page: 2,
        hasNext: false,
        hasPrevious: true,
        items: [{ key: "due:25", amount: "12.3456" }],
      },
    });
    expect(JSON.stringify(reply)).not.toContain("fingerprint");
  });

  it("keeps financial service failures as errors, never zero-filled results", async () => {
    mocks.control.mockRejectedValue(new Error("Temporary unavailable"));
    await expect(
      runReadTool(actor, "get_project_financials", { projectId: id }),
    ).rejects.toThrow("Temporary unavailable");
  });
});

describe("ERP payment term read projection", () => {
  it("exposes only Supplier terms on Orders and strips cash notes, references and edit tokens", async () => {
    mocks.order.mockResolvedValue({
      id,
      orderNumber: "PO-1",
      status: "ORDERED",
    });
    mocks.supplierTerms.mockResolvedValue({
      client: { installments: [{ label: "Legacy client plan" }] },
      supplier: {
        baseCurrencyCode: "EUR",
        baseAmount: "100.0000",
        scheduled: "100.0000",
        paid: "25.0000",
        remainingTotal: "75.0000",
        unscheduled: "0",
        overallocated: "0",
        reconciliationComplete: true,
        installments: [
          {
            id,
            label: "Deposit",
            currencyCode: "EUR",
            scheduledAmount: "100.0000",
            paidAmount: "25.0000",
            outstandingAmount: "75.0000",
            status: "PARTIALLY_PAID",
            isCancelled: false,
            dueDate: null,
            expectedFxRate: null,
            percentageRate: "1",
            basis: "PERCENTAGE",
            settlements: [{ notes: "Private cash note" }],
            notes: "Private term note",
            editVersion: "internal version",
          },
        ],
      },
    });
    const reply = await runReadTool(actor, "get_payment_terms", {
      kind: "Order",
      id,
    });
    expect(reply.data).toMatchObject({
      direction: "CASH_OUT",
      basis: "TTC",
      terms: {
        items: [
          {
            amount: "100.0000",
            paid: "25.0000",
            remaining: "75.0000",
            dueDate: null,
            cashRecordCount: 1,
          },
        ],
      },
    });
    expect(JSON.stringify(reply)).not.toMatch(/Private|Legacy|editVersion/);
  });

  it("distinguishes invoice coverage from actually paid term cash", async () => {
    mocks.billing.mockResolvedValue({
      id,
      reference: "INV-1",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      isCancelled: false,
      currencyCode: "EUR",
      paid: "1000",
      outstanding: "0",
      paymentInstallments: [
        {
          id,
          label: "Balance",
          scheduledAmount: "1000",
          currencyCode: "EUR",
          dueDate: "2026-10-01",
          isCancelled: false,
          receipts: [],
          creditOutstandingAmount: "0",
          balanceReviewRequired: false,
          percentageRate: "1",
          basis: "PERCENTAGE",
        },
      ],
    });
    const reply = await runReadTool(actor, "get_payment_terms", {
      kind: "Billing",
      id,
    });
    expect(reply.data).toMatchObject({
      direction: "CASH_IN",
      issued: true,
      paid: "1000",
      terms: {
        items: [
          {
            paid: "0",
            remaining: "0",
            invoiceCoverage: "1000",
            status: "Covered at invoice level",
          },
        ],
      },
    });
  });

  it("does not present Quote terms as issued Client receivables", async () => {
    mocks.billing.mockResolvedValue({
      id,
      reference: "Q-1",
      documentType: "QUOTE",
      workflowStatus: "DRAFT",
      isCancelled: false,
      currencyCode: "EUR",
      paid: "0",
      outstanding: "1000",
      paymentInstallments: [],
    });
    expect(
      (await runReadTool(actor, "get_payment_terms", { kind: "Billing", id }))
        .data,
    ).toMatchObject({ documentType: "QUOTE", issued: false });
  });

  it("returns safe not-found errors instead of loading absent Orders", async () => {
    mocks.order.mockResolvedValue(null);
    mocks.billing.mockResolvedValue(null);
    for (const kind of ["Order", "Billing"]) {
      await expect(
        runReadTool(actor, "get_payment_terms", { kind, id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(mocks.supplierTerms).not.toHaveBeenCalled();
  });

  it("returns role-aware guidance without AI calls or write capabilities", async () => {
    const reply = await runReadTool(
      { ...actor, role: "USER" },
      "get_workflow_help",
      { topic: "mark_paid" },
    );
    expect(JSON.stringify(reply)).toContain("Ask an ADMIN or MANAGER");
    expect(JSON.stringify(reply)).toContain("confirmation drawer");
    for (const read of Object.values(mocks))
      expect(read).not.toHaveBeenCalled();
  });
});
