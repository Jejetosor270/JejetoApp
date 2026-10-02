"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import {
  createCredit,
  recordCreditRefund,
  cancelCredit,
  cancelRefund,
  CreditError,
} from "@/lib/credits/service";

export async function saveCreditAction(
  kind: "credit" | "refund" | "cancel-credit" | "cancel-refund",
  input: unknown,
) {
  try {
    const result =
      kind === "credit"
        ? await createCredit(input)
        : kind === "refund"
          ? await recordCreditRefund(input)
          : kind === "cancel-credit"
            ? await cancelCredit(input)
            : kind === "cancel-refund"
              ? await cancelRefund(input)
              : null;
    if (!result) return { ok: false, message: "Choose a valid credit action." };
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "Saved. Original documents and payments have been retained.",
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      message:
        error instanceof CreditError
          ? error.message
          : error instanceof ZodError
            ? error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(" ")
            : "Could not save this change. Your draft is retained; refresh the record and try again.",
    };
  }
}
