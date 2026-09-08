import Decimal from "decimal.js";
export function freightCoverageBreakdown(
  totalHt: string,
  freightHt: string,
  allocations: readonly {
    allocatedAmount: string;
    freightCoverageHt?: string | undefined;
  }[],
) {
  const total = new Decimal(totalHt),
    freight = new Decimal(freightHt);
  if (freight.isNegative() || freight.greaterThan(total))
    throw new Error("Freight coverage must be between zero and document HT.");
  let allocatedFreight = new Decimal(0),
    allocatedProduct = new Decimal(0);
  for (const allocation of allocations) {
    const amount = new Decimal(allocation.allocatedAmount),
      part = new Decimal(allocation.freightCoverageHt ?? "0");
    if (part.isNegative() || part.greaterThan(amount))
      throw new Error(
        "Order freight coverage cannot exceed its allocation HT.",
      );
    allocatedFreight = allocatedFreight.plus(part);
    allocatedProduct = allocatedProduct.plus(amount.minus(part));
  }
  if (allocatedFreight.greaterThan(freight))
    throw new Error(
      "Order freight allocations exceed document freight coverage.",
    );
  if (allocatedProduct.greaterThan(total.minus(freight)))
    throw new Error(
      "Order non-freight allocations exceed document non-freight HT. Identify the freight portion of the allocations.",
    );
  return {
    productHt: total.minus(freight).toFixed(4),
    allocatedFreightHt: allocatedFreight.toFixed(4),
    projectFreightHt: freight.minus(allocatedFreight).toFixed(4),
  };
}
