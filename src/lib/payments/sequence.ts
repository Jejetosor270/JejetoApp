import "server-only";
import { Prisma } from "@/generated/prisma/client";
/** Sequence identities remain reserved while in Trash, so replacements can be restored safely. */
export async function nextInstallmentSequence(
  tx: Prisma.TransactionClient,
  parentId: string,
  direction?: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT",
) {
  const rows = direction
    ? await tx.$queryRaw<{ next: number }[]>(
        Prisma.sql`SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM payment_installments WHERE "orderId" = ${parentId}::uuid AND direction = ${direction}::"PaymentDirection"`,
      )
    : await tx.$queryRaw<{ next: number }[]>(
        Prisma.sql`SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM client_payment_installments WHERE "billingDocumentId" = ${parentId}::uuid`,
      );
  return rows[0]?.next ?? 1;
}
