import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const deletion = vi.hoisted(() => ({
  deleteClients: vi.fn(),
  deleteInstallments: vi.fn(),
  deleteOrders: vi.fn(),
  deleteProjects: vi.fn(),
  deleteSuppliers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/deletion/bulk", () => ({
  ...deletion,
  BulkDeletionError: class BulkDeletionError extends Error {},
}));

import { deleteSelectedClientsAction } from "@/app/(app)/clients/actions";
import { deleteSelectedOrdersAction } from "@/app/(app)/orders/actions";
import { deleteSelectedInstallmentsAction } from "@/app/(app)/payments/actions";
import { deleteSelectedProjectsAction } from "@/app/(app)/projects/actions";
import { deleteSelectedSuppliersAction } from "@/app/(app)/suppliers/actions";

describe("bulk deletion action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireMasterDataEditor.mockRejectedValue(new Error("Unauthorized"));
  });

  it.each([
    ["Clients", deleteSelectedClientsAction],
    ["Suppliers", deleteSelectedSuppliersAction],
    ["Projects", deleteSelectedProjectsAction],
    ["Orders", deleteSelectedOrdersAction],
    ["installments", deleteSelectedInstallmentsAction],
  ])(
    "rejects unauthorized %s mutations before persistence",
    async (_, action) => {
      await expect(action(new FormData())).rejects.toThrow("Unauthorized");
    },
  );
});
