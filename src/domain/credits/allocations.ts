import Decimal from "decimal.js";
import { remainingAfterCredits, type CreditAmount } from "./calculations";

export interface CreditAllocationAmount {
  orderId: string;
  amountHt: string;
  freightCoverageHt: string;
  otherCoverageHt: string;
}
const asAmount = (row: CreditAllocationAmount): CreditAmount => ({
  totalHt: row.amountHt,
  vatAmount: "0",
  freightCoverageHt: row.freightCoverageHt,
  otherCoverageHt: row.otherCoverageHt,
});
const nonzero = (row: CreditAmount) =>
  new Decimal(row.totalHt).plus(row.vatAmount).gt(0);

/** Every reduction is explicit; no proportional attribution and no invented reassignment. */
export function assertCreditAllocations(input: {
  original: CreditAmount;
  originalAllocations: readonly CreditAllocationAmount[];
  previous: readonly (CreditAmount & {
    allocations: readonly CreditAllocationAmount[];
  })[];
  credit: CreditAmount;
  allocations: readonly CreditAllocationAmount[];
}) {
  // New attribution must fit the new credit in each HT category.
  const projectPart = remainingAfterCredits(
    input.credit,
    input.allocations.map(asAmount),
  );
  for (const allocation of input.allocations) {
    const original = input.originalAllocations.find(
      (row) => row.orderId === allocation.orderId,
    );
    if (!original)
      throw new RangeError(
        "Choose only an Order already allocated to the original Invoice.",
      );
    remainingAfterCredits(asAmount(original), [
      ...input.previous.flatMap((credit) =>
        credit.allocations
          .filter((row) => row.orderId === allocation.orderId)
          .map(asAmount),
      ),
      asAmount(allocation),
    ]);
  }
  // Unallocated credit cannot silently reverse amounts belonging to other Orders.
  const unallocated = remainingAfterCredits(
    input.original,
    input.originalAllocations.map(asAmount).filter(nonzero),
  );
  remainingAfterCredits(unallocated, [
    ...input.previous
      .map((credit) =>
        remainingAfterCredits(credit, credit.allocations.map(asAmount)),
      )
      .filter(nonzero),
    ...[projectPart].filter(nonzero),
  ]);
}
