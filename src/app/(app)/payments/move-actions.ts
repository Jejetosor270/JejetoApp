"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  cashMoveKindSchema,
  cashMoveSchema,
  type CashMoveOptions,
} from "@/domain/payments/cash-move";
import { cashMoveOptions, moveCash } from "@/lib/payments/cash-moves";
import { PaymentValidationError } from "@/lib/payments/errors";
import { CreditError } from "@/lib/credits/source";
import { isPaymentWriteConflict } from "@/lib/payments/edit-version";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";

export async function loadCashMoveOptions(
  raw: unknown,
): Promise<{ options: CashMoveOptions | null; message: string }> {
  const actor = await requireMasterDataEditor();
  const parsed = z
    .object({
      kind: cashMoveKindSchema,
      id: z.uuid(),
      projectId: z.uuid().optional(),
      search: z.string().trim().max(120).optional(),
    })
    .safeParse(raw);
  if (!parsed.success)
    return {
      options: null,
      message: "Choose a valid cash record and Project.",
    };
  try {
    return {
      options: await cashMoveOptions(
        actor.id,
        parsed.data.kind,
        parsed.data.id,
        parsed.data.projectId,
        parsed.data.search,
      ),
      message: "",
    };
  } catch (error) {
    return {
      options: null,
      message:
        error instanceof PaymentValidationError
          ? error.message
          : "Destinations could not be loaded. Try again.",
    };
  }
}

export async function moveCashAction(
  raw: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await requireMasterDataEditor();
  const parsed = cashMoveSchema.safeParse(raw);
  if (!parsed.success)
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Review the move.",
    };
  try {
    const result = await moveCash(actor.id, parsed.data);
    for (const id of result.projectIds) revalidateProjectFinancialViews(id);
    for (const path of [
      "/orders",
      "/billing",
      "/payments",
      "/receipts",
      "/installments",
      "/calendar",
      "/reports/reconciliation",
    ])
      revalidatePath(path, "layout");
    revalidatePath(`/payments/${parsed.data.id}`);
    revalidatePath(`/receipts/${parsed.data.id}`);
    return {
      success: true,
      message: "Cash moved. Amount, date and actual FX are unchanged.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof PaymentValidationError || error instanceof CreditError
          ? error.message
          : isPaymentWriteConflict(error)
            ? "Another financial change occurred. Your draft is retained; reopen and review before retrying."
            : "The move could not be saved. Your draft is retained.",
    };
  }
}
