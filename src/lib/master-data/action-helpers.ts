import { z } from "zod";

import type { MasterDataActionState } from "@/components/master-data/action-state";

export function formString(
  formData: FormData,
  name: string,
): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function validationActionError(
  error: z.ZodError,
): MasterDataActionState {
  return {
    message:
      error.issues[0]?.message ?? "Check the entered details and try again.",
    status: "error",
  };
}

export function unexpectedActionError(entity: string): MasterDataActionState {
  return {
    message: `We could not save this ${entity}. Please try again.`,
    status: "error",
  };
}
