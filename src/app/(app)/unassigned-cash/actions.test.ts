import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  move: vi.fn(),
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.actor,
}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.database }));
vi.mock("@/lib/payments/unassigned-cash", () => ({
  unassignCash: mocks.move,
  UnassignedCashError: class extends Error {},
}));
import {
  unassignCashAction,
  editUnassignedCashAction,
  trashUnassignedCashAction,
} from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
});
it("requires authorization before every cash mutation", async () => {
  mocks.actor.mockRejectedValue(new Error("Denied"));
  await expect(unassignCashAction("payment", new FormData())).rejects.toThrow(
    "Denied",
  );
  await expect(editUnassignedCashAction(new FormData())).rejects.toThrow(
    "Denied",
  );
  await expect(trashUnassignedCashAction(new FormData())).rejects.toThrow(
    "Denied",
  );
  expect(mocks.move).not.toHaveBeenCalled();
  expect(mocks.database).not.toHaveBeenCalled();
});
it("rejects empty selections without touching cash", async () => {
  mocks.actor.mockResolvedValue({ id: "actor" });
  expect((await unassignCashAction("receipt", new FormData())).status).toBe(
    "error",
  );
  expect(mocks.move).not.toHaveBeenCalled();
});
