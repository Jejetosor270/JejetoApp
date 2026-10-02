import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  quality: vi.fn(),
  fingerprint: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./financial-attention", () => ({
  getFinancialAttention: mocks.snapshot,
  attentionFingerprint: mocks.fingerprint,
}));
vi.mock("./attention-data-quality", () => ({
  getAttentionDataQuality: mocks.quality,
}));
import { getAttentionWorkspace } from "./attention-workspace";
it("adds review issues without changing active Project cards or financial calculations", async () => {
  const projects = [{ id: "active", status: "ACTIVE" }];
  const issue = { key: "term-due:active", fingerprint: "original" };
  const quality = {
    key: "unassigned-cash:cash",
    amount: "100",
    currency: "USD",
  };
  mocks.snapshot.mockResolvedValue({ projects, issues: [issue] });
  mocks.quality.mockResolvedValue([quality]);
  mocks.fingerprint.mockReturnValue("quality-fingerprint");
  const result = await getAttentionWorkspace(30, "2026-10-02");
  expect(result.projects).toBe(projects);
  expect(result.issues).toEqual([
    issue,
    { ...quality, fingerprint: "quality-fingerprint" },
  ]);
  expect(mocks.snapshot).toHaveBeenCalledWith(30, "2026-10-02");
  expect(mocks.quality).toHaveBeenCalledWith("2026-10-02");
  expect(mocks.fingerprint).toHaveBeenCalledWith(quality);
});
