"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { emptyTrash } from "@/lib/trash/purge";
import { TrashError } from "@/lib/trash/service";
import type { BulkActionState } from "@/domain/deletion/action-state";

export async function emptyTrashAction(
  _previous: BulkActionState,
  data: FormData,
): Promise<BulkActionState> {
  const actor = await requireAdmin();
  if (!z.literal("EMPTY TRASH").safeParse(data.get("confirmation")).success)
    return {
      status: "error",
      message: "Type EMPTY TRASH to confirm permanent deletion.",
    };
  try {
    const count = await emptyTrash(actor.id);
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: `${count} records permanently deleted. The audit log was retained.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof TrashError
          ? error.message
          : "Trash could not be emptied. Nothing was deleted. Refresh and try again.",
    };
  }
}
