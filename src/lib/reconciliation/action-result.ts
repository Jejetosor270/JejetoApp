import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ReconciliationError } from "@/domain/reconciliation/schema";

export function reconciliationError(error: unknown): string {
  if (error instanceof ReconciliationError) return error.message;
  if (error instanceof z.ZodError)
    return "Check the required fields and confirm your reviewed selection.";
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  )
    return "Another employee changed this match. Reload the bank row and review again.";
  // Never expose SQL, customer contents or internal errors to the browser/logs.
  return "Reconciliation could not be saved. Your draft is preserved; please try again.";
}
