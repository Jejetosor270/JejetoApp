import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/current-user";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";

const TOKEN_DAYS = 30;
const TOKEN_PREFIX = "mberp_read_";
const tokenPattern = /^Bearer (mberp_read_[A-Za-z0-9_-]{43})$/;
const employeeIdSchema = z.uuid();

export class ConnectionAccessError extends Error {
  constructor() {
    super("This connection is available only to its configured administrator.");
    this.name = "ConnectionAccessError";
  }
}

export class ConnectionChangeError extends Error {
  constructor() {
    super("The connection changed. Refresh and try again.");
    this.name = "ConnectionChangeError";
  }
}

function ownerId(): string | null {
  const value = employeeIdSchema.safeParse(process.env.ERP_MCP_OWNER_ID);
  return value.success ? value.data : null;
}

export function isErpConnectionOwner(
  user: Pick<AuthenticatedUser, "id" | "role" | "isActive">,
): boolean {
  return user.id === ownerId() && user.role === "ADMIN" && user.isActive;
}

async function requireConnectionOwner(
  database: Pick<Prisma.TransactionClient, "user">,
  actorId: string,
): Promise<AuthenticatedUser> {
  if (actorId !== ownerId()) throw new ConnectionAccessError();
  const user = await database.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });
  if (!user?.isActive || user.role !== "ADMIN" || !user.passwordHash) {
    throw new ConnectionAccessError();
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: true,
  };
}

export interface ConnectionTokenStatus {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface ConnectionStatus {
  enabled: boolean;
  token: ConnectionTokenStatus | null;
}

export async function getConnectionStatus(
  actorId: string,
): Promise<ConnectionStatus> {
  if (!ownerId()) return { enabled: false, token: null };
  const database = getDatabase();
  await requireConnectionOwner(database, actorId);
  const token = await database.erpConnectionToken.findFirst({
    where: { userId: actorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
  });
  return {
    enabled: true,
    token: token
      ? {
          id: token.id,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
          revokedAt: token.revokedAt?.toISOString() ?? null,
        }
      : null,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function rethrowChangeError(error: unknown): never {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "P2034" || error.code === "P2002")
  ) {
    throw new ConnectionChangeError();
  }
  throw error;
}

/** Rotates the owner's key; the raw credential is returned exactly once. */
export async function createConnectionToken(actorId: string): Promise<{
  token: string;
  id: string;
  createdAt: string;
  expiresAt: string;
}> {
  if (actorId !== ownerId()) throw new ConnectionAccessError();
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_DAYS * 24 * 60 * 60 * 1000);
  try {
    const id = await getDatabase().$transaction(
      async (transaction) => {
        await requireConnectionOwner(transaction, actorId);
        await transaction.erpConnectionToken.updateMany({
          where: { userId: actorId, revokedAt: null },
          data: { revokedAt: now },
        });
        const stored = await transaction.erpConnectionToken.create({
          data: {
            userId: actorId,
            tokenHash: hashToken(token),
            createdAt: now,
            expiresAt,
          },
          select: { id: true },
        });
        await writeAuditEvent(transaction, actorId, {
          action: "CREATED",
          entityId: stored.id,
          entityType: "SETTING",
          entityReference: "ERP read-only connection",
          summary:
            "Issued a read-only connection key and revoked earlier keys.",
          metadata: { expiresAt: expiresAt.toISOString(), access: "READ_ONLY" },
        });
        return stored.id;
      },
      { isolationLevel: "Serializable" },
    );
    return {
      token,
      id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    rethrowChangeError(error);
  }
}

export async function revokeConnectionToken(
  actorId: string,
  tokenId: string,
): Promise<void> {
  if (actorId !== ownerId()) throw new ConnectionAccessError();
  const id = employeeIdSchema.parse(tokenId);
  try {
    await getDatabase().$transaction(
      async (transaction) => {
        await requireConnectionOwner(transaction, actorId);
        const result = await transaction.erpConnectionToken.updateMany({
          where: { id, userId: actorId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (result.count !== 1) throw new ConnectionChangeError();
        await writeAuditEvent(transaction, actorId, {
          action: "DEACTIVATED",
          entityId: id,
          entityType: "SETTING",
          entityReference: "ERP read-only connection",
          summary: "Revoked the read-only connection key.",
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    rethrowChangeError(error);
  }
}

/** Cookie sessions and query-string credentials are never accepted by this boundary. */
export async function authenticateConnection(
  authorizationHeader: string | null,
): Promise<AuthenticatedUser | null> {
  const configuredOwner = ownerId();
  if (
    !configuredOwner ||
    !authorizationHeader ||
    authorizationHeader.length > 100
  ) {
    return null;
  }
  const token = tokenPattern.exec(authorizationHeader)?.[1];
  if (!token) return null;
  const database = getDatabase();
  const stored = await database.erpConnectionToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { userId: true, expiresAt: true, revokedAt: true },
  });
  if (
    !stored ||
    stored.userId !== configuredOwner ||
    stored.revokedAt !== null ||
    stored.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  try {
    return await requireConnectionOwner(database, configuredOwner);
  } catch (error) {
    if (error instanceof ConnectionAccessError) return null;
    throw error;
  }
}
