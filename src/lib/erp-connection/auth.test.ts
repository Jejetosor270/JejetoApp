import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    user: { findUnique: vi.fn() },
    erpConnectionToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    client,
    getDatabase: vi.fn(),
    transaction: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));

import {
  authenticateConnection,
  ConnectionAccessError,
  ConnectionChangeError,
  createConnectionToken,
  getConnectionStatus,
  isErpConnectionOwner,
  revokeConnectionToken,
} from "./auth";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tokenId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const now = new Date("2026-10-31T12:00:00.000Z");
const owner = {
  id: ownerId,
  email: "admin@example.test",
  name: "Test administrator",
  role: "ADMIN" as const,
  isActive: true as const,
  passwordHash: "hash-from-database",
};
const syntheticToken = () =>
  `mberp_read_${Buffer.alloc(32, 1).toString("base64url")}`;
const validTokenRow = () => ({
  userId: ownerId,
  expiresAt: new Date("2026-11-01T12:00:00.000Z"),
  revokedAt: null,
});

describe("private read-only ERP connection credentials", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("ERP_MCP_OWNER_ID", ownerId);
    mocks.getDatabase.mockReturnValue({
      ...mocks.client,
      $transaction: mocks.transaction,
    });
    mocks.transaction.mockImplementation(
      async (run: (client: typeof mocks.client) => Promise<unknown>) =>
        run(mocks.client),
    );
    mocks.client.user.findUnique.mockResolvedValue(owner);
    mocks.client.erpConnectionToken.create.mockResolvedValue({ id: tokenId });
    mocks.client.erpConnectionToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue(
      validTokenRow(),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "not-a-uuid"])(
    "fails closed without a valid configured owner (%s) before querying the database",
    async (configuredOwner) => {
      vi.stubEnv("ERP_MCP_OWNER_ID", configuredOwner);
      await expect(
        authenticateConnection(`Bearer ${syntheticToken()}`),
      ).resolves.toBeNull();
      await expect(getConnectionStatus(ownerId)).resolves.toEqual({
        enabled: false,
        token: null,
      });
      await expect(createConnectionToken(ownerId)).rejects.toBeInstanceOf(
        ConnectionAccessError,
      );
      expect(isErpConnectionOwner(owner)).toBe(false);
      expect(mocks.getDatabase).not.toHaveBeenCalled();
    },
  );

  it("limits ownership to the configured active administrator", async () => {
    expect(isErpConnectionOwner(owner)).toBe(true);
    expect(isErpConnectionOwner({ ...owner, id: otherId })).toBe(false);
    expect(isErpConnectionOwner({ ...owner, role: "MANAGER" })).toBe(false);
    await expect(createConnectionToken(otherId)).rejects.toBeInstanceOf(
      ConnectionAccessError,
    );
    await expect(getConnectionStatus(otherId)).rejects.toBeInstanceOf(
      ConnectionAccessError,
    );
    await expect(
      revokeConnectionToken(otherId, tokenId),
    ).rejects.toBeInstanceOf(ConnectionAccessError);
    expect(mocks.client.erpConnectionToken.create).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...owner, isActive: false },
    { ...owner, role: "MANAGER" },
    { ...owner, passwordHash: null },
  ])(
    "rechecks current employee access for key issuance and authenticated reads",
    async (user) => {
      mocks.client.user.findUnique.mockResolvedValue(user);
      await expect(createConnectionToken(ownerId)).rejects.toBeInstanceOf(
        ConnectionAccessError,
      );
      await expect(
        authenticateConnection(`Bearer ${syntheticToken()}`),
      ).resolves.toBeNull();
      expect(mocks.client.erpConnectionToken.create).not.toHaveBeenCalled();
    },
  );

  it("rotates one random key in a serializable audited transaction and stores only its hash", async () => {
    const result = await createConnectionToken(ownerId);
    expect(result).toMatchObject({
      id: tokenId,
      createdAt: now.toISOString(),
      expiresAt: "2026-11-30T12:00:00.000Z",
    });
    expect(result.token).toMatch(/^mberp_read_[A-Za-z0-9_-]{43}$/);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.client.erpConnectionToken.updateMany).toHaveBeenCalledWith({
      where: { userId: ownerId, revokedAt: null },
      data: { revokedAt: now },
    });
    const expectedHash = createHash("sha256")
      .update(result.token)
      .digest("hex");
    expect(mocks.client.erpConnectionToken.create).toHaveBeenCalledWith({
      data: {
        userId: ownerId,
        tokenHash: expectedHash,
        createdAt: now,
        expiresAt: new Date(result.expiresAt),
      },
      select: { id: true },
    });
    const audit = JSON.stringify(mocks.audit.mock.calls);
    expect(audit).not.toContain(result.token);
    expect(audit).not.toContain(expectedHash);
    expect(audit).toContain("READ_ONLY");
  });

  it("returns only serializable metadata when revisiting Settings", async () => {
    mocks.client.erpConnectionToken.findFirst.mockResolvedValue({
      id: tokenId,
      createdAt: now,
      expiresAt: validTokenRow().expiresAt,
      revokedAt: null,
    });
    await expect(getConnectionStatus(ownerId)).resolves.toEqual({
      enabled: true,
      token: {
        id: tokenId,
        createdAt: now.toISOString(),
        expiresAt: "2026-11-01T12:00:00.000Z",
        revokedAt: null,
      },
    });
    expect(mocks.client.erpConnectionToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: ownerId },
        select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
      }),
    );
  });

  it.each([
    null,
    "",
    "Basic abc",
    "Bearer not-a-key",
    "Bearer " + "a".repeat(150),
    `Bearer ${syntheticToken()},extra`,
  ])(
    "rejects malformed authorization without touching the database",
    async (header) => {
      await expect(authenticateConnection(header)).resolves.toBeNull();
      expect(mocks.getDatabase).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { ...validTokenRow(), userId: otherId },
    { ...validTokenRow(), userId: null },
    { ...validTokenRow(), revokedAt: now },
    { ...validTokenRow(), expiresAt: now },
  ])(
    "rejects missing, unowned, deleted-user, revoked or expired credentials",
    async (row) => {
      mocks.client.erpConnectionToken.findUnique.mockResolvedValue(row);
      await expect(
        authenticateConnection(`Bearer ${syntheticToken()}`),
      ).resolves.toBeNull();
      expect(mocks.client.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it("uses a hash lookup and returns only the fresh public employee identity", async () => {
    const token = syntheticToken();
    await expect(authenticateConnection(`Bearer ${token}`)).resolves.toEqual({
      id: ownerId,
      name: owner.name,
      email: owner.email,
      role: "ADMIN",
      isActive: true,
    });
    expect(mocks.client.erpConnectionToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
  });

  it("revokes only the owner's selected key and audits without credential data", async () => {
    await revokeConnectionToken(ownerId, tokenId);
    expect(mocks.client.erpConnectionToken.updateMany).toHaveBeenCalledWith({
      where: { id: tokenId, userId: ownerId, revokedAt: null },
      data: { revokedAt: now },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      mocks.client,
      ownerId,
      expect.objectContaining({
        action: "DEACTIVATED",
        entityId: tokenId,
      }),
    );
    mocks.client.erpConnectionToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      revokeConnectionToken(ownerId, tokenId),
    ).rejects.toBeInstanceOf(ConnectionChangeError);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it.each(["P2034", "P2002"])(
    "makes concurrent key changes retryable (%s)",
    async (code) => {
      mocks.transaction.mockRejectedValue({ code });
      await expect(createConnectionToken(ownerId)).rejects.toBeInstanceOf(
        ConnectionChangeError,
      );
    },
  );
});
