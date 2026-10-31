"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import {
  ConnectionAccessError,
  createConnectionToken,
  getConnectionStatus,
  revokeConnectionToken,
} from "@/lib/erp-connection/auth";
import { getErpMcpOrigin } from "@/lib/erp-connection/config";

export async function manageErpConnectionAction(raw: unknown) {
  const actor = await requireAdmin();
  const parsed = z
    .discriminatedUnion("action", [
      z
        .object({ action: z.literal("create"), confirmed: z.literal(true) })
        .strict(),
      z
        .object({
          action: z.literal("revoke"),
          tokenId: z.uuid(),
          confirmed: z.literal(true),
        })
        .strict(),
    ])
    .safeParse(raw);
  if (!parsed.success) return { error: "Confirm the connection change first." };

  try {
    if (parsed.data.action === "create") {
      if (!getErpMcpOrigin())
        return { error: "Configure the connection address first." };
      const created = await createConnectionToken(actor.id);
      revalidatePath("/settings");
      return {
        secret: created.token,
        status: {
          enabled: true,
          token: {
            id: created.id,
            createdAt: created.createdAt,
            expiresAt: created.expiresAt,
            revokedAt: null,
          },
        },
      };
    }
    await revokeConnectionToken(actor.id, parsed.data.tokenId);
    const status = await getConnectionStatus(actor.id);
    revalidatePath("/settings");
    return { status };
  } catch (error) {
    return {
      error:
        error instanceof ConnectionAccessError
          ? "This connection is available only to the configured account."
          : "The connection could not be updated. Refresh and try again.",
    };
  }
}
