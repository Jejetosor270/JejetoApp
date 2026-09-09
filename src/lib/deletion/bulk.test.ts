import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/trash/service", () => ({
  moveToTrash: vi.fn(),
  TrashError: class extends Error {},
}));
import { moveToTrash } from "@/lib/trash/service";
import {
  deleteClients,
  deleteProjects,
  deleteOrders,
  deleteSuppliers,
  deleteInstallments,
} from "./bulk";
it.each([
  [deleteClients, "Client"],
  [deleteProjects, "Project"],
  [deleteOrders, "ProcurementOrder"],
  [deleteSuppliers, "Supplier"],
  [deleteInstallments, "PaymentInstallment"],
] as const)(
  "routes business deletion through recoverable Trash (%s)",
  async (remove, model) => {
    await remove("actor", ["record"]);
    expect(moveToTrash).toHaveBeenLastCalledWith("actor", model, ["record"]);
  },
);
