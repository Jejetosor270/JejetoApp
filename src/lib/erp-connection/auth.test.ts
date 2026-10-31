import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

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
  authenticateCashConnection,
  requireCashConnection,
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
  id: tokenId,
  scope: "READ_ONLY",
  approvalPublicKey: null,
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
      where: { userId: ownerId, scope: "READ_ONLY", revokedAt: null },
      data: { revokedAt: now },
    });
    const expectedHash = createHash("sha256")
      .update(result.token)
      .digest("hex");
    expect(mocks.client.erpConnectionToken.create).toHaveBeenCalledWith({
      data: {
        userId: ownerId,
        tokenHash: expectedHash,
        scope: "READ_ONLY",
        approvalPublicKey: null,
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
        where: { userId: ownerId, scope: "READ_ONLY" },
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
      select: {
        id: true,
        userId: true,
        scope: true,
        approvalPublicKey: true,
        expiresAt: true,
        revokedAt: true,
      },
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

  it("issues cash credentials separately, persisting only the public approval key", async () => {
    const created = await createConnectionToken(ownerId, "CASH_WRITE");
    expect(created.token).toMatch(/^mberp_cash_[A-Za-z0-9_-]{43}$/);
    expect(created.approvalPrivateKey).toContain("BEGIN PRIVATE KEY");
    const stored =
      mocks.client.erpConnectionToken.create.mock.calls[0]?.[0].data;
    expect(stored).toMatchObject({ scope: "CASH_WRITE" });
    expect(stored.approvalPublicKey).toContain("BEGIN PUBLIC KEY");
    expect(createPublicKey(stored.approvalPublicKey).asymmetricKeyType).toBe(
      "ed25519",
    );
    const privateKey = created.approvalPrivateKey;
    if (!privateKey) throw new Error("Expected a one-time approval key.");
    const message = Buffer.from("exact reviewed proposal");
    expect(
      verify(
        null,
        message,
        stored.approvalPublicKey,
        sign(null, message, privateKey),
      ),
    ).toBe(true);
    expect(mocks.client.erpConnectionToken.updateMany).toHaveBeenCalledWith({
      where: { userId: ownerId, scope: "CASH_WRITE", revokedAt: null },
      data: { revokedAt: now },
    });
    expect(JSON.stringify(stored)).not.toContain(privateKey);
    const audit = JSON.stringify(mocks.audit.mock.calls);
    expect(audit).toContain("CASH_WRITE");
    expect(audit).not.toContain(privateKey);
    expect(audit).not.toContain(created.token);
  });

  it("does not give read-only credentials an approval key or cash scope", async () => {
    const created = await createConnectionToken(ownerId);
    expect(created).not.toHaveProperty("approvalPrivateKey");
    await expect(
      authenticateCashConnection(`Bearer ${created.token}`),
    ).resolves.toBeNull();
    await expect(
      authenticateConnection(
        `Bearer ${created.token.replace("mberp_read_", "mberp_cash_")}`,
      ),
    ).resolves.toBeNull();
    expect(mocks.client.erpConnectionToken.findUnique).not.toHaveBeenCalled();
  });

  it("authenticates cash scope with token identity and rejects a scope mismatch", async () => {
    const created = await createConnectionToken(ownerId, "CASH_WRITE");
    const publicKey =
      mocks.client.erpConnectionToken.create.mock.calls[0]?.[0].data
        .approvalPublicKey;
    const row = {
      ...validTokenRow(),
      scope: "CASH_WRITE",
      approvalPublicKey: publicKey,
    };
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue(row);
    await expect(
      authenticateCashConnection(`Bearer ${created.token}`),
    ).resolves.toMatchObject({
      actor: { id: ownerId, role: "ADMIN" },
      tokenId,
      approvalPublicKey: publicKey,
    });
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue(
      validTokenRow(),
    );
    await expect(
      authenticateCashConnection(`Bearer ${created.token}`),
    ).resolves.toBeNull();
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue({
      ...row,
      approvalPublicKey: null,
    });
    await expect(
      authenticateCashConnection(`Bearer ${created.token}`),
    ).resolves.toBeNull();
  });

  it("rechecks exact cash credential and current owner inside the supplied transaction", async () => {
    const transaction = mocks.client as unknown as Prisma.TransactionClient;
    const row = {
      ...validTokenRow(),
      scope: "CASH_WRITE",
      approvalPublicKey: "public-key",
    };
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue(row);
    await expect(
      requireCashConnection(transaction, ownerId, tokenId),
    ).resolves.toMatchObject({
      actor: { id: ownerId },
      tokenId,
      approvalPublicKey: "public-key",
    });
    for (const invalid of [
      null,
      validTokenRow(),
      { ...row, userId: otherId },
      { ...row, revokedAt: now },
      { ...row, expiresAt: now },
      { ...row, approvalPublicKey: null },
    ]) {
      mocks.client.erpConnectionToken.findUnique.mockResolvedValue(invalid);
      await expect(
        requireCashConnection(transaction, ownerId, tokenId),
      ).rejects.toBeInstanceOf(ConnectionAccessError);
    }
    mocks.client.erpConnectionToken.findUnique.mockResolvedValue(row);
    mocks.client.user.findUnique.mockResolvedValue({
      ...owner,
      isActive: false,
    });
    await expect(
      requireCashConnection(transaction, ownerId, tokenId),
    ).rejects.toBeInstanceOf(ConnectionAccessError);
    await expect(
      requireCashConnection(transaction, otherId, tokenId),
    ).rejects.toBeInstanceOf(ConnectionAccessError);
  });

  it("reads cash metadata independently from read-only credential status", async () => {
    mocks.client.erpConnectionToken.findFirst.mockResolvedValue(null);
    await getConnectionStatus(ownerId, "CASH_WRITE");
    expect(mocks.client.erpConnectionToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: ownerId, scope: "CASH_WRITE" },
      }),
    );
  });
});
