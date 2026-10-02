import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  snapshot: vi.fn(),
  find: vi.fn(),
  active: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireRole: mocks.role }));
vi.mock("./attention-workspace", () => ({
  getAttentionWorkspace: mocks.snapshot,
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ $transaction: mocks.transaction }),
}));
import { saveAttentionFollowUp } from "./attention-follow-ups";
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  key: `cash-gap-30:${id}`,
  horizon: 30,
  version: null,
  assigneeId: id,
  nextFollowUpDate: "2026-10-10",
  note: "Ask supplier to confirm",
};
const before = {
  id: "follow-up",
  issueKey: `cash-gap:${id}`,
  assigneeId: null,
  nextFollowUpDate: null,
  note: "Earlier note",
  version: 1,
  createdById: "original-actor",
};
const transaction = {
  user: { findFirst: mocks.active },
  financialFollowUp: {
    findUnique: mocks.find,
    create: mocks.create,
    update: mocks.update,
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "actor", role: "MANAGER" });
  mocks.snapshot.mockResolvedValue({
    issues: [{ key: input.key, reference: "Project" }],
  });
  mocks.active.mockResolvedValue({ id });
  mocks.find.mockResolvedValue(null);
  mocks.create.mockImplementation(async ({ data }) => ({
    id: "follow-up",
    version: 1,
    ...data,
  }));
  mocks.update.mockImplementation(async ({ data }) => ({
    ...before,
    ...data,
    version: 2,
  }));
  mocks.transaction.mockImplementation(async (callback) =>
    callback(transaction),
  );
});
it("enforces ADMIN/MANAGER before reading the issue or writing metadata", async () => {
  mocks.role.mockRejectedValue(new Error("Forbidden"));
  await expect(saveAttentionFollowUp(input)).rejects.toThrow("Forbidden");
  expect(mocks.role).toHaveBeenCalledWith(["ADMIN", "MANAGER"]);
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects arbitrary, absent and unstable issues, and inactive assignees", async () => {
  expect((await saveAttentionFollowUp({ ...input, key: "arbitrary" })).ok).toBe(
    false,
  );
  expect(
    (await saveAttentionFollowUp({ ...input, key: `duplicate:${id}` })).ok,
  ).toBe(false);
  mocks.snapshot.mockResolvedValueOnce({ issues: [] });
  const absent = await saveAttentionFollowUp(input);
  expect(absent.ok).toBe(false);
  expect(absent.message).not.toContain("resolved");
  mocks.active.mockResolvedValue(null);
  expect((await saveAttentionFollowUp(input)).message).toContain(
    "active employee",
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("creates only coordination metadata and audits the exact snapshot inside one transaction", async () => {
  expect(
    (
      await saveAttentionFollowUp({
        ...input,
        createdById: "forged",
        amount: "999",
      })
    ).ok,
  ).toBe(true);
  expect(mocks.create).toHaveBeenCalledWith({
    data: {
      issueKey: `cash-gap:${id}`,
      assigneeId: id,
      nextFollowUpDate: new Date("2026-10-10T00:00:00.000Z"),
      note: input.note,
      createdById: "actor",
      updatedById: "actor",
    },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    transaction,
    "actor",
    expect.objectContaining({
      action: "CREATED",
      entityType: "FINANCIAL_FOLLOW_UP",
      metadata: {
        before: null,
        after: {
          issueKey: `cash-gap:${id}`,
          assigneeId: id,
          nextFollowUpDate: "2026-10-10",
          note: input.note,
          version: 1,
        },
      },
    }),
  );
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
  });
});
it("preserves creation attribution and uses the same identity when horizon or financial data changes", async () => {
  mocks.find.mockResolvedValue(before);
  mocks.snapshot.mockResolvedValue({
    issues: [
      { key: `cash-gap-90:${id}`, reference: "Project", amount: "4321" },
    ],
  });
  expect(
    (
      await saveAttentionFollowUp({
        ...input,
        key: `cash-gap-90:${id}`,
        horizon: 90,
        version: 1,
      })
    ).ok,
  ).toBe(true);
  expect(mocks.find).toHaveBeenCalledWith({
    where: { issueKey: `cash-gap:${id}` },
  });
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: before.id, version: 1 },
    data: {
      assigneeId: id,
      nextFollowUpDate: new Date("2026-10-10T00:00:00.000Z"),
      note: input.note,
      updatedById: "actor",
      version: { increment: 1 },
    },
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    transaction,
    "actor",
    expect.objectContaining({
      metadata: {
        before: {
          issueKey: before.issueKey,
          assigneeId: null,
          nextFollowUpDate: null,
          note: before.note,
          version: 1,
        },
        after: {
          issueKey: before.issueKey,
          assigneeId: id,
          nextFollowUpDate: "2026-10-10",
          note: input.note,
          version: 2,
        },
      },
    }),
  );
});
it("rejects stale and concurrent saves without hiding or resolving financial issues", async () => {
  mocks.find.mockResolvedValue(before);
  expect((await saveAttentionFollowUp(input)).message).toContain(
    "changed after",
  );
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.update.mockRejectedValue(new Error("private database details"));
  const result = await saveAttentionFollowUp({ ...input, version: 1 });
  expect(result.ok).toBe(false);
  expect(result.message).not.toContain("private");
  expect(mocks.audit).not.toHaveBeenCalled();
});
