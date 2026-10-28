import "server-only";

import { Prisma } from "@/generated/prisma/client";

// Order intake can include several Billing allocations, terms and audit writes.
// Keep these atomic without relying on Prisma's five-second default deadline.
export const ORDER_INTAKE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 30_000,
} as const;
