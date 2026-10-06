import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  procurementOrder: { findUnique: vi.fn() },
  clientBillingDocument: { findUnique: vi.fn() },
  client: { findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => db }));
import { resolveAssistantContext } from "@/lib/assistant/context";
beforeEach(() => vi.resetAllMocks());

describe("server-verified JejetoBot page context", () => {
  it("does not load page records unless the question explicitly uses context", async () => {
    expect(
      await resolveAssistantContext({ kind: "Project", id: "hint" }, "NONE"),
    ).toEqual({});
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });
  it("resolves Project and Client from visible Project data", async () => {
    db.project.findUnique.mockResolvedValue({
      id: "project",
      clientId: "client",
    });
    expect(
      await resolveAssistantContext({ kind: "Project", id: "hint" }, "PROJECT"),
    ).toEqual({ projectId: "project" });
    expect(
      await resolveAssistantContext({ kind: "Project", id: "hint" }, "CLIENT"),
    ).toEqual({ clientId: "client" });
  });
  it("derives Order relationships, never accepts them from the browser", async () => {
    db.procurementOrder.findUnique.mockResolvedValue({
      projectId: "project",
      supplierId: "supplier",
      project: { clientId: "client" },
    });
    expect(
      await resolveAssistantContext({ kind: "Order", id: "order" }, "PROJECT"),
    ).toEqual({ projectId: "project" });
    expect(
      await resolveAssistantContext({ kind: "Order", id: "order" }, "SUPPLIER"),
    ).toEqual({ supplierId: "supplier" });
    expect(
      await resolveAssistantContext({ kind: "Order", id: "order" }, "CLIENT"),
    ).toEqual({ clientId: "client" });
  });
  it("resolves Billing relationships and rejects an invented Supplier relationship", async () => {
    db.clientBillingDocument.findUnique.mockResolvedValue({
      projectId: "project",
      clientId: "client",
    });
    expect(
      await resolveAssistantContext(
        { kind: "Billing", id: "invoice" },
        "PROJECT",
      ),
    ).toEqual({ projectId: "project" });
    expect(
      await resolveAssistantContext(
        { kind: "Billing", id: "invoice" },
        "CLIENT",
      ),
    ).toEqual({ clientId: "client" });
    await expect(
      resolveAssistantContext({ kind: "Billing", id: "invoice" }, "SUPPLIER"),
    ).rejects.toThrow("no available matching context");
  });
  it("resolves master record contexts through the Trash-aware database", async () => {
    db.supplier.findUnique.mockResolvedValue({ id: "supplier" });
    db.client.findUnique.mockResolvedValue({ id: "client" });
    expect(
      await resolveAssistantContext(
        { kind: "Supplier", id: "hint" },
        "SUPPLIER",
      ),
    ).toEqual({ supplierId: "supplier" });
    expect(
      await resolveAssistantContext({ kind: "Client", id: "hint" }, "CLIENT"),
    ).toEqual({ clientId: "client" });
  });
  it("never broadens to all records for missing/trashed/unassigned context", async () => {
    await expect(resolveAssistantContext(null, "PROJECT")).rejects.toThrow(
      "Open the relevant record",
    );
    db.project.findUnique.mockResolvedValue(null);
    await expect(
      resolveAssistantContext({ kind: "Project", id: "gone" }, "PROJECT"),
    ).rejects.toThrow("no available matching context");
    db.procurementOrder.findUnique.mockResolvedValue({
      projectId: null,
      supplierId: null,
      project: null,
    });
    await expect(
      resolveAssistantContext({ kind: "Order", id: "unassigned" }, "PROJECT"),
    ).rejects.toThrow("no available matching context");
    db.supplier.findUnique.mockResolvedValue(null);
    await expect(
      resolveAssistantContext({ kind: "Supplier", id: "gone" }, "SUPPLIER"),
    ).rejects.toThrow("no available matching context");
  });
});
