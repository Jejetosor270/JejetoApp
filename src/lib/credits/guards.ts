import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CreditScope } from "./source";
import { CreditError } from "./source";

export async function hasActiveCredits(
  tx: Prisma.TransactionClient,
  scope: CreditScope,
): Promise<boolean> {
  return (
    (await tx.financialCredit.count({
      where: {
        isCancelled: false,
        ...(scope.side === "CLIENT"
          ? { billingDocumentId: scope.sourceId }
          : { orderId: scope.sourceId }),
      },
    })) > 0
  );
}

/** Financial/source relationship corrections need explicit credit review first. */
export async function assertNoActiveCredits(
  tx: Prisma.TransactionClient,
  scope: CreditScope,
): Promise<void> {
  if (await hasActiveCredits(tx, scope))
    throw new CreditError(
      "This record has active credits. Cancel its refunds and credits before changing the original financial records or assignments.",
    );
}
