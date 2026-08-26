import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const deletion = vi.hoisted(() => ({
  archiveClients: vi.fn(),
  archiveProjects: vi.fn(),
  archiveSuppliers: vi.fn(),
  deleteDraftOrders: vi.fn(),
  deleteUnpaidInstallments: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/deletion/bulk", () => ({
  ...deletion,
  BulkDeletionError: class BulkDeletionError extends Error {},
}));

import { archiveSelectedClientsAction } from "@/app/(app)/clients/actions";
import { deleteSelectedOrdersAction } from "@/app/(app)/orders/actions";
import { deleteSelectedInstallmentsAction } from "@/app/(app)/payments/actions";
import { archiveSelectedProjectsAction } from "@/app/(app)/projects/actions";
import { archiveSelectedSuppliersAction } from "@/app/(app)/suppliers/actions";

describe("bulk deletion action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireMasterDataEditor.mockRejectedValue(new Error("Unauthorized"));
  });

  it.each([
    ["Clients", archiveSelectedClientsAction],
    ["Suppliers", archiveSelectedSuppliersAction],
    ["Projects", archiveSelectedProjectsAction],
    ["Orders", deleteSelectedOrdersAction],
    ["installments", deleteSelectedInstallmentsAction],
  ])(
    "rejects unauthorized %s mutations before persistence",
    async (_, action) => {
      await expect(action(new FormData())).rejects.toThrow("Unauthorized");
    },
  );
});
