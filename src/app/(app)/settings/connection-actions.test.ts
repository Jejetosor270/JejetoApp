import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createConnectionToken: vi.fn(),
  revokeConnectionToken: vi.fn(),
  getConnectionStatus: vi.fn(),
  getErpMcpOrigin: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/erp-connection/auth", () => ({
  ...mocks,
  ConnectionAccessError: class extends Error {},
}));
vi.mock("@/lib/erp-connection/config", () => ({
  getErpMcpOrigin: mocks.getErpMcpOrigin,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { manageErpConnectionAction } from "./connection-actions";

describe("private connection management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "owner" });
    mocks.getErpMcpOrigin.mockReturnValue("https://erp.example.test");
  });

  it("requires an administrator before issuing or revoking access", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("denied"));
    await expect(
      manageErpConnectionAction({ action: "create", confirmed: true }),
    ).rejects.toThrow("denied");
    expect(mocks.createConnectionToken).not.toHaveBeenCalled();
  });

  it.each([
    { action: "create" },
    { action: "create", confirmed: false },
    { action: "create", confirmed: true, actorId: "forged" },
    { action: "revoke", confirmed: true, tokenId: "bad" },
    { action: "write", confirmed: true },
  ])("rejects missing confirmation and unrecognized input", async (input) => {
    expect(await manageErpConnectionAction(input)).toHaveProperty("error");
    expect(mocks.createConnectionToken).not.toHaveBeenCalled();
    expect(mocks.revokeConnectionToken).not.toHaveBeenCalled();
  });

  it("refuses issuance without a valid public address", async () => {
    mocks.getErpMcpOrigin.mockReturnValue(null);
    expect(
      await manageErpConnectionAction({ action: "create", confirmed: true }),
    ).toHaveProperty("error");
    expect(mocks.createConnectionToken).not.toHaveBeenCalled();
  });

  it("uses the server actor and returns the new key only on creation", async () => {
    const created = {
      id: "11111111-1111-4111-8111-111111111111",
      token: "fixture-access-key",
      createdAt: "2026-10-31T10:00:00Z",
      expiresAt: "2026-11-30T10:00:00Z",
    };
    mocks.createConnectionToken.mockResolvedValue(created);
    const result = await manageErpConnectionAction({
      action: "create",
      confirmed: true,
    });
    expect(mocks.createConnectionToken).toHaveBeenCalledWith("owner");
    expect(result).toMatchObject({
      secret: created.token,
      status: { enabled: true, token: { id: created.id, revokedAt: null } },
    });
    mocks.getConnectionStatus.mockResolvedValue({ enabled: true, token: null });
    const revoked = await manageErpConnectionAction({
      action: "revoke",
      tokenId: created.id,
      confirmed: true,
    });
    expect(mocks.revokeConnectionToken).toHaveBeenCalledWith(
      "owner",
      created.id,
    );
    expect(revoked).not.toHaveProperty("secret");
  });

  it("does not return database errors or credentials", async () => {
    mocks.createConnectionToken.mockRejectedValue(
      new Error("private database diagnostic"),
    );
    const result = await manageErpConnectionAction({
      action: "create",
      confirmed: true,
    });
    expect(result.error).toContain("could not be updated");
    expect(JSON.stringify(result)).not.toContain("private database");
  });
});
