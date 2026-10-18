import "server-only";
import Decimal from "decimal.js";
import { editVersion } from "@/lib/edit-version";

const cashFields = [
  "id",
  "updatedAt",
  "installmentId",
  "billingDocumentId",
  "amount",
  "settledAt",
  "receivedAt",
  "fxRateToReporting",
  "reference",
  "notes",
] as const;
const termFields = [
  "id",
  "updatedAt",
  "orderId",
  "billingDocumentId",
  "basis",
  "direction",
  "currencyCode",
  "dueDate",
  "expectedFxRateToReporting",
  "isCancelled",
  "label",
  "notes",
  "percentageRate",
  "scheduledAmount",
] as const;

function fields(record: object, names: readonly string[]) {
  const source = record as Record<string, unknown>;
  return Object.fromEntries(names.map((name) => [name, source[name]]));
}

/** Hash only authoritative values, independent of the caller's Prisma include shape. */
export function cashEditVersion(record: object) {
  return editVersion(fields(record, cashFields));
}

export function paymentTermEditVersion(
  record: object & {
    receipts?: readonly object[];
    settlements?: readonly object[];
  },
  base: Decimal.Value | null,
) {
  return editVersion({
    term: fields(record, termFields),
    base: base === null ? null : new Decimal(base).toString(),
    payments: (record.receipts ?? record.settlements ?? []).map((cash) =>
      fields(cash, cashFields),
    ),
  });
}

export const stalePaymentMessage =
  "Changed since editing began: payment, term or payment base. Your draft is retained. Reload the page and compare the latest values before retrying.";

export function paymentVersionMatches(
  expected: string | undefined,
  current: string,
) {
  return Boolean(expected && expected === current);
}

export function isPaymentWriteConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2034",
  );
}
