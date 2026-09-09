import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  purge: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/trash/purge", () => ({ emptyTrash: mocks.purge }));
vi.mock("@/lib/trash/service", () => ({ TrashError: class extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { emptyTrashAction } from "./purge-action";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
});
const previous = { status: "error" as const, message: "" };
it("requires Administrator authorization before accessing Trash", async () => {
  mocks.admin.mockRejectedValue(new Error("Forbidden"));
  await expect(emptyTrashAction(previous, new FormData())).rejects.toThrow(
    "Forbidden",
  );
  expect(mocks.purge).not.toHaveBeenCalled();
});
it("requires exact confirmation before permanently deleting records", async () => {
  expect((await emptyTrashAction(previous, new FormData())).status).toBe(
    "error",
  );
  expect(mocks.purge).not.toHaveBeenCalled();
  const data = new FormData();
  data.set("confirmation", "EMPTY TRASH");
  mocks.purge.mockResolvedValue(4);
  expect((await emptyTrashAction(previous, data)).status).toBe("success");
  expect(mocks.purge).toHaveBeenCalledExactlyOnceWith("admin");
});
