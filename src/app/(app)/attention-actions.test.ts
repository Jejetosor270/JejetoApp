import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  snapshot: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/reporting/financial-attention", () => ({
  getFinancialAttention: mocks.snapshot,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    financialAttentionSnooze: {
      upsert: mocks.upsert,
      deleteMany: mocks.remove,
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/domain/payments/dates", async (original) => ({
  ...(await original<typeof import("@/domain/payments/dates")>()),
  businessToday: () => "2026-09-22",
}));
import { snoozeAttention, unsnoozeAttention } from "./attention-actions";
const input = {
  key: "term-due:00000000-0000-4000-8000-000000000001",
  fingerprint: "a".repeat(64),
  horizon: 30,
  until: "2026-09-30",
  reason: "Waiting for bank confirmation",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "current-user", role: "USER" });
  mocks.snapshot.mockResolvedValue({
    issues: [{ key: input.key, fingerprint: input.fingerprint }],
  });
});
it("allows a personal snooze but never accepts a supplied employee identity", async () => {
  expect((await snoozeAttention({ ...input, userId: "someone-else" })).ok).toBe(
    true,
  );
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId_issueKey: { userId: "current-user", issueKey: input.key },
      },
      create: expect.objectContaining({
        userId: "current-user",
        reason: input.reason,
      }),
    }),
  );
  await unsnoozeAttention(input.key);
  expect(mocks.remove).toHaveBeenCalledWith({
    where: { userId: "current-user", issueKey: input.key },
  });
});
it("requires an active authenticated employee before reading or writing", async () => {
  mocks.user.mockRejectedValue(new Error("Not authenticated"));
  await expect(snoozeAttention(input)).rejects.toThrow("Not authenticated");
  await expect(unsnoozeAttention(input.key)).rejects.toThrow(
    "Not authenticated",
  );
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it("rejects invalid dates/reasons and stale or resolved issues", async () => {
  expect((await snoozeAttention({ ...input, reason: " " })).ok).toBe(false);
  expect((await snoozeAttention({ ...input, until: "2026-09-22" })).ok).toBe(
    false,
  );
  expect(
    (await snoozeAttention({ ...input, fingerprint: "b".repeat(64) })).ok,
  ).toBe(false);
  mocks.snapshot.mockResolvedValue({ issues: [] });
  expect((await snoozeAttention(input)).ok).toBe(false);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("returns a safe error without pretending a failed write succeeded", async () => {
  mocks.upsert.mockRejectedValue(new Error("private database details"));
  const result = await snoozeAttention(input);
  expect(result.ok).toBe(false);
  expect(result.message).not.toContain("private");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
