import { z } from "zod";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { fieldErrorMap } from "@/domain/validation/issues";

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
    fieldErrors: fieldErrorMap(error.issues),
    formError:
      error.issues[0]?.message ?? "Check the entered details and try again.",
    message:
      error.issues[0]?.message ?? "Check the entered details and try again.",
    status: "error",
  };
}

export function unexpectedActionError(entity: string): MasterDataActionState {
  return {
    formError: `We could not save this ${entity}. Please try again.`,
    message: `We could not save this ${entity}. Please try again.`,
    status: "error",
  };
}
