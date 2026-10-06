import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orders: vi.fn(),
  billing: vi.fn(),
  projects: vi.fn(),
  clients: vi.fn(),
  suppliers: vi.fn(),
  search: vi.fn(),
  project: vi.fn(),
  supplier: vi.fn(),
  client: vi.fn(),
  getDatabase: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/procurement/orders", () => ({ listOrdersPage: mocks.orders }));
vi.mock("@/lib/billing/billing", () => ({
  listClientBillingPage: mocks.billing,
}));
vi.mock("@/lib/master-data/projects", () => ({ listProjects: mocks.projects }));
vi.mock("@/lib/master-data/clients", () => ({ listClients: mocks.clients }));
vi.mock("@/lib/master-data/suppliers", () => ({
  listSuppliers: mocks.suppliers,
}));
vi.mock("@/lib/assistant/search", () => ({
  searchAssistantRecords: mocks.search,
}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.getDatabase }));

import { listAssistantRecords } from "./lists";
import {
  emptyAssistantFilters,
  type AssistantListQuery,
} from "@/domain/assistant/lists";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const base: AssistantListQuery = {
  ...emptyAssistantFilters,
  kind: "Order",
  query: "",
  projectId: null,
  supplierId: null,
  clientId: null,
};
function list(overrides: Partial<AssistantListQuery> = {}, page = 1) {
  return listAssistantRecords({ query: { ...base, ...overrides }, page });
}
function order(overrides: Record<string, unknown> = {}) {
  return {
    id,
    orderNumber: "PO-1",
    status: "ORDERED",
    project: { name: "Villa" },
    supplier: { displayName: "Example Supplier" },
    shortDescription: "Furniture",
    packageName: "Legacy",
    orderDate: "2026-10-01",
    invoiceDate: "2026-10-02",
    supplierPayment: {
      status: "SCHEDULED",
      outstanding: "100.00",
      nextDueDate: "2026-10-08",
      paidAt: null,
    },
    ...overrides,
  };
}
function billing(overrides: Record<string, unknown> = {}) {
  return {
    id,
    reference: "INV-1",
    status: "INVOICED",
    workflowStatus: "INVOICED",
    isCancelled: false,
    documentType: "INVOICE",
    project: { name: "Villa" },
    client: { displayName: "Example Client" },
    shortDescription: "Furniture",
    documentDate: "2026-10-01",
    dueDate: "2026-10-08",
    outstanding: "100.00",
    paidAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const reader of [
    mocks.orders,
    mocks.billing,
    mocks.projects,
    mocks.clients,
    mocks.suppliers,
  ])
    reader.mockResolvedValue({ items: [], total: 0 });
  mocks.search.mockResolvedValue({ results: [], truncated: false });
  mocks.project.mockResolvedValue({ name: "Villa" });
  mocks.supplier.mockResolvedValue({ displayName: "Example Supplier" });
  mocks.client.mockResolvedValue({ displayName: "Example Client" });
  mocks.getDatabase.mockReturnValue({
    project: { findUnique: mocks.project },
    supplier: { findUnique: mocks.supplier },
    client: { findUnique: mocks.client },
  });
});

describe("JejetoBot lists", () => {
  it.each([102, 100])(
    "rejects a derived scope whose total changes to %s during paging",
    async (changedTotal) => {
      mocks.billing
        .mockResolvedValueOnce({
          items: Array.from({ length: 100 }, (_, index) =>
            billing({ id: `billing-${index}` }),
          ),
          total: 101,
        })
        .mockResolvedValueOnce({
          items: [billing({ id: "billing-100" })],
          total: changedTotal,
        });
      const response = await list({ kind: "Billing", status: "ISSUED" });
      expect(response.message).toContain("Records changed while loading");
      expect(response.results).toEqual([]);
      expect(response.listing).toBeUndefined();
    },
  );

  it.each(["duplicate", "missing"] as const)(
    "rejects %s rows rather than returning an incomplete exact count",
    async (condition) => {
      mocks.orders
        .mockResolvedValueOnce({
          items: Array.from({ length: 100 }, (_, index) =>
            order({ id: `order-${index}` }),
          ),
          total: 101,
        })
        .mockResolvedValueOnce({
          items: condition === "duplicate" ? [order({ id: "order-0" })] : [],
          total: 101,
        });
      const response = await list({ paymentStatus: "UNPAID" });
      expect(response.message).toContain("Please retry or narrow");
      expect(response.results).toEqual([]);
      expect(response.listing).toBeUndefined();
    },
  );

  it("reads at most five native pages at the derived cap", async () => {
    mocks.orders.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({
        items: Array.from({ length: 100 }, (_, index) =>
          order({ id: `order-${(page - 1) * 100 + index}` }),
        ),
        total: 500,
      }),
    );
    const response = await list({ paymentStatus: "UNPAID" });
    expect(mocks.orders).toHaveBeenCalledTimes(5);
    expect(response.listing?.total).toBe(500);
    expect(response.results).toHaveLength(25);
    expect(response.truncated).toBe(true);
  });

  it("does not continue evaluating a scope that grows beyond the cap", async () => {
    mocks.billing
      .mockResolvedValueOnce({ items: [billing()], total: 101 })
      .mockResolvedValueOnce({ items: [billing()], total: 501 });
    const response = await list({ kind: "Billing", status: "OVERDUE" });
    expect(response.message).toContain("exceeds 500 records");
    expect(response.listing).toBeUndefined();
    expect(mocks.billing).toHaveBeenCalledTimes(2);
  });
  it("issued Billing includes all cash statuses but excludes plans, Quotes and cancellations", async () => {
    mocks.billing.mockResolvedValue({
      items: [
        ...["INVOICED", "PAID", "PARTIALLY_PAID", "OVERDUE"].map((status) =>
          billing({ id: status, status }),
        ),
        billing({ id: "draft", workflowStatus: "DRAFT", status: "DRAFT" }),
        billing({
          id: "plan",
          workflowStatus: "TO_BE_INVOICED",
          status: "TO_BE_INVOICED",
        }),
        billing({ id: "quote", documentType: "QUOTE" }),
        billing({ id: "cancelled", isCancelled: true }),
      ],
      total: 8,
    });
    const response = await list({ kind: "Billing", status: "ISSUED" });
    expect(response.results.map((record) => record.id)).toEqual([
      "INVOICED",
      "PAID",
      "PARTIALLY_PAID",
      "OVERDUE",
    ]);
    expect(response.listing?.total).toBe(4);
    expect(response.listing?.filters).toContain("Issued Invoices");
    expect(response.moreHref).toBeNull();
  });
  it("uses native Order paging and exact total with no financial data in replies", async () => {
    mocks.orders.mockResolvedValue({ items: [order()], total: 30 });
    const response = await list({ supplierId: id }, 2);
    expect(mocks.orders).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: id,
        page: 2,
        pageSize: 25,
        sort: "updated",
        direction: "desc",
      }),
    );
    expect(response.listing).toMatchObject({
      page: 2,
      total: 30,
      hasNext: false,
      hasPrevious: true,
    });
    expect(response.results[0]).toEqual({
      id,
      type: "Order",
      label: "PO-1",
      href: `/orders/${id}`,
      context:
        "Villa · Example Supplier · Furniture · Delivery: Ordered · Payment: Unpaid · Due: 08/10/2026",
    });
    expect(response.listing?.query.supplier).toBeNull();
    expect(response.listing?.filters).toContain("Supplier: Example Supplier");
    expect(response.moreHref).toContain(`supplierId=${id}`);
    expect(JSON.stringify(response)).not.toContain("100.00");
  });

  it("reuses Billing summaries and presents authoritative status/date", async () => {
    mocks.billing.mockResolvedValue({ items: [billing()], total: 1 });
    const response = await list({
      kind: "Billing",
      documentType: "INVOICE",
      clientId: id,
    });
    expect(mocks.billing).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: id,
        documentType: "INVOICE",
        pageSize: 25,
      }),
    );
    expect(response.results[0]?.context).toContain(
      "Invoice · Invoiced · Date: 01/10/2026",
    );
    expect(response.moreHref).toContain("documentType=INVOICE");
  });

  it("supports Project status and Client scope", async () => {
    mocks.projects.mockResolvedValue({
      items: [
        {
          id,
          name: "Villa",
          code: "V01",
          status: "ACTIVE",
          client: { displayName: "Client" },
        },
      ],
      total: 1,
    });
    const response = await list({
      kind: "Project",
      clientId: id,
      status: "ACTIVE",
    });
    expect(mocks.projects).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: id,
        status: "ACTIVE",
        sort: "name",
        pageSize: 25,
      }),
    );
    expect(response.results[0]?.href).toBe(`/projects/${id}`);
    expect(response.results[0]?.context).toBe("V01 · Client · Active");
  });

  it.each(["Client", "Supplier"] as const)(
    "defaults %s to active and supports inactive lists",
    async (kind) => {
      const reader = kind === "Client" ? mocks.clients : mocks.suppliers;
      reader.mockResolvedValue({
        items: [
          {
            id,
            displayName: "Example",
            legalName: "Example Ltd",
            isActive: true,
          },
        ],
        total: 1,
      });
      const response = await list({ kind });
      expect(reader).toHaveBeenCalledWith(
        expect.objectContaining({
          active: "active",
          pageSize: 25,
          sort: "name",
          direction: "asc",
        }),
      );
      expect(response.moreHref).toContain("active=active");
      expect(response.listing?.query.active).toBe("active");
      await list({ kind, active: "inactive" });
      expect(reader).toHaveBeenLastCalledWith(
        expect.objectContaining({ active: "inactive" }),
      );
    },
  );

  it("resolves one named relationship and revalidates its visible ID", async () => {
    mocks.search.mockResolvedValue({
      results: [
        { id, label: "Canonical Supplier", context: "Ltd", type: "Supplier" },
      ],
      truncated: false,
    });
    const response = await list({ supplier: "example" });
    expect(mocks.search).toHaveBeenCalledWith("example", "Supplier");
    expect(mocks.supplier).toHaveBeenCalledWith({
      where: { id },
      select: { displayName: true },
    });
    expect(mocks.orders).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: id }),
    );
    expect(response.listing?.query.supplier).toBe("example");
  });

  it("asks for an explicit choice on ambiguous names, preserving original query", async () => {
    mocks.search.mockResolvedValue({
      results: [
        { id, label: "Example", context: "A" },
        { id: otherId, label: "Example", context: "B" },
      ],
      truncated: false,
    });
    const response = await list({ supplier: "Example" });
    expect(response.clarification).toMatchObject({
      query: { supplier: "Example", supplierId: null },
      choices: [
        { field: "supplierId", id, label: "Example", context: "A" },
        { field: "supplierId", id: otherId, label: "Example", context: "B" },
      ],
    });
    expect(response.listing).toBeUndefined();
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("does not broaden missing names or removed IDs", async () => {
    expect((await list({ project: "Missing" })).message).toContain(
      "No matching Project",
    );
    mocks.project.mockResolvedValue(null);
    expect((await list({ projectId: id })).message).toContain(
      "no longer available",
    );
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("asks before using a unique typo suggestion as a Project filter", async () => {
    mocks.search.mockResolvedValue({
      results: [{ id, label: "Villas Bled", context: "BLD", type: "Project" }],
      truncated: false,
      requiresConfirmation: true,
    });
    const response = await list({ project: "Vilas Beld" });
    expect(response.clarification).toMatchObject({
      query: { project: "Vilas Beld", projectId: null },
      choices: [{ field: "projectId", id, label: "Villas Bled" }],
    });
    expect(response.message).toContain("close Project names");
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("does not claim no match when the fuzzy catalog scan was incomplete", async () => {
    mocks.search.mockResolvedValue({ results: [], truncated: true });
    expect((await list({ project: "Vilas Beld" })).message).toContain(
      "search is incomplete",
    );
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("never equates delivery PAID with actual payment PAID", async () => {
    mocks.orders.mockResolvedValue({
      items: [
        order({ status: "PAID" }),
        order({
          id: otherId,
          status: "ORDERED",
          supplierPayment: {
            status: "PAID",
            outstanding: "0",
            nextDueDate: null,
            paidAt: "2026-10-05",
          },
        }),
      ],
      total: 2,
    });
    const response = await list({ paymentStatus: "PAID" });
    expect(response.results.map((row) => row.id)).toEqual([otherId]);
    expect(mocks.orders).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, pageSize: 100 }),
    );
    expect(response.moreHref).toBeNull();
  });

  it("unpaid Billing includes partial and overdue issued Invoices, excluding plans/Quotes/settled", async () => {
    mocks.billing.mockResolvedValue({
      items: [
        billing(),
        billing({ id: "partial", status: "PARTIALLY_PAID" }),
        billing({ id: "overdue", status: "OVERDUE" }),
        billing({
          id: "plan",
          workflowStatus: "TO_BE_INVOICED",
          status: "TO_BE_INVOICED",
        }),
        billing({ id: "quote", documentType: "QUOTE" }),
        billing({ id: "paid", status: "PAID", outstanding: "0" }),
        billing({ id: "cancelled", isCancelled: true }),
        billing({ id: "credited", outstanding: "0" }),
      ],
      total: 8,
    });
    const response = await list({ kind: "Billing", paymentStatus: "UNPAID" });
    expect(response.results.map((row) => row.id)).toEqual([
      id,
      "partial",
      "overdue",
    ]);
    expect(response.listing?.total).toBe(3);
    expect(response.moreHref).toBeNull();
  });

  it("filters the full bounded scope before counting and paging", async () => {
    const rows = Array.from({ length: 130 }, (_, index) =>
      billing({
        id: `billing-${index}`,
        status: index >= 99 ? "OVERDUE" : "PAID",
      }),
    );
    mocks.billing.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve({
        items: rows.slice((page - 1) * 100, page * 100),
        total: rows.length,
      }),
    );
    const response = await list({ kind: "Billing", status: "OVERDUE" }, 2);
    expect(mocks.billing).toHaveBeenCalledTimes(2);
    expect(response.listing).toMatchObject({
      total: 31,
      page: 2,
      hasNext: false,
    });
    expect(response.results).toHaveLength(6);
    expect(response.results[0]?.id).toBe("billing-124");
    expect(response.moreHref).toContain("status=OVERDUE");
  });

  it.each(["Order", "Billing"] as const)(
    "requires narrower %s scope above the derived cap",
    async (kind) => {
      const reader = kind === "Order" ? mocks.orders : mocks.billing;
      reader.mockResolvedValue({ items: [], total: 501 });
      const response = await list({ kind, paymentStatus: "UNPAID" });
      expect(response.message).toContain("exceeds 500 records");
      expect(response.listing).toBeUndefined();
      expect(reader).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps native large lists paginated without applying the derived cap", async () => {
    mocks.orders.mockResolvedValue({ items: [order()], total: 501 });
    const response = await list();
    expect(response.listing?.total).toBe(501);
    expect(response.listing?.hasNext).toBe(true);
    expect(mocks.orders).toHaveBeenCalledTimes(1);
  });

  it.each(["Order", "Billing"] as const)(
    "%s due-date filters never substitute paid dates or undated records",
    async (kind) => {
      if (kind === "Order")
        mocks.orders.mockResolvedValue({
          items: [
            order(),
            order({
              id: "paid",
              supplierPayment: {
                status: "PAID",
                outstanding: "0",
                nextDueDate: null,
                paidAt: "2026-10-08",
              },
            }),
            order({
              id: "undated",
              supplierPayment: {
                status: "DATE_NEEDED",
                outstanding: "100",
                nextDueDate: null,
                paidAt: null,
              },
            }),
          ],
          total: 3,
        });
      else
        mocks.billing.mockResolvedValue({
          items: [
            billing(),
            billing({
              id: "paid",
              outstanding: "0",
              status: "PAID",
              dueDate: "2026-10-08",
              paidAt: "2026-10-08",
            }),
            billing({ id: "undated", dueDate: null }),
          ],
          total: 3,
        });
      const response = await list({
        kind,
        dateField: "dueDate",
        dateFrom: "2026-10-08",
        dateTo: "2026-10-08",
      });
      expect(response.results.map((row) => row.id)).toEqual([id]);
      expect(response.moreHref).toBeNull();
    },
  );

  it("uses native Order date range and distinguishes Invoice date filtering", async () => {
    await list({ dateField: "orderDate", dateFrom: "2026-10-01" });
    expect(mocks.orders).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: "2026-10-01", pageSize: 25 }),
    );
    mocks.orders.mockResolvedValue({
      items: [order(), order({ id: "other", invoiceDate: null })],
      total: 2,
    });
    const response = await list({
      dateField: "documentDate",
      dateFrom: "2026-10-02",
      dateTo: "2026-10-02",
    });
    expect(response.results).toHaveLength(1);
    expect(response.listing?.filters).toContain(
      "Invoice date: 02/10/2026 – 02/10/2026",
    );
  });

  it("does not silently omit incomplete unpaid balances", async () => {
    mocks.orders.mockResolvedValue({
      items: [
        order({
          supplierPayment: {
            status: "NOT_SCHEDULED",
            outstanding: null,
            nextDueDate: null,
          },
        }),
      ],
      total: 1,
    });
    const response = await list({ paymentStatus: "UNPAID" });
    expect(response.message).toContain("incomplete payable");
    expect(response.listing).toBeUndefined();
  });

  it.each([
    { kind: "Order", clientId: id },
    { kind: "Order", status: "SQL" },
    { kind: "Billing", supplierId: id },
    { kind: "Billing", status: "UNPAID" },
    { kind: "Billing", documentType: "QUOTE", paymentStatus: "PAID" },
    { kind: "Billing", dateField: "orderDate", dateFrom: "2026-10-01" },
    { kind: "Project", paymentStatus: "PAID" },
    { kind: "Project", status: "ORDERED" },
    { kind: "Client", projectId: id },
    { kind: "Supplier", status: "ACTIVE" },
    { kind: "Order", dateFrom: "2026-10-01" },
    { kind: "Order", dateField: "dueDate" },
  ] satisfies Partial<AssistantListQuery>[])(
    "clarifies unsupported combination %j before reading",
    async (overrides) => {
      const response = await list(overrides);
      expect(response.listing).toBeUndefined();
      expect(response.results).toEqual([]);
      expect(mocks.getDatabase).not.toHaveBeenCalled();
      expect(mocks.orders).not.toHaveBeenCalled();
      expect(mocks.billing).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid runtime input without database access", async () => {
    await expect(list({ supplierId: "bad-id" })).rejects.toThrow();
    await expect(list({}, 0)).rejects.toThrow();
    await expect(
      list({ dateFrom: "2026-10-10", dateTo: "2026-10-01" }),
    ).rejects.toThrow();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
});
