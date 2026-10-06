import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  order: vi.fn(),
  billing: vi.fn(),
  client: vi.fn(),
  supplier: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.getDatabase }));

import { searchAssistantRecords } from "@/lib/assistant/search";

function order(id: string, reference = "PO-100") {
  return {
    id,
    orderNumber: reference,
    packageName: "Outdoor package",
    shortDescription: "Garden furniture",
    project: { name: "Example Villa" },
    supplier: { displayName: "Example Supplier" },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const find of [
    mocks.project,
    mocks.order,
    mocks.billing,
    mocks.client,
    mocks.supplier,
  ]) {
    find.mockResolvedValue([]);
  }
  // Deliberately provide only read operations, through the shared database facade.
  mocks.getDatabase.mockReturnValue({
    project: { findMany: mocks.project },
    procurementOrder: { findMany: mocks.order },
    clientBillingDocument: { findMany: mocks.billing },
    client: { findMany: mocks.client },
    supplier: { findMany: mocks.supplier },
  });
});

describe("assistant record search", () => {
  it("prioritizes exact references and performs bounded, stable partial matching", async () => {
    mocks.order
      .mockResolvedValueOnce([order("exact")])
      .mockResolvedValueOnce([order("partial", "PO-100 revised")]);

    const response = await searchAssistantRecords(" PO-100 ", "Order");

    expect(response).toEqual({
      results: [
        {
          id: "exact",
          type: "Order",
          label: "PO-100",
          context: "Example Villa · Example Supplier · Garden furniture",
          href: "/orders/exact",
        },
        {
          id: "partial",
          type: "Order",
          label: "PO-100 revised",
          context: "Example Villa · Example Supplier · Garden furniture",
          href: "/orders/partial",
        },
      ],
      truncated: false,
    });
    expect(mocks.order).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 11,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        where: {
          id: { notIn: [] },
          OR: [
            { orderNumber: { equals: "PO-100", mode: "insensitive" } },
            { packageName: { equals: "PO-100", mode: "insensitive" } },
            { shortDescription: { equals: "PO-100", mode: "insensitive" } },
            {
              supplierQuoteReference: {
                equals: "PO-100",
                mode: "insensitive",
              },
            },
          ],
        },
      }),
    );
    expect(mocks.order).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 11,
        where: expect.objectContaining({
          id: { notIn: ["exact"] },
          OR: expect.arrayContaining([
            { orderNumber: { contains: "PO-100", mode: "insensitive" } },
          ]),
        }),
      }),
    );
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.billing).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.supplier).not.toHaveBeenCalled();
  });

  it("limits the combined response and truthfully flags omitted matches", async () => {
    mocks.order
      .mockResolvedValueOnce([order("exact")])
      .mockResolvedValueOnce(
        Array.from({ length: 11 }, (_, index) => order(`partial-${index}`)),
      );

    const response = await searchAssistantRecords("PO-100", "Order");

    expect(response.results).toHaveLength(10);
    expect(response.results[0]?.id).toBe("exact");
    expect(response.truncated).toBe(true);
  });

  it("does not query partial matches when exact matches already exceed the cap", async () => {
    mocks.order.mockResolvedValueOnce(
      Array.from({ length: 11 }, (_, index) => order(`exact-${index}`)),
    );

    const response = await searchAssistantRecords("PO-100", "Order");

    expect(response.results).toHaveLength(10);
    expect(response.truncated).toBe(true);
    expect(mocks.order).toHaveBeenCalledTimes(1);
  });

  it("checks for more matches when exactly ten exact results are found", async () => {
    mocks.order
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, index) => order(`exact-${index}`)),
      )
      .mockResolvedValueOnce([]);

    const response = await searchAssistantRecords("PO-100", "Order");

    expect(response.results).toHaveLength(10);
    expect(response.truncated).toBe(false);
    expect(mocks.order).toHaveBeenCalledTimes(2);
  });

  it("returns all five supported record types with application-owned links", async () => {
    mocks.project.mockResolvedValueOnce([
      {
        id: "project",
        name: "Example Villa",
        code: "VILLA",
        client: { displayName: "Example Client" },
      },
    ]);
    mocks.order.mockResolvedValueOnce([order("order")]);
    mocks.billing.mockResolvedValueOnce([
      {
        id: "billing",
        reference: "INV-100",
        shortDescription: "Furniture deposit",
        project: null,
        client: null,
      },
    ]);
    mocks.client.mockResolvedValueOnce([
      { id: "client", displayName: "A & B?", legalName: "Example Client Ltd" },
    ]);
    mocks.supplier.mockResolvedValueOnce([
      {
        id: "supplier",
        displayName: "Example / Supplier",
        legalName: "Example Supplier Ltd",
      },
    ]);

    const response = await searchAssistantRecords("Example", "All");

    expect(response.results.map((record) => record.type)).toEqual([
      "Project",
      "Order",
      "Billing",
      "Client",
      "Supplier",
    ]);
    expect(response.results.map((record) => record.href)).toEqual([
      "/projects/project",
      "/orders/order",
      "/billing/billing",
      "/clients/client",
      "/suppliers/supplier",
    ]);
    expect(response.results[2]?.context).toBe(
      "Unassigned · Unassigned · Furniture deposit",
    );
    expect(response.truncated).toBe(false);
    for (const find of [
      mocks.project,
      mocks.order,
      mocks.billing,
      mocks.client,
      mocks.supplier,
    ]) {
      expect(find).toHaveBeenCalledTimes(2);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 11, select: expect.any(Object) }),
      );
    }
  });

  it("opens exact master records even when display names match", async () => {
    mocks.client.mockResolvedValueOnce([
      { id: "client-a", displayName: "Example", legalName: "Example A" },
      { id: "client-b", displayName: "Example", legalName: "Example B" },
    ]);
    mocks.supplier.mockResolvedValueOnce([
      { id: "supplier/a?", displayName: "Example", legalName: "Example A" },
      { id: "supplier-b", displayName: "Example", legalName: "Example B" },
    ]);

    const response = await searchAssistantRecords("Example", "All");

    expect(response.results.map((record) => record.href)).toEqual([
      "/clients/client-a",
      "/clients/client-b",
      "/suppliers/supplier%2Fa%3F",
      "/suppliers/supplier-b",
    ]);
  });

  it("excludes duplicate exact IDs within their own record type only", async () => {
    mocks.project.mockResolvedValueOnce([
      { id: "same-id", name: "Example", code: "EX", client: null },
    ]);
    mocks.order
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([order("same-id")]);

    const response = await searchAssistantRecords("Example", "All");

    expect(response.results).toHaveLength(2);
    expect(mocks.project).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ["same-id"] } }),
      }),
    );
    expect(mocks.order).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: [] } }),
      }),
    );
  });

  it("retains archived master-data visibility and selects no financial or credential fields", async () => {
    await searchAssistantRecords("Example", "Supplier");

    expect(mocks.getDatabase).toHaveBeenCalled();
    expect(mocks.supplier).toHaveBeenNthCalledWith(1, {
      where: {
        id: { notIn: [] },
        OR: [
          { displayName: { equals: "Example", mode: "insensitive" } },
          { legalName: { equals: "Example", mode: "insensitive" } },
        ],
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: 11,
      select: { id: true, displayName: true, legalName: true },
    });
  });

  it("encodes path segments and never treats search text as a URL or SQL", async () => {
    mocks.order.mockResolvedValueOnce([order("id/with?query")]);
    const query = "https://example.test/?q=';DELETE";

    const response = await searchAssistantRecords(query, "Order");

    expect(response.results[0]?.href).toBe("/orders/id%2Fwith%3Fquery");
    expect(mocks.order).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { orderNumber: { equals: query, mode: "insensitive" } },
          ]),
        }),
      }),
    );
  });

  it.each(["", " ", "a", "x".repeat(101)])(
    "rejects an invalid query before any database access",
    async (query) => {
      await expect(searchAssistantRecords(query, "All")).rejects.toThrow();
      expect(mocks.getDatabase).not.toHaveBeenCalled();
    },
  );

  it("does not invent results for an empty match set", async () => {
    await expect(searchAssistantRecords("No match", "All")).resolves.toEqual({
      results: [],
      truncated: false,
    });
  });
});
