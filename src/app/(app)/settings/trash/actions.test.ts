import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  trash: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.actor,
}));
vi.mock("@/lib/trash/service", () => ({
  moveToTrash: mocks.trash,
  restoreTrash: mocks.restore,
  TrashError: class extends Error {},
}));
import { trashSelectedAction, restoreTrashAction } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
});
it("requires an editor before deleting or restoring anything", async () => {
  mocks.actor.mockRejectedValue(new Error("Forbidden"));
  await expect(trashSelectedAction("billing", new FormData())).rejects.toThrow(
    "Forbidden",
  );
  await expect(restoreTrashAction(new FormData())).rejects.toThrow("Forbidden");
  expect(mocks.trash).not.toHaveBeenCalled();
  expect(mocks.restore).not.toHaveBeenCalled();
});
it("rejects invalid selections and restoration IDs", async () => {
  const input = new FormData();
  input.append("selectedIds", "invalid");
  input.set("batchId", "invalid");
  expect((await trashSelectedAction("billing", input)).status).toBe("error");
  expect((await restoreTrashAction(input)).status).toBe("error");
  expect(mocks.trash).not.toHaveBeenCalled();
  expect(mocks.restore).not.toHaveBeenCalled();
});
it("uses the current employee and only the explicit selection", async () => {
  const input = new FormData();
  input.append("selectedIds", "a12b6b9b-10e9-4e42-b93f-38796de4f65a");
  expect((await trashSelectedAction("billing", input)).status).toBe("success");
  expect(mocks.trash).toHaveBeenCalledWith("actor", "ClientBillingDocument", [
    "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
  ]);
});
