"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { saveTableCell } from "@/lib/listing-cell-edit";
import { CellEditError } from "@/domain/listing/cell-edit";
import { ProcurementRelationError } from "@/lib/procurement/errors";
import { ClientBillingValidationError } from "@/lib/billing/billing";
import { Prisma } from "@/generated/prisma/client";
import type { CellResult } from "@/components/inline-editing/editable-cell";

export async function saveTableCellAction(input: unknown): Promise<CellResult> {
  const actor = await requireMasterDataEditor();
  try {
    await saveTableCell(actor.id, input);
    revalidatePath("/", "layout");
    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        status: "error",
        message: error.issues[0]?.message ?? "Check this value.",
      };
    if (
      error instanceof CellEditError ||
      error instanceof ProcurementRelationError ||
      error instanceof ClientBillingValidationError
    )
      return { status: "error", message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return {
          status: "error",
          message: "This reference is already in use.",
        };
      if (error.code === "P2034")
        return {
          status: "error",
          message:
            "Another edit happened at the same time. Reload and review before retrying.",
        };
    }
    return {
      status: "error",
      message:
        "Unable to save. Your draft is retained. Open the full editor to review this record.",
    };
  }
}
