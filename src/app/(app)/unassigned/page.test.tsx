import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelatedTableData } from "@/lib/related-records/types";

const state = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn(), count: vi.fn() });
  return {
    requireUser: vi.fn(),
    tables: [] as RelatedTableData[],
    total: 0,
    db: {
      project: model(),
      procurementOrder: model(),
      clientBillingDocument: model(),
      paymentInstallment: model(),
      clientPaymentInstallment: model(),
      building: model(),
      room: model(),
      orderPackage: model(),
      item: model(),
      projectFreightExpense: model(),
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
vi.mock("@/lib/settings/application-settings", () => ({
  getApplicationSettings: async () => ({ itemManagementEnabled: false }),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: state.requireUser,
  canEditMasterData: (role: string) => role === "ADMIN" || role === "MANAGER",
}));
vi.mock("@/components/layout/related-records", () => ({
  RelatedRecords: ({ tables }: { tables: RelatedTableData[] }) => {
    state.tables = tables;
    return null;
  },
}));
vi.mock("@/components/listing/pagination", () => ({
  Pagination: ({ total }: { total: number }) => {
    state.total = total;
    return null;
  },
}));
import UnassignedPage from "./page";

describe("unassigned freight review destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tables = [];
    state.total = 0;
    state.requireUser.mockResolvedValue({ role: "ADMIN" });
    for (const model of Object.values(state.db)) {
      model.findMany.mockResolvedValue([]);
      model.count.mockResolvedValue(0);
    }
    state.db.projectFreightExpense.findMany.mockResolvedValue([
      {
        id: "freight",
        reference: "FR-001",
        description: "Retained shipping",
        expenseDate: new Date("2026-10-01"),
        currencyCode: "USD",
        costAmountHt: "100",
        vatAmount: "20",
        vatTreatment: "DOMESTIC",
        payments: [{ amount: "40" }],
      },
    ]);
  });
  it("shows original-currency cost and existing payment balance without edit actions", async () => {
    renderToStaticMarkup(
      await UnassignedPage({ searchParams: Promise.resolve({}) }),
    );
    const freight = state.tables.find((table) => table.id === "freight");
    expect(freight?.rows[0]?.cells).toEqual([
      "FR-001",
      "Retained shipping",
      "01/10/2026",
      "100.00 USD",
      "40.00 USD",
      "80.00 USD",
    ]);
    expect(freight?.numericColumns).toEqual([3, 4, 5]);
    expect(freight?.editKind).toBeUndefined();
    expect(freight?.trashKind).toBeUndefined();
    expect(freight?.removal).toBeUndefined();
    expect(freight?.rows[0]?.href).toBeUndefined();
    expect(freight?.description).toContain("excluded from Project totals");
  });
  it("includes retained freight in the existing shared page count", async () => {
    state.db.projectFreightExpense.count.mockResolvedValue(61);
    renderToStaticMarkup(
      await UnassignedPage({
        searchParams: Promise.resolve({ page: "2", pageSize: "25" }),
      }),
    );
    expect(state.db.projectFreightExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: null },
        skip: 25,
        take: 25,
        orderBy: { id: "asc" },
      }),
    );
    expect(state.db.projectFreightExpense.count).toHaveBeenCalledWith({
      where: { projectId: null },
    });
    expect(state.total).toBe(61);
  });
  it("requires authentication before reading retained freight", async () => {
    state.requireUser.mockRejectedValue(new Error("unauthenticated"));
    await expect(
      UnassignedPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("unauthenticated");
    expect(state.db.projectFreightExpense.findMany).not.toHaveBeenCalled();
  });
});
